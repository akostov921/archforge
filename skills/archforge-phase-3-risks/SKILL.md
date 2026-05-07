---
description: Phase 3 — Risk and unknown elimination. List every "I don't know how" moment, resolve each via research or a tiny prototype, then define test strategy.
---

# Phase 3 — Risk & Unknown Elimination

Goal: surface and resolve every unknown **before** Phase 7 (execute) starts. The cost of an unknown discovered during build is 10x the cost of resolving it now.

Inputs: `.archforge/components.md`, `.archforge/decision.md`
Output: `.archforge/risks-resolved.md`

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

- **Research** — WebSearch + WebFetch the docs, GitHub issues, postmortems. Cite URLs.
- **Prototype** — write the smallest possible script that exercises the unknown. Run it. Record the actual behavior.
- **Defer with explicit accept** — if the unknown can be tolerated (e.g. "if the API rate-limits us we'll add backoff"), document the acceptance criterion and the fallback plan.

### Step 3 — Test strategy

For each component identified in Phase 2, define:

- **Unit test surface** — what functions/classes get tested in isolation?
- **Integration test surface** — what cross-component interactions get tested with real dependencies?
- **End-to-end test surface** — what user journeys get verified end-to-end?
- **Manual verification** — what must a human eyeball before each release?

## Output: `.archforge/risks-resolved.md`

```markdown
# Risks & Unknowns

## Unknown 1 — <one-line summary>

**Original question:** ...

**Resolution method:** Research | Prototype | Deferred

**Finding:** ... (1-2 paragraphs, citations if research; results if prototype; acceptance criterion if deferred)

**Sources/Code:** ... (URLs or path to prototype script)

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

## Versioning

If output exists, rename to `risks-resolved-vN.md`.

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
- Any unknown is unresolved AND not explicitly deferred with a fallback plan
- Any component lacks a test strategy
- A "Research" resolution lacks cited URLs
- A "Prototype" resolution lacks a path to the actual code

Hand off to `archforge-phase-4-buildplan`.
