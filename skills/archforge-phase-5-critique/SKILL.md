---
description: Phase 5 — Critique gate. Invoke the critic subagent against the planning bundle, parse findings, loop back if it found BREAKS-class issues, escalate after 3 cycles. This is the moat.
---

# Phase 5 — Critique Gate

Goal: subject the plan to a hostile, evidence-cited adversarial review before any code is written. This is what separates ArchForge from "thoughtful Claude".

Inputs: every `.archforge/*.md` planning artifact from Phases 0-4
Output: `.archforge/critique-vN.md` (next free N)

## Process

### Step 1 — Confirm readiness

Verify these files exist (depending on triage path):

- `requirements.md` (only for `product` triage)
- `architecture-options.md`, `decision.md` (only for `product` triage)
- `components.md` (`product` and `feature` triage)
- `risks-resolved.md` (`product` and `feature` triage)
- `build-plan.md` (always)

If any required file is missing, **stop** and tell the user which phase to revisit.

### Step 2 — Invoke the critic subagent

Use the **Agent tool** with `subagent_type: critic`. Pass this prompt:

> Run an adversarial critique of the ArchForge planning bundle in `.archforge/`. Read every `*.md` file under that directory. Produce ≥7 findings in the YAML format specified in your instructions. Use WebSearch to ground every finding in real evidence. Do not soften. Do not suggest fixes — pure attack only. Output only the YAML block.

The critic runs in its own forked context — it does NOT see this conversation history.

### Step 3 — Parse and validate the critique

The critic returned its full response as a chat message. Save that **exact text** to `.archforge/.cache/last-critique.txt`, then validate programmatically:

```bash
# (Save the critic's full response to disk first via Write tool.)
node -e '
const fs = require("fs");
const path = process.env.CLAUDE_PROJECT_DIR + "/.archforge/.cache/last-critique.txt";
const txt = fs.readFileSync(path, "utf8");
const m = txt.match(/```yaml\n([\s\S]*?)\n```/);
const body = m ? m[1] : txt;
const findings = (body.match(/^  - id:/gm) || []).length;
const banned = ["looks good","overall","I think","probably","seems","might","in general","for the most part","could potentially"];
let bannedHits = 0;
for (const p of banned) {
  const re = new RegExp(p, "gi");
  bannedHits += (txt.match(re) || []).length;
}
const evidenceCount = (body.match(/evidence_url:/g) || []).length;
console.log(JSON.stringify({findings, evidenceCount, bannedHits}));
'
```

Use the JSON output of this command to apply the decision rules in Step 4.

### Step 4 — Decision rules

Apply in order:

1. **If `findings < 7` OR `evidenceCount < findings` OR `bannedHits > 0`:** the critique is invalid. Re-invoke the critic with a note: "Your previous critique had <issue>. Produce a valid critique. Findings: X, evidence URLs: Y, banned phrases: Z." Up to **2 retries** for invalid critiques (separate from the 3-cycle plan-rework limit).

2. **If critique is valid AND `recommendation == PROCEED`:** save the critique, advance state to phase 6.

3. **If `recommendation` starts with `LOOP_BACK_TO_PHASE_`:** save the critique, increment `state.critique_cycles`, route the user back to that phase. Tell the user which phase and why (use `loop_back_reason` from the verdict).

4. **If `state.critique_cycles >= 3`:** save the critique with name `critique-final.md` and ESCALATE to the user with the message: "ArchForge has cycled through 3 critiques without converging. Review the findings yourself and either accept the residual risk (manually advance to phase 7) or restart with `/archforge` after deleting `.archforge/`."

### Step 5 — Save the critique

Save the **full** critic output (including the YAML) to `.archforge/critique-v<N>.md` where N is one more than the highest existing critique version.

## Update state

When advancing to phase 6:
```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=6; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

When looping back, decrement phase to the indicated phase and increment `critique_cycles`:
```bash
PHASE_BACK_TO=<N>
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase='"$PHASE_BACK_TO"'; s.critique_cycles=(s.critique_cycles||0)+1; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Hard rules

- **Never** review the plan yourself in this skill. The whole point is that the critic is a forked context. If you find yourself listing problems with the plan, you are off-task.
- **Never** soften the critic's findings when summarizing for the user. Quote them.
- **Never** advance to phase 6 if any of the validation gates failed.
