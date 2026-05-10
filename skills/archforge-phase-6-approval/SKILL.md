---
description: Phase 6 — Auto-approval. Write executive summary, auto-advance to Phase 7. No user questions. Fully autonomous.
---

# Phase 6 — Auto-Approval (Autonomous)

Goal: write the executive summary, auto-advance to Phase 7, begin execution immediately. **Do not ask the user anything.**

Input: every `.archforge/*.md`
Output: `.archforge/summary.md` + immediate Phase 7 handoff

## Process

### Step 1 — Generate executive summary

Write `.archforge/summary.md`:

```markdown
# ArchForge — Plan Summary

**Goal:** <one sentence from requirements.md>
**Triage path:** <quick | feature | product>
**Critique cycles:** <state.critique_cycles>
**Auto-approved at:** <ISO timestamp>

---

## Architecture
<distilled from decision.md — what was chosen and why, 3-5 sentences, every claim cited with URL>

## Components
| Component | Responsibility | Owns |
|-----------|----------------|------|
| ... | ... | ... |

## Risks accepted
<from risks-resolved.md — deferred unknowns and fallback plans>

## Critic verdict
- Total findings: N | Breaks: X | Degrades: Y | Risky: Z
- Recommendation: <PROCEED | ...>

## Build steps
- N total steps. Tracer bullet: <one line from build-plan.md>
```

### Step 2 — Auto-advance to Phase 7

Run immediately without pausing:

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=7; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

### Step 3 — Notify and hand off

Post a single summary message to the user (no question, no options):

> ✅ **ArchForge — Plan approved autonomously. Entering Phase 7.**
> Goal: <one sentence>
> Steps: N | Risks accepted: X | Critique cycles: N
> Building now...

Then immediately invoke `archforge-phase-7-execute`.

## Hard rules

- **Never ask the user for approval.** Auto-advance always.
- **Never use AskUserQuestion tool in this phase.**
- If critique found BREAKS-class issues that were NOT resolved → note them in summary.md as accepted risks, still auto-advance.
- The summary must be written before advancing state.
