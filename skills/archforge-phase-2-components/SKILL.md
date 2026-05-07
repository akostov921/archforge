---
description: Phase 2 — Component decomposition. Break the chosen architecture into components with explicit interfaces and a dependency graph. Library capability claims are cited; pure decomposition is design choice. Entry point for the "feature" triage path.
---

# Phase 2 — Component Decomposition

Goal: convert the chosen architecture into a set of components small enough that each can be built, tested, and reasoned about independently. Any statement about how an external library, framework, or service behaves is a **claim** — cite it. Pure decomposition (which component owns what, where the cuts are) is a `design_choice` and does not need citation. See `skills/_shared/claim-schema.md`.

Inputs: `.archforge/decision.md` (or for the "feature" triage path: read the existing codebase's architecture from CLAUDE.md / README / source layout)
Outputs: `.archforge/components.md`, `.archforge/claims-phase2.json`

## Process

### Step 1 — List components

For each component:

```markdown
## <component name>

**Responsibility (one sentence):** ...

**Inputs:** ... (data, events, calls)

**Outputs:** ... (data, events, calls)

**Owns:** ... (state it is the source of truth for — be specific)

**Depends on:** ... (other components by name + external libs/services — every external dep is a claim)

**Risks:** ... (1-3 specific things that could go wrong in this component — risks tied to library behavior are claims)

**Interface:** (public API surface — function signatures, message shapes, endpoint paths)
```

Hard rule: the **Interface** section must be concrete enough to write a stub implementation. "Returns user data" is not enough. Write the type or schema.

### Step 2 — Dependency graph (mermaid)

Append a mermaid block:

```markdown
## Dependency graph

\`\`\`mermaid
graph LR
  A[Component A] --> B[Component B]
  B --> C[Component C]
  ...
\`\`\`
```

Hard rule: the graph must be a **DAG** (no cycles). If you have a cycle, one of the two components is mis-decomposed — split it.

### Step 3 — Inter-component contracts

Append a section listing every cross-component call:

```markdown
## Contracts

| Caller | Callee | Method/Event | Payload | Failure mode |
|--------|--------|--------------|---------|--------------|
| Web UI | API | POST /leads | {name,email,...} | 4xx returns validation errors |
| ... | ... | ... | ... | ... |
```

Every row must have a non-empty failure mode. "Returns 500" is not a failure mode — what does the caller do with that 500?

---

## Step 4 — Citation gate (MANDATORY before save)

What is a claim in this phase, what is not:

| Statement type | Is it a claim? | Confidence |
|----------------|----------------|------------|
| "The API uses the Stripe SDK v14, which exposes idempotency_key on PaymentIntent.create" | Yes | `verified` |
| "We split the system into API + Worker + Dashboard" | No | `design_choice` |
| "The Worker handles retries because the queue is at-least-once" | Yes — the at-least-once guarantee is a claim about the queue | `verified` |
| "Component A owns the user table" | No | `design_choice` |
| "Drizzle ORM supports prepared statements on SQLite via better-sqlite3" | Yes | `verified` |
| "Failure mode: caller retries with backoff" | Mostly design — but if it asserts a specific library's retry semantics, cite |  varies |

Build `.archforge/claims-phase2.json` per the schema in `skills/_shared/claim-schema.md`. Example:

```json
{
  "phase": 2,
  "generated_at": "2026-05-07T12:00:00Z",
  "claims": [
    {
      "id": "P2-C1",
      "claim": "Stripe PaymentIntent.create accepts idempotency_key as a header",
      "evidence_url": "https://docs.stripe.com/api/idempotent_requests",
      "evidence_summary": "Stripe's API supports the Idempotency-Key header for safe retries; valid for 24 hours.",
      "context": "Component: BillingService → external dep: Stripe",
      "scenario": "library_behavior",
      "confidence": "verified"
    },
    {
      "id": "P2-C2",
      "claim": "We split into API, Worker, Dashboard",
      "evidence_url": "",
      "evidence_summary": "",
      "context": "decomposition",
      "scenario": "library_behavior",
      "confidence": "design_choice"
    }
  ]
}
```

Run the validation gate (drops uncited `verified`/`inferred` claims):

```bash
node -e '
const fs = require("fs"), path = require("path");
const f = process.env.CLAUDE_PROJECT_DIR + "/.archforge/claims-phase2.json";
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
for (const e of dropped) fs.appendFileSync(logP, JSON.stringify({ts: new Date().toISOString(), phase: 2, ...e}) + "\n");
console.log(JSON.stringify({kept: kept.length, dropped: dropped.length, details: dropped}));
'
```

For every dropped claim: either find evidence and re-add, or remove the corresponding sentence from `components.md`. Re-run until `dropped == 0`.

## Versioning

If `components.md` exists, rename to `components-vN.md`. Same for `claims-phase2.json`.

## Update state

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=3; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

## Do NOT proceed if
- Any component lacks a concrete interface
- The graph has a cycle
- Any contract row has an empty failure mode
- `claims-phase2.json` does not exist
- Validation gate's last run shows `dropped > 0`
- Any non-`design_choice` claim has empty `evidence_url`

Hand off to `archforge-phase-3-risks`.
