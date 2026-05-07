// BuildGate: blocks code-writing tool calls until the plan is finalized (state.phase >= 7).
// Whitelists planning artifacts so phase skills can write to .archforge/ and root-level *.md.

import * as path from "path";
import {
  readHookEvent,
  readState,
  emitAllow,
  emitDecision,
  projectDir,
} from "./lib/state";

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

function isWhitelisted(absFilePath: string): boolean {
  const root = projectDir();
  let rel = path.relative(root, absFilePath);
  rel = rel.replace(/\\/g, "/");
  if (rel.startsWith("..")) return false; // outside project — let other tools decide
  if (WHITELIST_FILES.has(rel)) return true;
  for (const prefix of WHITELIST_PREFIXES) {
    if (rel.startsWith(prefix)) return true;
  }
  if (ALLOW_ROOT_MARKDOWN && !rel.includes("/") && rel.endsWith(".md")) return true;
  return false;
}

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
  if (isWhitelisted(filePath)) {
    emitAllow();
    return;
  }
  emitDecision({
    permissionDecision: "deny",
    reason:
      "ArchForge BuildGate: plan not finalized (state.phase=" +
      state.phase +
      "). Source-code edits are blocked until Phase 7. Run /archforge-status to inspect, /archforge-resume to continue planning, or finish Phase 6 user approval.",
  });
}

try {
  main();
} catch (err) {
  // On unexpected errors, fail open (allow) so we don't brick the user's session.
  process.stderr.write("[archforge build-gate] error: " + String(err) + "\n");
  emitAllow();
}
