---
description: Phase 6 — User final approval. Generate executive summary from all phase outputs and request explicit user approval. The only mandatory user touchpoint after triage.
---

# Phase 6 — User Final Approval

Goal: give the user a single screen of signal so they can decide GO / NO-GO.

Input: every `.archforge/*.md`
Output: `.archforge/summary.md` + a user prompt

## Process

### Step 1 — Generate executive summary

Write `.archforge/summary.md`:

```markdown
# ArchForge — Plan Summary for Approval

**Goal:** <one sentence from requirements.md>

**Triage path:** <quick | feature | product>

**Critique cycles:** <state.critique_cycles>

---

## Architecture (one paragraph)
<distilled from decision.md — what was chosen and why, in 3-5 sentences>

## Components (table)
| Component | Responsibility | Owns |
|-----------|----------------|------|
| ... | ... | ... |

## Critical risks the plan accepts
<from risks-resolved.md — list deferred unknowns and their fallback plans>

## Critic verdict (most recent)
- Total findings: N
- Breaks: X | Degrades: Y | Risky: Z
- Recommendation: <PROCEED | ...>

### Top 3 findings (from critique-v<latest>.md)
1. **[severity]** <claim quote> — <attack> [evidence]
2. ...
3. ...

## Build steps (count + tracer bullet)
- N total steps. Tracer bullet: <one line from build-plan.md>

## Files Claude will create/modify (estimate)
- <count> source files under <paths>
- <count> test files under <paths>

---

## Linked artifacts (full detail)
- [Requirements](./requirements.md)
- [Architecture decision](./decision.md)
- [Components](./components.md)
- [Risks resolved](./risks-resolved.md)
- [Build plan](./build-plan.md)
- [Latest critique](./critique-v<N>.md)
```

### Step 2 — Present to user

Show the user the summary content directly in the chat (do not just point them to the file). Then ask:

> ArchForge is ready to enter Phase 7 (execute). Three options:
>
> **A. Approve** — start building per the plan.
> **B. Loop back** — name a phase to revisit (0–4) and tell me what to change.
> **C. Abort** — exit ArchForge and proceed manually.
>
> Which?

Use the AskUserQuestion tool if available.

### Step 3 — Act on the answer

- **A. Approve** → advance state to phase 7. Hand off to `archforge-phase-7-execute`.
- **B. Loop back** → set state.phase to the chosen phase, increment `critique_cycles`, hand off to that phase's skill.
- **C. Abort** → write `.archforge/aborted.md` with the user's reason; do not delete other artifacts. Tell the user `.archforge/` can be safely removed when they're ready.

### Step 4 — On approval, advance state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=7; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

This is the moment the BuildGate hook flips from "block source edits" to "allow source edits". Tell the user explicitly: "BuildGate is now open. Source-code edits are no longer blocked."

## Hard rules

- This is the **only** mandatory user touchpoint between triage (Phase 0 entry) and execution. Do not skip.
- The summary must include the top 3 critique findings even on PROCEED — the user should know what risks they're accepting.
- Do not advance to phase 7 without an explicit "approve" answer.
