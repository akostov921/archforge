---
description: Start an ArchForge run on a goal. Triages your request and dispatches to the right starting phase. Use for any non-trivial task you'd otherwise eyeball.
---

# /archforge — start a run

Goal from the user: $ARGUMENTS

Use the `archforge-orchestrator` skill from this plugin to triage and dispatch.

**Triage is fully autonomous** — no questions asked. The orchestrator infers the right path from the goal wording:
- `audit <path>` → full codebase audit with cited findings + prototype verification
- `fix` → auto-fix CONFIRMED issues from the last audit
- anything else → build (auto-detects quick / feature / product)

If `$ARGUMENTS` is empty, ask the user once: "What are you trying to build or audit?" Then continue.

If a previous run is in progress (`.archforge/state.json` exists with `phase >= 0`), do **not** start a new run — tell the user to use `/archforge:archforge-resume` or `/archforge:archforge-status`, or to remove `.archforge/` to start fresh.
