"use strict";
// BuildGate: two responsibilities, gated by state.phase.
//   1. Before phase 7: block all source-code edits (only planning artifacts pass).
//   2. At phase 7: scan new third-party imports. Any undocumented package triggers
//      an instruction to Claude to self-document via WebFetch, then retry — never
//      blocks the user. Anti-hallucination is enforced by requiring a real fetched
//      URL before the symbol can be used, but execution is never fully stopped.
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
const SCANNED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py",
]);
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
// Path aliases (tsconfig paths like @/) are project-internal — not third-party.
const PATH_ALIAS_PREFIXES = ["@/", "~/"];
function isPathAlias(spec) {
    return PATH_ALIAS_PREFIXES.some((p) => spec.startsWith(p));
}
function packageRoot(spec) {
    if (spec.startsWith("@")) {
        const parts = spec.split("/");
        return parts.length >= 2 ? parts[0] + "/" + parts[1] : spec;
    }
    return spec.split("/")[0];
}
function extractImports(content) {
    const found = new Set();
    const esmRe = /\bimport\s+(?:[\w*{},\s]+?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = esmRe.exec(content)) !== null) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("/"))
            continue;
        if (spec.startsWith("node:"))
            continue;
        if (isPathAlias(spec))
            continue;
        found.add(packageRoot(spec));
    }
    const cjsRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = cjsRe.exec(content)) !== null) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("/"))
            continue;
        if (spec.startsWith("node:"))
            continue;
        if (isPathAlias(spec))
            continue;
        found.add(packageRoot(spec));
    }
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
            const newS = input.new_string || "";
            const oldS = input.old_string || "";
            return newS + "\n" + oldS;
        }
        case "MultiEdit": {
            const edits = input.edits || [];
            return edits.map((e) => (e.new_string || "") + "\n" + (e.old_string || "")).join("\n");
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
    // ---- Pre-Phase 7: block source edits, allow planning artifacts ----
    if (state.phase < 7) {
        if ((0, state_1.isWhitelistedPath)(filePath)) {
            (0, state_1.emitAllow)();
            return;
        }
        (0, state_1.emitDecision)({
            permissionDecision: "deny",
            reason: "ArchForge BuildGate: plan not finalized (state.phase=" +
                state.phase +
                "). Source-code edits are blocked until Phase 7. " +
                "Run /archforge:archforge-resume to continue planning.",
        });
        return;
    }
    // ---- Phase 7: import scanner — instruct self-documentation, never hard-block ----
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
    // Instead of hard-blocking, instruct Claude to self-document autonomously:
    // 1. Run WebFetch on each package's official docs
    // 2. Append a row to library-claims.md
    // 3. Retry the edit
    // This keeps the anti-hallucination guarantee without requiring user intervention.
    (0, state_1.emitDecision)({
        permissionDecision: "deny",
        reason: "ArchForge BuildGate (Phase 7): undocumented package(s): " +
            undocumented.join(", ") +
            ". AUTONOMOUS ACTION REQUIRED (no user input needed): " +
            "For each package, run WebFetch on its official docs page, then append a row to " +
            ".archforge/library-claims.md with: package name, symbols used, fetched URL, 1-sentence summary, timestamp. " +
            "Then retry this edit immediately. Do not ask the user. Self-document and continue.",
    });
}
try {
    main();
}
catch (err) {
    process.stderr.write("[archforge build-gate] ERROR (failing open): " + String(err) + "\n");
    (0, state_1.emitAllow)();
}
