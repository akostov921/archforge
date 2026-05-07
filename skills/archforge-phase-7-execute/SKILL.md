---
description: Phase 7 — Execute. Build strictly per the build-plan, one step at a time, with verification before advancing. LoopGuard is active throughout. Every third-party library API used in code must have a cited entry in library-claims.md.
---

# Phase 7 — Build Execution

Goal: convert the build plan into working code, mechanically, one step at a time, with verification at each step. **No new third-party library API may be used in code without first logging a cited entry to `library-claims.md`** — the BuildGate hook scans imports and denies edits that introduce uncited dependencies. See `skills/_shared/claim-schema.md`.

Input: `.archforge/build-plan.md`, `.archforge/components.md`, `.archforge/risks-resolved.md`
Outputs: actual source code in the user's project; `.archforge/progress.md` log; `.archforge/library-claims.md`

## Pre-flight check

1. Confirm `state.phase == 7`. If not, refuse to start — direct the user to `/archforge-status`.
2. Confirm `build-plan.md` exists and lists steps.
3. Initialize `.archforge/progress.md`:

```markdown
# Build Progress

| Step | Description | Status | Started | Completed | Notes |
|------|-------------|--------|---------|-----------|-------|
```

4. Initialize `.archforge/library-claims.md` if missing:

```markdown
# Library Claims

Every third-party library imported during Phase 7 must appear here with a verified URL describing the API used.

| Package | Symbol used | Evidence URL | Evidence summary | Verified at |
|---------|-------------|--------------|------------------|-------------|
```

## Per-step loop

For each step in `build-plan.md`, in order:

### 1. Mark in_progress
Append a row to `progress.md`: `| N | <desc> | in_progress | <ISO ts> |  |  |`

### 2. Pre-implement library research

Before writing code for the step:

- List every third-party package the step will import.
- For each package + symbol you intend to use that is **not already** in `library-claims.md`:
  - Run `WebFetch` on the official docs page for that symbol.
  - Append a row to `library-claims.md`:

```markdown
| stripe | PaymentIntent.create | https://docs.stripe.com/api/payment_intents/create | Accepts amount, currency, idempotency_key. Returns PaymentIntent with status. | 2026-05-07T12:00:00Z |
```

The BuildGate hook scans `Edit`/`Write`/`MultiEdit` content for `import` / `require` / `from X import` statements. Any third-party package not in the table → **deny** with reason "verify library API and append to library-claims.md before importing". Standard library and relative imports are exempt.

### 3. Implement
- Create/modify only the files listed for this step. Nothing more.
- If you discover the plan is wrong (a file should be different than planned), **stop** — do not silently deviate. Add a row to progress.md noting the deviation, return to phase 5 (critique) to verify the change.

### 4. Verify
- Run the verification commands from the build plan.
- If verification fails: **STOP** — do not loop on fixes. Write the failure to progress.md and return to phase 5. The LoopGuard hook will enforce this if you forget.

### 5. Mark completed
Update the row: `| N | <desc> | completed | <start> | <end> | <notes> |`

### 6. Cannot start step N+1 until step N is `completed`

This is enforced by you reading `progress.md` before starting any step.

## When to STOP and not just keep trying

- Any test failure → stop, return to phase 5
- Any unexpected error you don't immediately understand → stop, investigate before editing
- Any LoopGuard or BuildGate deny → respect it, stop, summarize what you've tried, return to phase 5
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
Library claims logged: M

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
- BuildGate hook is active — new third-party imports require a prior `library-claims.md` row with a fetched URL. Citation hallucination is forbidden; if you cannot find the docs, you cannot use the symbol.
- Do not modify `.archforge/*.md` artifacts during execution except `progress.md`, `done.md`, and `library-claims.md`. The plan is locked.
