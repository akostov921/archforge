---
description: Entry point for ArchForge. Triage the user's request and dispatch to the right path. Fully autonomous — no user questions for triage. Infers the right path from context.
---

# ArchForge — Orchestrator (Autonomous)

You are dispatching an ArchForge run. Triage autonomously, initialize state, and hand off. **Never ask the user which triage path.** Infer it from the goal statement and context.

## Step 1 — Read existing state

```bash
cat "$CLAUDE_PROJECT_DIR/.archforge/state.json" 2>/dev/null || echo '{"phase":-1}'
```

If `phase >= 0` → tell the user: "ArchForge run in progress at phase N. Run `/archforge:archforge-resume` to continue or `/archforge:archforge-status` to inspect."  Stop.

If `phase == -1` → continue to Step 2.

## Step 2 — Autonomous triage

Infer the triage path from the goal statement. **Do not ask.**

| Goal signals | Path | Starting phase |
|---|---|---|
| "audit", "review", "analyse", "what's wrong", "check" + existing path | `audit` | audit skill |
| "fix", "repair", "patch", "popravi", "оправи" + existing code | `fix` | fix skill |
| "quick", "script", "prototype", "one-off", < 100 lines obvious | `quick` | 7 |
| mentions existing app/service + "add feature", "extend", "implement X in Y" | `feature` | 2 |
| "new", "build from scratch", "greenfield", new product/service | `product` | 0 |
| ambiguous → default to `feature` if codebase exists, `product` if not | — | — |

## Step 3 — Initialize state

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

For `audit` and `fix` paths, set `phase: 7` (they operate on existing code directly).

Also initialize `library-claims.md` if it doesn't exist:

```bash
if [ ! -f "$CLAUDE_PROJECT_DIR/.archforge/library-claims.md" ]; then
cat > "$CLAUDE_PROJECT_DIR/.archforge/library-claims.md" <<'EOF'
# Library Claims

Every third-party library imported during Phase 7 must appear here with a verified URL describing the API used.

| Package | Symbol used | Evidence URL | Evidence summary | Verified at |
|---------|-------------|--------------|------------------|-------------|
EOF
fi
```

## Step 4 — Hand off immediately

Post one short message: "ArchForge → `<triage>` path. Starting now." Then dispatch:

| Triage | Skill |
|---|---|
| `audit` | `archforge-audit` skill |
| `fix` | `archforge-fix` skill |
| `quick` | `archforge-phase-7-execute` skill |
| `feature` | `archforge-phase-2-components` skill |
| `product` | `archforge-phase-0-requirements` skill |

## Hard rules

- **Never use AskUserQuestion for triage.**
- Never write planning artifacts yourself — you are a dispatcher only.
- If genuinely ambiguous between `product` and `feature` → pick `feature` (faster, less overhead).
- After dispatch, stop. Do not narrate over the next skill.
