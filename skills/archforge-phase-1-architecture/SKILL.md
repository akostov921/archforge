---
description: Phase 1 — Architecture exploration. Generate 3-7 alternative architectures, stress-test each, pick a winner with explicit comparison. Reads requirements.md.
---

# Phase 1 — Architecture Exploration

Goal: avoid premature commitment. Force yourself to consider real alternatives, not just the first one that came to mind.

Inputs: `.archforge/requirements.md`
Outputs: `.archforge/architecture-options.md`, `.archforge/stress-tests.md`, `.archforge/decision.md`

## Process

### Step 1 — Generate options (minimum 3, target 5-7)

Write `.archforge/architecture-options.md`. For each option:

```markdown
## Option N — <short name>

**One-line summary:** ...

**Components:** ...

**Tech choices:** ...

**Cost shape:** ... (fixed/variable/cliff)

**Strengths:** ...

**Weaknesses:** ...

**Best when:** ... (the scenario where this option dominates)
```

Hard rule: at least 3 options. If you find yourself only considering variations of the same shape (e.g. "Next.js with Postgres", "Next.js with MySQL"), force a structurally different option (e.g. "static site + serverless functions", "monolith on a single VM", "event-sourced + CQRS"). Diversity matters.

### Step 2 — Stress-test each option

Write `.archforge/stress-tests.md`. For each option, run it through these scenarios:

- **10x scale** of the requirements doc's load assumption
- **Security boundary** — what's the worst that happens if the most-attacked component is compromised?
- **Edge cases** — empty input, partial network, concurrent writers, schema migration mid-traffic
- **Change requirements** — if the user pivots to a related but different goal in 6 months, how much of this option survives?
- **Cost cliff** — what user/data/request volume turns the bill from $X to $10X?
- **Team scaling** — if 5 more devs need to work on this, where does the architecture serialize them?

For each (option, scenario) pair, write 1-3 sentences. Be specific about the failure mode.

### Step 3 — Decide

Write `.archforge/decision.md`:

```markdown
# Architecture Decision

## Chosen: Option <N> — <name>

## Why this beat the alternatives
- vs. Option A: ...
- vs. Option B: ...
- ...

## Conditions under which this would be wrong
- If <X>, prefer Option <Y>.

## Reversibility
- This decision can be reversed in <effort estimate>.
- The point of no return is when <X> happens (e.g. customers depend on a public API contract, data is in a vendor-locked store, etc.)
```

## Versioning

If any output file exists, rename existing to `*-vN.md` first.

## Update state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=2; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Do NOT proceed if
- Fewer than 3 options were generated
- Any option lacks all 6 stress-test scenarios
- `decision.md` lacks the "conditions under which this would be wrong" section

Hand off to `archforge-phase-2-components`.
