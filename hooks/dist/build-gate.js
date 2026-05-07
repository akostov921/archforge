"use strict";
// BuildGate: blocks code-writing tool calls until state.phase >= 7.
// Whitelists planning artifacts via shared isWhitelistedPath.
Object.defineProperty(exports, "__esModule", { value: true });
const state_1 = require("./lib/state");
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
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
