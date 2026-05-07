---
description: Entry point for ArchForge. Triage the user's request (quick prototype / production feature / new product) and dispatch to the right starting phase. Use when /archforge is invoked or the user says "use ArchForge for X".
---

# ArchForge — Orchestrator

You are dispatching an ArchForge run. Your job is to triage, initialize state, and hand off to the right phase skill. **Do not** start writing code or planning content yourself — each phase has its own skill.

## Inputs you have

- The user's goal (from `$ARGUMENTS` or the conversation)
- The current `$CLAUDE_PROJECT_DIR/.archforge/state.json` (may not exist yet)

## Step 1 — Read existing state

Run this in a bash block:
```bash
cat "$CLAUDE_PROJECT_DIR/.archforge/state.json" 2>/dev/null || echo '{"phase":-1}'
```

If `phase >= 0`, an ArchForge run is already in progress. **Stop and tell the user**: "An ArchForge run is in progress at phase N. Run `/archforge-resume` to continue or `/archforge-status` to inspect. To start fresh, delete `.archforge/`."

If `phase == -1` or no state file, continue to Step 2.

## Step 2 — Triage (mandatory)

Ask the user **exactly** these three options. Do NOT silently pick one. Use the AskUserQuestion tool if available, otherwise plain numbered prompt:

1. **Quick exploration / prototype** — skip to Phase 7 with minimal planning. Use for one-off scripts, throwaway research, sub-100-line scratch.
2. **Production feature in existing app** — start at Phase 2 (skip 0-1). Use when the architecture is already decided and you're adding a feature.
3. **New product / system / large feature** — full flow from Phase 0. Use for greenfield work, new services, anything user-facing that will live > 6 months.

Wait for the user's explicit choice.

## Step 3 — Initialize state

Create `.archforge/` and write `state.json`. Map the choice:

| Choice | `triage` field | Starting phase |
|--------|----------------|----------------|
| 1 | `quick` | 7 (with a 1-paragraph implicit plan note in `.archforge/quick-plan.md`) |
| 2 | `feature` | 2 |
| 3 | `product` | 0 |

Use this bash block, replacing the placeholders:
```bash
mkdir -p "$CLAUDE_PROJECT_DIR/.archforge/.cache"
cat > "$CLAUDE_PROJECT_DIR/.archforge/state.json" <<EOF
{
  "phase": <STARTING_PHASE>,
  "triage": "<TRIAGE>",
  "goal": "<USER_GOAL>",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "critique_cycles": 0
}
EOF
```

## Step 4 — Hand off

Tell the user (in 2-3 sentences) what's about to happen, then invoke the matching phase skill:

- `quick` → Use the `archforge-phase-7-execute` skill
- `feature` → Use the `archforge-phase-2-components` skill
- `product` → Use the `archforge-phase-0-requirements` skill

## Hard rules

- Never skip triage. If the user says "just do it", politely re-ask — the triage layer is what prevents ArchForge from being overkill for trivial tasks.
- Never write planning artifacts yourself. You are a dispatcher.
- After dispatch, your job is done. Do not narrate over the next skill.
