---
description: Phase 7 — Execute. Build strictly per the build-plan, one step at a time, with verification before advancing. LoopGuard is active throughout.
---

# Phase 7 — Build Execution

Goal: convert the build plan into working code, mechanically, one step at a time, with verification at each step.

Input: `.archforge/build-plan.md`, `.archforge/components.md`, `.archforge/risks-resolved.md`
Outputs: actual source code in the user's project; `.archforge/progress.md` log

## Pre-flight check

1. Confirm `state.phase == 7`. If not, refuse to start — direct the user to `/archforge-status`.
2. Confirm `build-plan.md` exists and lists steps.
3. Initialize `.archforge/progress.md`:

```markdown
# Build Progress

| Step | Description | Status | Started | Completed | Notes |
|------|-------------|--------|---------|-----------|-------|
```

## Per-step loop

For each step in `build-plan.md`, in order:

### 1. Mark in_progress
Append a row to `progress.md`: `| N | <desc> | in_progress | <ISO ts> |  |  |`

### 2. Implement
- Create/modify only the files listed for this step. Nothing more.
- If you discover the plan is wrong (a file should be different than planned), **stop** — do not silently deviate. Add a row to progress.md noting the deviation, return to phase 5 (critique) to verify the change.

### 3. Verify
- Run the verification commands from the build plan.
- If verification fails: **STOP** — do not loop on fixes. Write the failure to progress.md and return to phase 5. The LoopGuard hook will enforce this if you forget.

### 4. Mark completed
Update the row: `| N | <desc> | completed | <start> | <end> | <notes> |`

### 5. Cannot start step N+1 until step N is `completed`

This is enforced by you reading `progress.md` before starting any step.

## When to STOP and not just keep trying

- Any test failure → stop, return to phase 5
- Any unexpected error you don't immediately understand → stop, investigate before editing
- Any LoopGuard deny → respect it, stop, summarize what you've tried, return to phase 5
- User asks you to stop → stop

The principle: **a single failed step is a planning problem, not an execution problem.** Don't ad-hoc fix.

## On final step completion

1. Write `.archforge/done.md`:
```markdown
# ArchForge run complete

Goal: ...
Triage: ...
Steps completed: N / N
Total critique cycles: ...

## What got built
- file1.ts — ...
- file2.ts — ...
...

## Known follow-ups
- [ ] ... (deferred from risks-resolved.md)
- [ ] ... (cut after step M, see build-plan.md)
```

2. Tell the user the run is complete and summarize.

## Hard rules

- One step at a time. Always.
- Verification before mark-complete. Always.
- On failure: STOP. Do not loop.
- LoopGuard hook is active — counter-edits and minimal-variation churn will be denied. Respect the deny; do not retry.
- Do not modify `.archforge/*.md` artifacts during execution except `progress.md` and `done.md`. The plan is locked.
