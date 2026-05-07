---
description: Phase 4 — Build order. Topologically sort components, define a tracer-bullet path, write the build plan with per-step verification. Topological order is a design choice; time estimates and framework-specific test claims must be cited.
---

# Phase 4 — Build Order

Goal: produce a build plan so concrete that execution is mechanical. Topology and ordering are pure logic (`design_choice`). Anything that asserts "this will take N hours" or "framework X supports test pattern Y" is a **claim** — cite it. See `skills/_shared/claim-schema.md`.

Inputs: `.archforge/components.md`, `.archforge/risks-resolved.md`
Outputs: `.archforge/build-plan.md`, `.archforge/claims-phase4.json`

## Process

### Step 1 — Topological sort

Use the dependency graph from Phase 2. Order components so each depends only on already-built ones. If the graph has a cycle, **stop and return to Phase 2** — you cannot proceed.

Topological ordering is a `design_choice` — no citation needed.

### Step 2 — Tracer bullet

Define the **minimum end-to-end path** through the system that exercises every layer (UI → API → DB, or sensor → pipeline → output). The tracer bullet is what you build first — a thin slice that proves the architecture works before any feature gets fleshed out.

Tracer-bullet selection is `design_choice` — no citation needed unless you assert "tracer bullets reduce integration risk" with a specific number; then cite.

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
**Estimated time:** <hours/days> — basis: <citation or prior-project reference>

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

---

## Step 5 — Citation gate (MANDATORY before save)

What is a claim in this phase:

| Statement | Is it a claim? | Confidence |
|-----------|----------------|------------|
| "Step 3 takes ~4 hours based on similar Drizzle migration in repo X" | Yes | `verified` (cite the repo or prior commit) |
| "Build order is A → B → C" | No | `design_choice` |
| "Vitest's `describe.concurrent` runs tests in parallel; safe for our pure-function tests" | Yes | `verified` |
| "Tracer bullet covers UI → API → DB" | No | `design_choice` |
| "We cut after Step 5 if behind schedule" | No | `design_choice` |
| "GitHub Actions free tier provides 2000 min/mo for private repos" | Yes | `verified` |

Build `.archforge/claims-phase4.json` per schema:

```json
{
  "phase": 4,
  "generated_at": "2026-05-07T12:00:00Z",
  "claims": [
    {
      "id": "P4-C1",
      "claim": "Vitest's `--coverage` reporter integrates with v8 by default since v1.0",
      "evidence_url": "https://vitest.dev/guide/coverage",
      "evidence_summary": "Vitest 1.0+ ships with `@vitest/coverage-v8` and `@vitest/coverage-istanbul`; v8 is the default.",
      "context": "Step 7 — testing setup",
      "scenario": "library_behavior",
      "confidence": "verified"
    }
  ]
}
```

Run the validation gate:

```bash
node -e '
const fs = require("fs"), path = require("path");
const f = process.env.CLAUDE_PROJECT_DIR + "/.archforge/claims-phase4.json";
const d = JSON.parse(fs.readFileSync(f, "utf8"));
const kept = [], dropped = [];
for (const c of (d.claims || [])) {
  if (c.confidence === "design_choice") { kept.push(c); continue; }
  const url = c.evidence_url || "";
  if (!/^https?:\/\/[^\s<>]+\.[a-z]{2,}/i.test(url)) {
    dropped.push({id: c.id, claim: c.claim, reason: "missing_or_invalid_url"});
    continue;
  }
  kept.push(c);
}
d.claims = kept;
fs.writeFileSync(f, JSON.stringify(d, null, 2));
const logP = path.join(path.dirname(f), ".cache", "dropped-claims.log");
fs.mkdirSync(path.dirname(logP), {recursive: true});
for (const e of dropped) fs.appendFileSync(logP, JSON.stringify({ts: new Date().toISOString(), phase: 4, ...e}) + "\n");
console.log(JSON.stringify({kept: kept.length, dropped: dropped.length, details: dropped}));
'
```

For each dropped claim: cite real evidence, or remove the assertion from `build-plan.md`. Re-run until `dropped == 0`.

## Versioning

If output exists, rename to `build-plan-vN.md` and `claims-phase4-vN.json`.

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
- Any step lacks an "Estimated time" with cited basis
- The tracer bullet is missing or doesn't cover end-to-end
- No cut points are identified
- `claims-phase4.json` does not exist or its validation run shows `dropped > 0`

Hand off to `archforge-phase-5-critique`.
