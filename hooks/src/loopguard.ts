// LoopGuard: detects edit loops (counter-edits, minimal-variation diffs, churn).
// Logs every Edit/Write to .archforge/.cache/edits.log and stops Claude when a loop is detected.

import {
  readHookEvent,
  readEditLog,
  appendEditLog,
  shortHash,
  emitAllow,
  emitDecision,
  EditLogEntry,
} from "./lib/state";

const WINDOW_MS = 15 * 60 * 1000; // 15 min total tracking window
const MIN_VAR_WINDOW_MS = 5 * 60 * 1000; // 5 min for "minimal-variation" cluster
const WARN_SAME_FILE = 4;
const STOP_MIN_VAR = 3;
const MIN_VAR_LEN_TOLERANCE = 0.15; // ±15% length difference counts as "similar"

const TRACKED_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function detectCounterEdit(
  current: EditLogEntry,
  recent: EditLogEntry[]
): EditLogEntry | null {
  for (const e of recent) {
    if (e.file !== current.file) continue;
    if (e.ts === current.ts) continue;
    // Counter-edit: prior event swapped what current is now swapping back.
    if (e.old_hash === current.new_hash && e.new_hash === current.old_hash) {
      return e;
    }
  }
  return null;
}

function detectMinimalVariationCluster(
  current: EditLogEntry,
  recent: EditLogEntry[]
): EditLogEntry[] {
  const cutoff = Date.now() - MIN_VAR_WINDOW_MS;
  const sameFile = recent.filter(
    (e) => e.file === current.file && e.ts >= cutoff
  );
  if (sameFile.length < STOP_MIN_VAR - 1) return [];
  const cluster = sameFile.filter((e) => {
    const ratio = Math.abs(e.new_len - current.new_len) / Math.max(e.new_len, current.new_len, 1);
    return ratio <= MIN_VAR_LEN_TOLERANCE;
  });
  cluster.push(current);
  return cluster.length >= STOP_MIN_VAR ? cluster : [];
}

function countSameFile(current: EditLogEntry, recent: EditLogEntry[]): number {
  return recent.filter((e) => e.file === current.file).length + 1;
}

function buildEntry(ev: ReturnType<typeof readHookEvent>): EditLogEntry | null {
  const tool = ev.tool_name || "";
  if (!TRACKED_TOOLS.has(tool)) return null;
  const input = ev.tool_input || {};
  const file = (input.file_path as string) || "";
  if (!file) return null;
  let oldStr = "";
  let newStr = "";
  if (tool === "Write") {
    newStr = (input.content as string) || "";
  } else {
    oldStr = (input.old_string as string) || "";
    newStr = (input.new_string as string) || "";
  }
  return {
    ts: Date.now(),
    tool,
    file,
    old_hash: shortHash(oldStr),
    new_hash: shortHash(newStr),
    new_len: newStr.length,
  };
}

function main(): void {
  const ev = readHookEvent();
  const entry = buildEntry(ev);
  if (!entry) {
    emitAllow();
    return;
  }
  const recent = readEditLog(WINDOW_MS);
  appendEditLog(entry);

  const counterMatch = detectCounterEdit(entry, recent);
  if (counterMatch) {
    emitDecision({
      permissionDecision: "deny",
      reason:
        "ArchForge LoopGuard: counter-edit detected on " +
        entry.file +
        " — this edit reverses a recent change (prior at " +
        new Date(counterMatch.ts).toISOString() +
        "). STOP. Summarize what you have tried, why it didn't work, and return to Phase 5 (critique) before editing again. Do NOT ad-hoc fix.",
    });
    return;
  }

  const cluster = detectMinimalVariationCluster(entry, recent);
  if (cluster.length >= STOP_MIN_VAR) {
    emitDecision({
      permissionDecision: "deny",
      reason:
        "ArchForge LoopGuard: " +
        cluster.length +
        " minimal-variation diffs in " +
        entry.file +
        " within 5 min. STOP. You appear to be churning. Summarize the goal, the symptom, and what you've tried. Return to planning.",
    });
    return;
  }

  const sameFileCount = countSameFile(entry, recent);
  if (sameFileCount >= WARN_SAME_FILE) {
    emitDecision({
      permissionDecision: "allow",
      additionalContext:
        "ArchForge LoopGuard WARNING: " +
        sameFileCount +
        " edits to " +
        entry.file +
        " in 15 min. If you're iterating on a fix, stop and verify the root cause before the next edit.",
    });
    return;
  }

  emitAllow();
}

try {
  main();
} catch (err) {
  process.stderr.write("[archforge loopguard] error: " + String(err) + "\n");
  emitAllow();
}
