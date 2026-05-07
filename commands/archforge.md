---
description: Start an ArchForge run on a goal. Triages your request and dispatches to the right starting phase. Use for any non-trivial task you'd otherwise eyeball.
---

# /archforge — start a run

Goal from the user: $ARGUMENTS

Use the `archforge-orchestrator` skill from this plugin to triage and dispatch.

If `$ARGUMENTS` is empty, ask the user once: "What are you trying to build?" Then continue.

If a previous run is in progress (`.archforge/state.json` exists with `phase >= 0`), do **not** start a new run — tell the user to use `/archforge:resume` or `/archforge:status`, or to remove `.archforge/` to start fresh.

Do not skip the triage step. Do not silently pick a path. The triage layer is what prevents ArchForge from being overkill for trivial tasks.
