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
- `architecture-options.md`, `decision.md`, `claims-phase1.json` (only for `product` triage)
- `components.md`, `claims-phase2.json` (`product` and `feature` triage)
- `risks-resolved.md`, `claims-phase3.json` (`product` and `feature` triage)
- `build-plan.md`, `claims-phase4.json` (always)

If any required file is missing, **stop** and tell the user which phase to revisit.

### Step 1b — Cross-check claims integrity

Before invoking the critic, verify that every phase's claims file passed its own validation gate. Any non-`design_choice` claim with empty or non-URL `evidence_url` is a **structural failure** that the critic should not even see — it must be sent back to the originating phase.

```bash
node -e '
const fs = require("fs"), path = require("path");
const dir = process.env.CLAUDE_PROJECT_DIR + "/.archforge";
const phases = [1,2,3,4];
const violations = [];
for (const n of phases) {
  const f = path.join(dir, "claims-phase" + n + ".json");
  if (!fs.existsSync(f)) { violations.push({phase:n, error:"missing_claims_file"}); continue; }
  let d; try { d = JSON.parse(fs.readFileSync(f,"utf8")); } catch (e) { violations.push({phase:n, error:"unparseable", detail:String(e)}); continue; }
  for (const c of (d.claims || [])) {
    if (c.confidence === "design_choice") continue;
    const url = c.evidence_url || "";
    const okHttp = /^https?:\/\/[^\s<>]+\.[a-z]{2,}/i.test(url);
    const okFile = url.startsWith("file://");
    if (!okHttp && !okFile) {
      violations.push({phase:n, id:c.id, reason:"uncited_claim_in_saved_file", claim:c.claim});
    }
  }
}
console.log(JSON.stringify({violations, count: violations.length}));
'
```

If `count > 0`, **do not invoke the critic**. Instead, tell the user which phase has uncited claims and route them back to that phase. The critic only runs against bundles that pass the structural integrity check.

### Step 2 — Invoke the critic subagent

Use the **Agent tool** with `subagent_type: critic`. Pass this prompt:

> Run an adversarial critique of the ArchForge planning bundle in `.archforge/`. Read every `*.md` file under that directory. Produce ≥7 findings in the YAML format specified in your instructions. Use WebSearch to ground every finding in real evidence. Do not soften. Do not suggest fixes — pure attack only. Output only the YAML block.

The critic runs in its own forked context — it does NOT see this conversation history.

### Step 3 — Parse and validate the critique (JSON)

The critic returned its full response as a chat message. Save that **exact text** to `.archforge/.cache/last-critique.txt` via the Write tool, then validate programmatically.

**Critic output is JSON, not YAML** (changed in v0.2 because LLM-emitted YAML had unquoted-colon and indentation parse failures).

```bash
node -e '
const fs = require("fs");
const txtPath = process.env.CLAUDE_PROJECT_DIR + "/.archforge/.cache/last-critique.txt";
const txt = fs.readFileSync(txtPath, "utf8");

// Extract fenced JSON block; fall back to whole text.
const m = txt.match(/```json\s*\n([\s\S]*?)\n```/);
const jsonStr = m ? m[1] : txt;

let payload;
try {
  payload = JSON.parse(jsonStr);
} catch (e) {
  console.log(JSON.stringify({error: "json_parse_failed", message: String(e)}));
  process.exit(0);
}

const findings = Array.isArray(payload.findings) ? payload.findings.length : 0;
const evidenceCount = (payload.findings || []).filter(f => f && typeof f.evidence_url === "string" && /^https?:\/\//.test(f.evidence_url)).length;

// Banned phrases — enhanced list incl. synonym escapes.
const banned = [
  "looks good","overall","I think","probably","seems","might",
  "in general","for the most part","could potentially",
  "appears to","likely","reads as"
];
let bannedHits = 0;
for (const p of banned) {
  const re = new RegExp(p, "gi");
  bannedHits += (txt.match(re) || []).length;
}

// Quality heuristics — every finding must have a concrete claim (file:line) and a URL.
let weakFindings = 0;
for (const f of (payload.findings || [])) {
  const claim = (f && f.claim) || "";
  if (!/[A-Za-z0-9_\-./]+\.(md|ts|js|py|go|rs|java|cpp|h|hpp|json):\d+/.test(claim)) {
    weakFindings++;
  }
}

const v = payload.verdict || {};
console.log(JSON.stringify({
  findings, evidenceCount, bannedHits, weakFindings,
  recommendation: v.recommendation,
  loop_back_reason: v.loop_back_reason
}));
'
```

Use the JSON output of this command to apply the decision rules in Step 4.

A critique is **valid** when:
- `findings >= 7`
- `evidenceCount >= findings` (every finding has a real-looking URL)
- `bannedHits == 0`
- `weakFindings == 0` (every finding quotes file:line)

Otherwise the critique is invalid and must be regenerated.

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
