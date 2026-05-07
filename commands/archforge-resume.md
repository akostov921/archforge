---
description: Resume an in-progress ArchForge run from the last completed phase. Reads .archforge/state.json and dispatches to the matching phase skill.
---

# /archforge-resume — pick up where you left off

Read the current ArchForge state:

```bash
cat "$CLAUDE_PROJECT_DIR/.archforge/state.json" 2>/dev/null
```

If the file does not exist or `phase == -1`, tell the user: "No ArchForge run in progress. Use `/archforge` to start one."

Otherwise, look at `phase` and dispatch:

| phase | next skill |
|-------|------------|
| 0 | `archforge-phase-0-requirements` |
| 1 | `archforge-phase-1-architecture` |
| 2 | `archforge-phase-2-components` |
| 3 | `archforge-phase-3-risks` |
| 4 | `archforge-phase-4-buildplan` |
| 5 | `archforge-phase-5-critique` |
| 6 | `archforge-phase-6-approval` |
| 7 | `archforge-phase-7-execute` |

Before invoking the skill, briefly tell the user: "Resuming at phase N — `<phase name>`. Last update: `<state.updated_at>`. Goal: `<state.goal>`."

Do not re-run prior phases. Do not re-ask the user the triage question — that was answered when the run started.
