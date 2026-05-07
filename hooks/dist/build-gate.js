"use strict";
// BuildGate: two responsibilities, gated by state.phase.
//   1. Before phase 7: block all source-code edits (only planning artifacts pass).
//   2. At phase 7: scan new third-party imports in the diff. Any package not
//      already documented in .archforge/library-claims.md is denied — the
//      execute skill must record an evidence URL before the symbol can be used.
// Citation hallucination is the failure mode this prevents.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const state_1 = require("./lib/state");
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// Code extensions where import scanning runs. Other files (markdown, config
// JSON, etc.) skip the scan.
const SCANNED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py",
]);
// Node.js / Python / Deno standard libraries — never require library-claims entry.
const NODE_BUILTINS = new Set([
    "fs", "path", "os", "crypto", "http", "https", "url", "util", "stream",
    "events", "buffer", "child_process", "process", "querystring", "zlib",
    "net", "tls", "dns", "dgram", "cluster", "readline", "assert", "console",
    "module", "perf_hooks", "string_decoder", "timers", "tty", "v8", "vm",
    "worker_threads", "async_hooks", "fs/promises",
]);
const PY_STDLIB = new Set([
    "os", "sys", "re", "math", "json", "time", "datetime", "pathlib",
    "typing", "collections", "itertools", "functools", "subprocess",
    "logging", "argparse", "io", "tempfile", "shutil", "glob", "csv",
    "sqlite3", "asyncio", "threading", "multiprocessing", "queue", "socket",
    "urllib", "http", "ssl", "hashlib", "base64", "uuid", "random",
    "string", "textwrap", "unicodedata", "decimal", "fractions",
    "abc", "dataclasses", "enum", "contextlib", "warnings", "weakref",
    "copy", "pickle", "struct", "array", "binascii", "zlib", "gzip",
    "tarfile", "zipfile", "platform", "traceback", "inspect",
]);
function packageRoot(spec) {
    // Strip subpath imports: "stripe/lib/foo" → "stripe", "@scope/pkg/sub" → "@scope/pkg".
    if (spec.startsWith("@")) {
        const parts = spec.split("/");
        return parts.length >= 2 ? parts[0] + "/" + parts[1] : spec;
    }
    return spec.split("/")[0];
}
function extractImports(content) {
    const found = new Set();
    // ES modules: import X from 'pkg' / import 'pkg' / import * as X from "pkg"
    const esmRe = /\bimport\s+(?:[\w*{},\s]+?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = esmRe.exec(content)) !== null) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("/"))
            continue;
        if (spec.startsWith("node:"))
            continue;
        found.add(packageRoot(spec));
    }
    // CommonJS: require('pkg')
    const cjsRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = cjsRe.exec(content)) !== null) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("/"))
            continue;
        if (spec.startsWith("node:"))
            continue;
        found.add(packageRoot(spec));
    }
    // Python: from pkg import X / import pkg
    const pyFromRe = /^\s*from\s+([\w.]+)\s+import\b/gm;
    while ((m = pyFromRe.exec(content)) !== null) {
        const spec = m[1];
        if (spec.startsWith("."))
            continue;
        found.add(spec.split(".")[0]);
    }
    const pyImportRe = /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?\s*$/gm;
    while ((m = pyImportRe.exec(content)) !== null) {
        const spec = m[1];
        if (spec.startsWith("."))
            continue;
        found.add(spec.split(".")[0]);
    }
    return Array.from(found);
}
function isStdlib(pkg, ext) {
    if (ext === ".py")
        return PY_STDLIB.has(pkg);
    return NODE_BUILTINS.has(pkg);
}
function readLibraryClaims() {
    const f = path.join((0, state_1.archforgeDir)(), "library-claims.md");
    const documented = new Set();
    let raw;
    try {
        raw = fs.readFileSync(f, "utf8");
    }
    catch {
        return documented;
    }
    // Match table rows: "| package | symbol | https://... | summary | ts |"
    // Accept either pipe-table or fenced code; extract first cell that looks like a package.
    const rowRe = /^\s*\|\s*([@\w][\w@/-]*)\s*\|/gm;
    let m;
    while ((m = rowRe.exec(raw)) !== null) {
        const pkg = m[1];
        if (pkg === "Package" || pkg === "---" || pkg === ":---" || pkg === "----")
            continue;
        documented.add(pkg);
    }
    return documented;
}
function contentFromInput(tool, input) {
    switch (tool) {
        case "Write":
            return input.content || "";
        case "Edit": {
            const oldS = input.old_string || "";
            const newS = input.new_string || "";
            // Conservative: scan both old_string and new_string. If either references
            // a new import, we want to know — though typically only new_string matters.
            return newS + "\n" + oldS;
        }
        case "MultiEdit": {
            const edits = input.edits || [];
            return edits
                .map((e) => (e.new_string || "") + "\n" + (e.old_string || ""))
                .join("\n");
        }
        case "NotebookEdit":
            return input.new_source || "";
        default:
            return "";
    }
}
function main() {
    const ev = (0, state_1.readHookEvent)();
    const tool = ev.tool_name || "";
    if (!WRITE_TOOLS.has(tool)) {
        (0, state_1.emitAllow)();
        return;
    }
    const input = ev.tool_input || {};
    const filePath = input.file_path || "";
    if (!filePath) {
        (0, state_1.emitAllow)();
        return;
    }
    const state = (0, state_1.readState)();
    // ---- Pre-Phase 7: block all source edits, allow planning artifacts ----
    if (state.phase < 7) {
        if ((0, state_1.isWhitelistedPath)(filePath)) {
            (0, state_1.emitAllow)();
            return;
        }
        (0, state_1.emitDecision)({
            permissionDecision: "deny",
            reason: "ArchForge BuildGate: plan not finalized (state.phase=" +
                state.phase +
                "). Source-code edits are blocked until Phase 7. Run /archforge:archforge-status to inspect, /archforge:archforge-resume to continue planning, or finish Phase 6 user approval.",
        });
        return;
    }
    // ---- Phase 7: import scanner ----
    const ext = path.extname(filePath).toLowerCase();
    if (!SCANNED_EXTENSIONS.has(ext)) {
        (0, state_1.emitAllow)();
        return;
    }
    const content = contentFromInput(tool, input);
    if (!content) {
        (0, state_1.emitAllow)();
        return;
    }
    const imports = extractImports(content);
    if (imports.length === 0) {
        (0, state_1.emitAllow)();
        return;
    }
    const documented = readLibraryClaims();
    const undocumented = imports.filter((pkg) => !isStdlib(pkg, ext) && !documented.has(pkg));
    if (undocumented.length === 0) {
        (0, state_1.emitAllow)();
        return;
    }
    (0, state_1.emitDecision)({
        permissionDecision: "deny",
        reason: "ArchForge BuildGate (Phase 7): import of undocumented third-party package(s): " +
            undocumented.join(", ") +
            ". Before using any third-party API, run WebFetch on the official docs and append a row to .archforge/library-claims.md with the package name, the specific symbol used, the fetched URL, and a 1-sentence summary. Then retry the edit. This prevents hallucinated API usage.",
    });
}
try {
    main();
}
catch (err) {
    // Fail open is intentional — we'd rather not brick the user's session.
    // The stderr message ensures the failure is VISIBLE, not silent.
    process.stderr.write("[archforge build-gate] ERROR (failing open, source edits NOT gated this call): " +
        String(err) + "\n");
    (0, state_1.emitAllow)();
}
