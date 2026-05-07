---
description: Phase 3 — Risk and unknown elimination. List every "I don't know how" moment, resolve each via research with cited URLs, isolated prototype with code path, or explicit deferral with fallback. No unknown is ever closed by guessing.
---

# Phase 3 — Risk & Unknown Elimination

Goal: surface and resolve every unknown **before** Phase 7 (execute) starts. The cost of an unknown discovered during build is 10x the cost of resolving it now. Every resolution must be backed by either a fetched URL, a runnable prototype path, or an explicit fallback technique with citation. See `skills/_shared/claim-schema.md`.

Inputs: `.archforge/components.md`, `.archforge/decision.md`
Outputs: `.archforge/risks-resolved.md`, `.archforge/claims-phase3.json`

## Process

### Step 1 — Catalogue unknowns

Read the components and decision docs. List every moment where the answer to "how exactly does X work?" is "I'm not sure". Examples:

- "How does Drizzle handle SQLite WAL on Railway?"
- "What's the rate limit on the Meta Ads API for $RESOURCE?"
- "Does our auth library support the token rotation flow we're assuming?"
- "How does the framework's middleware order interact with our auth?"

Be ruthless. If you write "we'll figure it out later", that's a finding.

### Step 2 — Resolve each (in order of severity)

For each unknown, choose **one**:

- **Research** — `WebSearch` + `WebFetch` the docs, GitHub issues, postmortems. The `Finding` field must have **at least one fetched URL** in `Sources/Code`. Training-data recall without a fetched URL is **invalid** — the citation gate will drop it.
- **Prototype** — write the smallest possible script that exercises the unknown. Run it. Record the actual behavior. The `Sources/Code` field must point to an actual file path that exists; the gate checks this.
- **Defer with explicit accept** — if the unknown can be tolerated (e.g. "if the API rate-limits us we'll add backoff"), document the acceptance criterion AND cite a real URL describing the fallback technique (e.g. exponential-backoff RFC, Retry-After header docs). Pure "we'll handle it" is **invalid**.

### Step 3 — Test strategy

For each component identified in Phase 2, define:

- **Unit test surface** — what functions/classes get tested in isolation?
- **Integration test surface** — what cross-component interactions get tested with real dependencies?
- **End-to-end test surface** — what user journeys get verified end-to-end?
- **Manual verification** — what must a human eyeball before each release?

If any test-strategy assertion claims that a particular framework or library supports a coverage technique ("Vitest supports happy-dom for DOM tests"), that's a claim — cite it.

## Output: `.archforge/risks-resolved.md`

```markdown
# Risks & Unknowns

## Unknown 1 — <one-line summary>

**Original question:** ...

**Resolution method:** Research | Prototype | Deferred

**Finding:** ... (1-2 paragraphs, citations if research; results if prototype; acceptance criterion if deferred)

**Sources/Code:** ... (URLs from WebFetch or path to prototype script under .archforge/prototypes/)

## Unknown 2 — ...

---

# Test Strategy

## <Component A>
- Unit: ...
- Integration: ...
- E2E: ...
- Manual: ...

## <Component B>
- ...
```

---

## Step 4 — Citation gate (MANDATORY before save)

Build `.archforge/claims-phase3.json` per schema. Each unknown produces one claim entry:

```json
{
  "phase": 3,
  "generated_at": "2026-05-07T12:00:00Z",
  "claims": [
    {
      "id": "P3-U1",
      "claim": "Drizzle ORM supports SQLite WAL mode via the better-sqlite3 driver",
      "evidence_url": "https://orm.drizzle.team/docs/get-started-sqlite",
      "evidence_summary": "Drizzle's SQLite driver delegates pragma settings to better-sqlite3; WAL is enabled with `pragma('journal_mode = WAL')` after connection open.",
      "context": "Unknown 1 — SQLite concurrency on Railway",
      "scenario": "library_behavior",
      "confidence": "verified"
    },
    {
      "id": "P3-U2",
      "claim": "Meta Ads API allows 200 calls per hour per app per user (default tier)",
      "evidence_url": "file://.archforge/prototypes/meta-ads-rate-test.ts",
      "evidence_summary": "Prototype script issued 250 sequential calls; observed 429 responses starting at call 201, with X-Business-Use-Case-Usage headers showing limit reset at top of next hour.",
      "context": "Unknown 2 — Meta Ads rate limit",
      "scenario": "scale",
      "confidence": "verified"
    }
  ]
}
```

For Prototype resolutions, `evidence_url` may use the `file://` scheme pointing into `.archforge/prototypes/` — the gate special-cases this.

Run the validation gate:

```bash
node -e '
const fs = require("fs"), path = require("path");
const f = process.env.CLAUDE_PROJECT_DIR + "/.archforge/claims-phase3.json";
const projDir = process.env.CLAUDE_PROJECT_DIR;
const d = JSON.parse(fs.readFileSync(f, "utf8"));
const kept = [], dropped = [];
for (const c of (d.claims || [])) {
  if (c.confidence === "design_choice") { kept.push(c); continue; }
  const url = c.evidence_url || "";
  // Allow http(s) URLs for research, file:// for prototypes (verified to exist).
  if (/^https?:\/\/[^\s<>]+\.[a-z]{2,}/i.test(url)) { kept.push(c); continue; }
  if (url.startsWith("file://")) {
    const p = path.join(projDir, url.slice("file://".length).replace(/^\.\//, ""));
    if (fs.existsSync(p)) { kept.push(c); continue; }
    dropped.push({id: c.id, claim: c.claim, reason: "prototype_file_missing", path: p});
    continue;
  }
  dropped.push({id: c.id, claim: c.claim, reason: "missing_or_invalid_url"});
}
d.claims = kept;
fs.writeFileSync(f, JSON.stringify(d, null, 2));
const logP = path.join(path.dirname(f), ".cache", "dropped-claims.log");
fs.mkdirSync(path.dirname(logP), {recursive: true});
for (const e of dropped) fs.appendFileSync(logP, JSON.stringify({ts: new Date().toISOString(), phase: 3, ...e}) + "\n");
console.log(JSON.stringify({kept: kept.length, dropped: dropped.length, details: dropped}));
'
```

For each dropped claim:
- Research: run `WebFetch` on a real URL and re-add with that URL.
- Prototype: actually create the file under `.archforge/prototypes/` and run it.
- Deferred: cite the fallback technique's reference docs (RFC, vendor docs).

Re-run until `dropped == 0`.

## Versioning

If output exists, rename to `risks-resolved-vN.md` and `claims-phase3-vN.json`.

## Update state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=4; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Do NOT proceed if
- Any unknown is unresolved AND not explicitly deferred with cited fallback
- Any component lacks a test strategy
- A "Research" resolution lacks a fetched URL
- A "Prototype" resolution lacks a path to actual code under `.archforge/prototypes/`
- A "Deferred" resolution lacks both an acceptance criterion AND a citation for the fallback technique
- `claims-phase3.json` does not exist or its validation run shows `dropped > 0`

Hand off to `archforge-phase-4-buildplan`.
