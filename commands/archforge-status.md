---
description: Show the current ArchForge run state — phase, triage path, goal, critique cycles, list of artifacts in .archforge/.
---

# /archforge-status — what's the state of this run?

Run this bash block and present the results to the user:

```bash
ARCH="$CLAUDE_PROJECT_DIR/.archforge"
if [ ! -d "$ARCH" ]; then
  echo "No ArchForge run in this project."
  exit 0
fi

if [ -f "$ARCH/state.json" ]; then
  node -e '
const fs=require("fs");
const s=JSON.parse(fs.readFileSync(process.env.ARCH+"/state.json","utf8"));
const phaseNames=["Requirements","Architecture","Components","Risks","Build Plan","Critique","Approval","Execute"];
console.log("Phase:        " + s.phase + " — " + (s.phase>=0 && s.phase<=7 ? phaseNames[s.phase] : "(unset)"));
console.log("Triage:       " + (s.triage || "(unset)"));
console.log("Goal:         " + (s.goal || "(unset)"));
console.log("Started:      " + (s.started_at || "(unset)"));
console.log("Last update:  " + (s.updated_at || "(unset)"));
console.log("Critique runs: " + (s.critique_cycles || 0));
' ARCH="$ARCH"
else
  echo "No state.json — run /archforge to start."
fi

echo ""
echo "Planning artifacts:"
ls -1 "$ARCH"/*.md 2>/dev/null | sed 's|.*/|  |' || echo "  (none yet)"
```

After running, tell the user:
- What phase they're in (in plain English)
- What artifact files exist
- What command they'd run next: `/archforge:resume` to continue, or `/archforge` (fresh after deleting `.archforge/`).

If the run is at phase 6 (awaiting approval), highlight that the user has a pending decision.
If the run is at phase 7 (executing), note that BuildGate is open and source edits are unblocked.
