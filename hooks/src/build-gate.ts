// BuildGate: blocks code-writing tool calls until state.phase >= 7.
// Whitelists planning artifacts via shared isWhitelistedPath.

import {
  readHookEvent,
  readState,
  emitAllow,
  emitDecision,
  isWhitelistedPath,
} from "./lib/state";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function main(): void {
  const ev = readHookEvent();
  const tool = ev.tool_name || "";
  if (!WRITE_TOOLS.has(tool)) {
    emitAllow();
    return;
  }
  const input = ev.tool_input || {};
  const filePath = (input.file_path as string) || "";
  if (!filePath) {
    emitAllow();
    return;
  }
  const state = readState();
  if (state.phase >= 7) {
    emitAllow();
    return;
  }
  if (isWhitelistedPath(filePath)) {
    emitAllow();
    return;
  }
  emitDecision({
    permissionDecision: "deny",
    reason:
      "ArchForge BuildGate: plan not finalized (state.phase=" +
      state.phase +
      "). Source-code edits are blocked until Phase 7. Run /archforge:archforge-status to inspect, /archforge:archforge-resume to continue planning, or finish Phase 6 user approval.",
  });
}

try {
  main();
} catch (err) {
  // Fail open is intentional — we'd rather not brick the user's session.
  // The stderr message ensures the failure is VISIBLE, not silent.
  process.stderr.write(
    "[archforge build-gate] ERROR (failing open, source edits NOT gated this call): " +
      String(err) + "\n"
  );
  emitAllow();
}
