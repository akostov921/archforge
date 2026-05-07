---
description: Phase 2 — Component decomposition. Break the chosen architecture into components with explicit interfaces and a dependency graph. Entry point for the "feature" triage path.
---

# Phase 2 — Component Decomposition

Goal: convert the chosen architecture into a set of components small enough that each can be built, tested, and reasoned about independently.

Inputs: `.archforge/decision.md` (or for the "feature" triage path: read the existing codebase's architecture from CLAUDE.md / README / source layout)
Output: `.archforge/components.md`

## Process

### Step 1 — List components

For each component:

```markdown
## <component name>

**Responsibility (one sentence):** ...

**Inputs:** ... (data, events, calls)

**Outputs:** ... (data, events, calls)

**Owns:** ... (state it is the source of truth for — be specific)

**Depends on:** ... (other components by name)

**Risks:** ... (1-3 specific things that could go wrong in this component)

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

## Versioning

If `components.md` exists, rename to `components-vN.md`.

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

Hand off to `archforge-phase-3-risks`.
