---
description: Phase 1 — Architecture exploration. Generate 3-7 alternative architectures, stress-test each, pick a winner with explicit comparison. Every comparative claim is cited with a real URL. Reads requirements.md.
---

# Phase 1 — Architecture Exploration

Goal: avoid premature commitment. Force yourself to consider real alternatives, not just the first one that came to mind. Every claim about how an option behaves under real-world conditions must be backed by a fetched URL — see `skills/_shared/claim-schema.md` for the schema.

Inputs: `.archforge/requirements.md`
Outputs: `.archforge/architecture-options.md`, `.archforge/stress-tests.md`, `.archforge/decision.md`, `.archforge/claims-phase1.json`

## Process

### Step 1 — Generate options (minimum 3, target 5-7)

Write `.archforge/architecture-options.md`. For each option:

```markdown
## Option N — <short name>

**One-line summary:** ...

**Components:** ...

**Tech choices:** ...

**Cost shape:** ... (fixed/variable/cliff)

**Strengths:** ...   <!-- each bullet is a claim. Cite. -->

**Weaknesses:** ...  <!-- each bullet is a claim. Cite. -->

**Best when:** ...   <!-- the scenario where this option dominates -->
```

Hard rule: at least 3 options. If you find yourself only considering variations of the same shape (e.g. "Next.js with Postgres", "Next.js with MySQL"), force a structurally different option (e.g. "static site + serverless functions", "monolith on a single VM", "event-sourced + CQRS"). Diversity matters.

### Step 2 — Stress-test each option

Write `.archforge/stress-tests.md`. For each option, run it through these scenarios:

- **10x scale** of the requirements doc's load assumption
- **Security boundary** — what's the worst that happens if the most-attacked component is compromised?
- **Edge cases** — empty input, partial network, concurrent writers, schema migration mid-traffic
- **Change requirements** — if the user pivots to a related but different goal in 6 months, how much of this option survives?
- **Cost cliff** — what user/data/request volume turns the bill from $X to $10X?
- **Team scaling** — if 5 more devs need to work on this, where does the architecture serialize them?

For each (option, scenario) pair, write 1-3 sentences. Be specific about the failure mode.

### Step 3 — Decide

Write `.archforge/decision.md`:

```markdown
# Architecture Decision

## Chosen: Option <N> — <name>

## Why this beat the alternatives
- vs. Option A: ...   <!-- claim. Cite. -->
- vs. Option B: ...   <!-- claim. Cite. -->
- ...

## Conditions under which this would be wrong
- If <X>, prefer Option <Y>.

## Reversibility
- This decision can be reversed in <effort estimate>.
- The point of no return is when <X> happens (e.g. customers depend on a public API contract, data is in a vendor-locked store, etc.)
```

---

## Step 4 — Citation gate (MANDATORY before save)

Every Strength, Weakness, Best-when, stress-test failure mode, and "vs Option X" comparison is a **claim**. Before saving the markdown, you must:

1. **Run `WebSearch` and/or `WebFetch`** for each claim that asserts how a tool, framework, service, or pattern behaves under real load, security pressure, or change. Prefer postmortems, GitHub issues with reproductions, CVEs, vendor pricing pages with timestamps, official docs with version, and benchmark studies.

2. **Build `.archforge/claims-phase1.json`** following the schema in `skills/_shared/claim-schema.md`. One entry per claim. Example:

```json
{
  "phase": 1,
  "generated_at": "2026-05-07T12:00:00Z",
  "claims": [
    {
      "id": "P1-C1",
      "claim": "Postgres on a single primary hits XID wraparound around ~10k inserts/sec sustained without partitioning",
      "evidence_url": "https://www.crunchydata.com/blog/managing-transaction-id-wraparound-in-postgresql",
      "evidence_summary": "Postgres XIDs are 32-bit; high-throughput single-primary deployments require autovacuum tuning or partitioning to avoid emergency vacuum freeze.",
      "context": "Option A — single Postgres primary",
      "scenario": "scale",
      "confidence": "verified"
    },
    {
      "id": "P1-C2",
      "claim": "We split the system into 3 components (API, ingestion worker, dashboard)",
      "evidence_url": "",
      "evidence_summary": "",
      "context": "Option B — split monolith",
      "scenario": "library_behavior",
      "confidence": "design_choice"
    }
  ]
}
```

3. **Run the validation gate** (drops uncited verified/inferred claims):

```bash
node -e '
const fs = require("fs"), path = require("path");
const f = process.env.CLAUDE_PROJECT_DIR + "/.archforge/claims-phase1.json";
const d = JSON.parse(fs.readFileSync(f, "utf8"));
const kept = [], dropped = [];
for (const c of (d.claims || [])) {
  if (c.confidence === "design_choice") { kept.push(c); continue; }
  const url = c.evidence_url || "";
  if (!/^https?:\/\/[^\s<>]+\.[a-z]{2,}/i.test(url)) {
    dropped.push({id: c.id, claim: c.claim, reason: "missing_or_invalid_url"});
    continue;
  }
  kept.push(c);
}
d.claims = kept;
fs.writeFileSync(f, JSON.stringify(d, null, 2));
const logP = path.join(path.dirname(f), ".cache", "dropped-claims.log");
fs.mkdirSync(path.dirname(logP), {recursive: true});
for (const e of dropped) fs.appendFileSync(logP, JSON.stringify({ts: new Date().toISOString(), phase: 1, ...e}) + "\n");
console.log(JSON.stringify({kept: kept.length, dropped: dropped.length, details: dropped}));
'
```

4. **For every dropped claim** (`dropped > 0`):
   - Locate the corresponding sentence in `architecture-options.md`, `stress-tests.md`, or `decision.md`.
   - **Either** find a real source and re-add the claim with `evidence_url`, **or** delete the sentence from the markdown. Hallucinated claims are forbidden — silence is preferable.

5. **Re-run** the validation gate until `dropped == 0` for the current set of markdown sentences.

## Versioning

If any output file exists, rename existing to `*-vN.md` first. The same applies to `claims-phase1.json` → `claims-phase1-vN.json`.

## Update state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=2; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Do NOT proceed if
- Fewer than 3 options were generated
- Any option lacks all 6 stress-test scenarios
- `decision.md` lacks the "conditions under which this would be wrong" section
- `claims-phase1.json` does not exist
- The validation gate's last run shows `dropped > 0`
- Any non-`design_choice` claim has an empty `evidence_url`

Hand off to `archforge-phase-2-components`.
