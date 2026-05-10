---
description: Phase 0 — Requirements mining. Infer everything from context, codebase, and the goal statement. No user questions. Write requirements.md autonomously.
---

# Phase 0 — Autonomous Requirements Mining

Goal: extract everything needed to design this system from the goal statement, existing codebase, and any available context. **Do not ask the user any questions.** The deliverable is `.archforge/requirements.md`.

## Process

### Step 1 — Mine context (no user input)

Gather information autonomously:

1. **Read the goal statement** from `state.json` — extract intent, domain, constraints
2. **Read the codebase** — glob src/, read package.json, tsconfig, .env.example, README. Understand what already exists.
3. **Web research if needed** — if the goal involves an unfamiliar technology or domain, run WebSearch/WebFetch to understand it. Every external fact must have a cited URL.
4. **Infer all requirement dimensions** from the above. Where inference is uncertain, mark as assumption — never leave a dimension blank.

### Step 2 — Self-rate confidence internally

Do this silently in your reasoning, not in the chat. Rate 0-100 across all 9 dimensions:
- Who uses this / Users & roles
- Success criteria (measurable)
- Scale
- Constraints (budget, deadline, tech stack)
- Data (sources, sensitivity, retention)
- Compliance
- Integrations
- Failure tolerance
- Reversibility

If any dimension scores < 50 → mark as **open assumption** with a reasonable default. Do NOT stop to ask.

### Step 3 — Write requirements.md immediately

```markdown
# Requirements — <project name>

_Autonomously inferred. Confidence: NN%. Open assumptions marked below._

## Goal (one sentence)
...

## Users & roles
...

## Success criteria (measurable)
...

## Scale assumptions
...

## Constraints
- Hard constraints: ...
- Soft preferences: ...
- Must-avoid: ...

## Data
...

## Compliance & security boundaries
...

## Integrations
...

## Failure tolerance & SLOs
...

## Open assumptions (inferred — verify if wrong)
- [ ] <assumption> [confidence: NN%]
- [ ] ...

## Out of scope (explicit non-goals)
- ...

## Evidence & citations
| Claim | Source URL |
|-------|-----------|
| <claim> | <url> |
```

**Every non-obvious claim must appear in the Evidence table with a real fetched URL.**

## Hard rules

- **Never use AskUserQuestion tool.**
- **Never wait for user input.**
- Uncertain dimensions → reasonable default + mark as open assumption.
- All external facts (benchmarks, library capabilities, API limits) → cited URL in Evidence table.
- Finish and advance to Phase 1 in a single pass.

## Versioning

If `.archforge/requirements.md` already exists, rename to `requirements-v<N>.md` first.

## Update state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=1; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

After writing, immediately hand off to `archforge-phase-1-architecture`.
