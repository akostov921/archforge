---
description: Phase 4 — Build order. Topologically sort components, define a tracer-bullet path, write the build plan with per-step verification.
---

# Phase 4 — Build Order

Goal: produce a build plan so concrete that execution is mechanical.

Inputs: `.archforge/components.md`, `.archforge/risks-resolved.md`
Output: `.archforge/build-plan.md`

## Process

### Step 1 — Topological sort

Use the dependency graph from Phase 2. Order components so each depends only on already-built ones. If the graph has a cycle, **stop and return to Phase 2** — you cannot proceed.

### Step 2 — Tracer bullet

Define the **minimum end-to-end path** through the system that exercises every layer (UI → API → DB, or sensor → pipeline → output). The tracer bullet is what you build first — a thin slice that proves the architecture works before any feature gets fleshed out.

### Step 3 — Per-step plan

For each step in build order:

```markdown
## Step N — <component or feature>

**Goal:** what is "done" for this step (testable)

**Files to create/modify:**
- path/to/file.ts — purpose
- path/to/test.ts — purpose

**Verification:**
- [ ] Unit tests pass: `<exact command>`
- [ ] Integration test: `<exact command or manual check>`
- [ ] Visual check (if UI): what page, what to look for

**Done criterion (binary):** ...
**Estimated effort:** S | M | L

**Blocks:** Step N+1 starts only after this step's done criterion is true.
```

### Step 4 — Cut points

Identify the **cut points** — places where if the build is going badly, you can ship a useful subset and defer the rest. Mark them in the step list.

## Output: `.archforge/build-plan.md`

Structure:

```markdown
# Build Plan

## Tracer bullet
<description of the thin end-to-end slice>

## Build order
1. ... (Step 1)
2. ... (Step 2)
...

## Step details
[per-step blocks as above]

## Cut points
- After Step N: shippable subset is ... (omits ...)
- After Step M: shippable subset is ...

## Test commands
- Run all unit tests: `<cmd>`
- Run integration tests: `<cmd>`
- Run E2E tests: `<cmd>`
```

## Versioning

If output exists, rename to `build-plan-vN.md`.

## Update state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=5; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Do NOT proceed if
- Any step lacks an explicit "Done criterion (binary)"
- Any step lacks a verification command/check
- The tracer bullet is missing or doesn't cover end-to-end
- No cut points are identified

Hand off to `archforge-phase-5-critique`.
