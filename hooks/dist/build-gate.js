"use strict";
// BuildGate: blocks code-writing tool calls until the plan is finalized (state.phase >= 7).
// Whitelists planning artifacts so phase skills can write to .archforge/ and root-level *.md.
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
const path = __importStar(require("path"));
const state_1 = require("./lib/state");
const WHITELIST_PREFIXES = [".archforge/", "docs/"];
const WHITELIST_FILES = new Set([
    "BUILD_PLAN.md",
    "BUILD_PLAN_CRITIQUE.md",
    "FINAL_REVIEW.md",
    "README.md",
    "LICENSE",
    ".gitignore",
]);
// Root-level *.md files (other than the whitelist above) are also allowed for planning notes.
const ALLOW_ROOT_MARKDOWN = true;
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
function isWhitelisted(absFilePath) {
    const root = (0, state_1.projectDir)();
    let rel = path.relative(root, absFilePath);
    rel = rel.replace(/\\/g, "/");
    if (rel.startsWith(".."))
        return false; // outside project — let other tools decide
    if (WHITELIST_FILES.has(rel))
        return true;
    for (const prefix of WHITELIST_PREFIXES) {
        if (rel.startsWith(prefix))
            return true;
    }
    if (ALLOW_ROOT_MARKDOWN && !rel.includes("/") && rel.endsWith(".md"))
        return true;
    return false;
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
    if (state.phase >= 7) {
        (0, state_1.emitAllow)();
        return;
    }
    if (isWhitelisted(filePath)) {
        (0, state_1.emitAllow)();
        return;
    }
    (0, state_1.emitDecision)({
        permissionDecision: "deny",
        reason: "ArchForge BuildGate: plan not finalized (state.phase=" +
            state.phase +
            "). Source-code edits are blocked until Phase 7. Run /archforge-status to inspect, /archforge-resume to continue planning, or finish Phase 6 user approval.",
    });
}
try {
    main();
}
catch (err) {
    // On unexpected errors, fail open (allow) so we don't brick the user's session.
    process.stderr.write("[archforge build-gate] error: " + String(err) + "\n");
    (0, state_1.emitAllow)();
}
