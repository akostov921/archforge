---
description: Phase 0 — Requirements mining. Ask clarifying questions in batches until self-rated confidence > 85%, then write requirements.md. Invoked by orchestrator for the "new product" triage path.
---

# Phase 0 — Requirements Mining

Goal: extract everything you need to design this system before you write a single architectural choice. The deliverable is `.archforge/requirements.md`.

## Process

### Loop until confident

Repeat the following until you (Claude) self-rate your confidence in being able to design this system at **>85%**. There is **no hard cap** on rounds — clarity matters more than speed.

1. **Generate a batch of 3-5 clarifying questions.** Group them by theme (users, success criteria, constraints, data, scale, integrations, auth, deployment, regulatory). Use the AskUserQuestion tool with multiSelect where appropriate.
2. **Wait for answers.** Do not proceed without them.
3. **Update internal model.** Reflect briefly (one paragraph in your scratch reasoning) on what you now know vs. what's still ambiguous.
4. **Self-rate confidence (0-100).** If <85, generate another batch focused on the gaps. If ≥85, exit the loop.

### Mandatory question dimensions (cover all of these before you exit)

- **Who** uses this? (roles, expertise level, count)
- **What** is the success criterion? (measurable — latency, cost, accuracy, revenue, anything that can be tested)
- **Scale** — concurrent users, requests/sec, data volume, growth curve
- **Constraints** — budget, deadline, team size, must-use technologies, must-avoid technologies
- **Data** — sources, sensitivity (PII, financial, health), retention requirements
- **Compliance** — GDPR, HIPAA, SOC2, sector-specific rules
- **Integration** — what this must talk to, what protocols, who owns those systems
- **Failure tolerance** — what happens if it's down for 5 min, 1 hour, 1 day?
- **Reversibility** — is this a one-way decision (e.g. choosing a database) or easily changed?

If the user can't answer some questions, **mark them as assumptions** in `requirements.md` rather than glossing over.

## Output: `.archforge/requirements.md`

Structure:

```markdown
# Requirements — <project name>

_Self-rated confidence at exit: NN%_

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

## Open assumptions (user could not confirm)
- [ ] ...
- [ ] ...

## Out of scope (explicit non-goals)
- ...
```

## Versioning

If `.archforge/requirements.md` already exists, rename the existing one to `requirements-v<N>.md` (find the next free N) before writing the new one. The unsuffixed name is always the current version.

## Update state

After writing, update `state.json`:
```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=1; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Do NOT proceed if
- Any of the 9 mandatory dimensions above is fully unanswered
- Self-rated confidence < 85
- The user has not had a chance to add open assumptions

After the file is written and state advanced, hand off to `archforge-phase-1-architecture`.
