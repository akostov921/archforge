# ArchForge Claim Schema

Every factual statement made during ArchForge planning that can be verified against external evidence is a **claim**. Claims are the unit of accountability that distinguishes ArchForge from "thoughtful Claude": each one must be backed by a real, fetched URL or marked as a non-factual design choice.

This schema is referenced by Phase 1, 2, 3, 4, 5, and 7 skills. It is the single source of truth for claim format.

---

## What counts as a claim

A claim is any statement that:

- Asserts how a library, framework, service, or protocol behaves
- Predicts a failure mode, scale ceiling, or performance characteristic
- Compares two or more options and declares one superior in a measurable way
- Cites prior incidents, postmortems, CVEs, or benchmarks

A claim is **not**:

- A pure design choice ("we will split this into 3 components")
- A topological/logical conclusion ("Step B depends on Step A, so build A first")
- A taste call ("this naming reads better")

When unsure, mark it as a claim and cite. The cost of a redundant citation is low; the cost of a hallucinated claim is the entire ArchForge value proposition.

---

## Claim record (JSON)

Each phase that produces claims emits a sibling `claims-phaseN.json` next to its markdown output. Schema:

```json
{
  "phase": 1,
  "generated_at": "2026-05-07T12:00:00Z",
  "claims": [
    {
      "id": "P1-C1",
      "claim": "<exact statement, copy-paste from the markdown>",
      "evidence_url": "https://example.com/postmortem",
      "evidence_summary": "<1-2 sentences quoted or paraphrased from the source>",
      "context": "<which option/component/step this claim supports>",
      "scenario": "scale|security|library_behavior|cost|maintenance|edge_case|integration|dependency",
      "confidence": "verified|inferred|design_choice"
    }
  ]
}
```

### Confidence levels

- **verified** — `evidence_url` was fetched during this phase and the source explicitly supports the claim. Required for `library_behavior`, `scale`, `cost`, `security`, `dependency`, `edge_case`, `integration`, `maintenance` scenarios.
- **inferred** — extrapolation from a verified source. Allowed only when `evidence_url` cites a related claim and `evidence_summary` explains the inference. Use sparingly; the critic in Phase 5 attacks these first.
- **design_choice** — non-factual assertion (architectural taste, decomposition decision, naming). `evidence_url` may be empty. These are NOT subject to the drop-uncited rule.

### Drop-uncited rule (hybrid enforcement)

Before a phase output is saved:

1. Every entry in `claims-phaseN.json` is checked.
2. If `confidence` is `verified` or `inferred` AND `evidence_url` is empty / not a real URL / unreachable → the claim is **dropped** from `claims-phaseN.json` AND the corresponding sentence is removed from the phase markdown.
3. If after dropping, the phase output no longer satisfies its own "Do NOT proceed if" gate (e.g. fewer than 3 architecture options remain with substance), the phase **fails** and re-runs.
4. Dropped claims are logged to `.archforge/.cache/dropped-claims.log` for debugging.

The Phase 5 critic cross-checks `claims-phaseN.json` against the markdown — any orphan markdown claim without a matching JSON entry is a critic-level finding (severity: BREAKS, scenario: maintenance).

---

## Validation procedure (each phase runs this before saving)

```bash
node -e '
const fs = require("fs");
const path = require("path");
const dir = process.env.CLAUDE_PROJECT_DIR + "/.archforge";
const claimsFile = process.argv[1]; // pass via argv

if (!fs.existsSync(claimsFile)) {
  console.log(JSON.stringify({error: "no_claims_file", path: claimsFile}));
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(claimsFile, "utf8"));
const kept = [];
const dropped = [];

for (const c of (data.claims || [])) {
  if (c.confidence === "design_choice") {
    kept.push(c);
    continue;
  }
  const url = c.evidence_url || "";
  const looksReal = /^https?:\/\/[^\s<>]+\.[a-z]{2,}/i.test(url);
  if (!looksReal) {
    dropped.push({id: c.id, reason: "missing_or_invalid_url", url});
    continue;
  }
  kept.push(c);
}

data.claims = kept;
fs.writeFileSync(claimsFile, JSON.stringify(data, null, 2));

const logPath = path.join(dir, ".cache", "dropped-claims.log");
fs.mkdirSync(path.dirname(logPath), {recursive: true});
for (const d of dropped) {
  fs.appendFileSync(logPath, JSON.stringify({ts: new Date().toISOString(), file: claimsFile, ...d}) + "\n");
}

console.log(JSON.stringify({
  kept: kept.length,
  dropped: dropped.length,
  dropped_details: dropped
}));
' "$CLAUDE_PROJECT_DIR/.archforge/claims-phase1.json"
```

Each phase invokes this with its own claims file path. The phase consults the output and removes corresponding markdown sentences for any dropped claim.

---

## URL reachability check (optional, off by default)

A stricter mode performs `WebFetch` on each `evidence_url` to confirm 200 and that the page contains a substring of `evidence_summary`. This is expensive (one fetch per claim) and is gated behind `state.strict_citations: true`. Default is regex shape check only — the critic in Phase 5 does deeper validation.

---

## Phase coverage matrix

| Phase | Produces claims? | Claim file | Notes |
|-------|------------------|------------|-------|
| 0 — requirements | No | — | Q&A only, no factual assertions about systems |
| 1 — architecture | Yes | `claims-phase1.json` | Each Strength/Weakness/Best-when, every stress-test failure, every "vs Option X" comparison |
| 2 — components | Yes | `claims-phase2.json` | Library capability claims and external service contracts; pure decomposition is `design_choice` |
| 3 — risks | Yes | `claims-phase3.json` | All "Research" resolutions; "Prototype" entries reference the script path; "Defer" entries cite the fallback technique |
| 4 — buildplan | Partial | `claims-phase4.json` | Topological ordering is `design_choice`; time estimates and test-coverage claims need citations |
| 5 — critique | Already JSON | `critique-vN.md` | Critic emits its own JSON; cross-checks all earlier claims files |
| 6 — approval | No | — | User decision |
| 7 — execute | Yes | `library-claims.md` (markdown table for human review) | Every third-party API call must have a row with verified URL |
