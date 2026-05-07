"use strict";
// LoopGuard: detects edit loops (counter-edits, minimal-variation churn,
// same-file frequency). Logs every Edit/Write to .archforge/.cache/edits.log.
Object.defineProperty(exports, "__esModule", { value: true });
const state_1 = require("./lib/state");
const WINDOW_MS = 15 * 60 * 1000;
const MIN_VAR_WINDOW_MS = 5 * 60 * 1000;
const WARN_SAME_FILE = 4;
const STOP_MIN_VAR = 3;
const MIN_VAR_LEN_TOLERANCE = 0.15;
const TRACKED_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
function detectCounterEdit(current, recent) {
    for (const e of recent) {
        if (e.file !== current.file)
            continue;
        if (e.ts === current.ts)
            continue;
        if (e.old_hash === current.new_hash && e.new_hash === current.old_hash) {
            return e;
        }
    }
    return null;
}
function detectMinimalVariationCluster(current, recent) {
    const cutoff = Date.now() - MIN_VAR_WINDOW_MS;
    const sameFile = recent.filter((e) => e.file === current.file && e.ts >= cutoff);
    if (sameFile.length < STOP_MIN_VAR - 1)
        return [];
    const cluster = sameFile.filter((e) => {
        const ratio = Math.abs(e.new_len - current.new_len) /
            Math.max(e.new_len, current.new_len, 1);
        return ratio <= MIN_VAR_LEN_TOLERANCE;
    });
    cluster.push(current);
    return cluster.length >= STOP_MIN_VAR ? cluster : [];
}
function countSameFile(current, recent) {
    return recent.filter((e) => e.file === current.file).length + 1;
}
function buildEntry(ev) {
    const tool = ev.tool_name || "";
    if (!TRACKED_TOOLS.has(tool))
        return null;
    const input = ev.tool_input || {};
    const file = input.file_path || "";
    if (!file)
        return null;
    let oldStr = "";
    let newStr = "";
    if (tool === "Write") {
        newStr = input.content || "";
    }
    else {
        oldStr = input.old_string || "";
        newStr = input.new_string || "";
    }
    return {
        ts: Date.now(),
        tool,
        file,
        old_hash: (0, state_1.fullHash)(oldStr),
        new_hash: (0, state_1.fullHash)(newStr),
        new_len: newStr.length,
    };
}
function main() {
    const ev = (0, state_1.readHookEvent)();
    const entry = buildEntry(ev);
    if (!entry) {
        (0, state_1.emitAllow)();
        return;
    }
    const recent = (0, state_1.readEditLog)(WINDOW_MS);
    (0, state_1.appendEditLog)(entry);
    const counterMatch = detectCounterEdit(entry, recent);
    if (counterMatch) {
        (0, state_1.emitDecision)({
            permissionDecision: "deny",
            reason: "ArchForge LoopGuard: counter-edit detected on " +
                entry.file +
                " — this edit reverses a recent change (prior at " +
                new Date(counterMatch.ts).toISOString() +
                "). STOP. Summarize what you have tried, why it didn't work, and return to Phase 5 (critique) before editing again. Do NOT ad-hoc fix.",
        });
        return;
    }
    const cluster = detectMinimalVariationCluster(entry, recent);
    if (cluster.length >= STOP_MIN_VAR) {
        (0, state_1.emitDecision)({
            permissionDecision: "deny",
            reason: "ArchForge LoopGuard: " +
                cluster.length +
                " minimal-variation diffs in " +
                entry.file +
                " within 5 min. STOP. You appear to be churning. Summarize the goal, the symptom, and what you've tried. Return to planning.",
        });
        return;
    }
    const sameFileCount = countSameFile(entry, recent);
    if (sameFileCount >= WARN_SAME_FILE) {
        (0, state_1.emitDecision)({
            permissionDecision: "allow",
            additionalContext: "ArchForge LoopGuard WARNING: " +
                sameFileCount +
                " edits to " +
                entry.file +
                " in 15 min. If you're iterating on a fix, stop and verify the root cause before the next edit.",
        });
        return;
    }
    (0, state_1.emitAllow)();
}
try {
    main();
}
catch (err) {
    process.stderr.write("[archforge loopguard] ERROR (failing open, no loop detection this call): " +
        String(err) + "\n");
    (0, state_1.emitAllow)();
}
