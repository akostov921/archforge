---
description: ArchForge Audit — read an existing codebase, identify every bug/risk/debt item, verify claims via prototype where possible, write a cited report. Fully autonomous, no user questions.
---

# ArchForge — Audit Mode

Goal: produce a complete, cited audit of an existing codebase. Every finding must have evidence (code line reference, prototype result, or fetched URL). No hallucinations, no guesses.

**Invoke:** `/archforge audit <path>` or orchestrator sets triage=audit.

---

## Process

### Step 1 — Map the codebase (parallel reads)

```
glob src/**/*.ts, src/**/*.tsx, src/**/*.js, src/**/*.py
Read: package.json, tsconfig.json, .env.example, README, any CI config
```

Read every source file. Build a mental map:
- Entry points
- Module boundaries  
- External dependencies
- Data flows
- Error handling patterns
- Test files (or absence of them)

### Step 2 — Find issues (7 categories)

For each category, scan every file and collect findings:

| Category | What to look for |
|---|---|
| **Bugs** | Dead code paths, wrong types, off-by-one, unhandled promise rejections, missing null checks |
| **Security** | Hardcoded secrets, no auth, command injection, open ports, missing input validation |
| **Performance** | N+1 queries, blocking I/O in hot paths, unbounded arrays, missing indexes |
| **Reliability** | No retry logic, missing timeouts, single point of failure, no graceful shutdown |
| **Tech Debt** | Duplicate logic, circular dependencies, TODOs, skipped tests, commented-out code |
| **Test Coverage** | Untested critical paths, .skip()/.todo(), missing edge cases |
| **Dependencies** | Outdated packages, transitive-only deps, missing from package.json |

### Step 3 — Verify findings (prototype where possible)

For every HIGH severity finding:

1. **Write a minimal prototype** in `.archforge/prototypes/audit-<name>.ts` that demonstrates the bug
2. **Run it:** `npx tsx .archforge/prototypes/audit-<name>.ts`
3. If it reproduces → verified, mark as `CONFIRMED`
4. If it doesn't → re-examine, may be `FALSE_POSITIVE`

For MEDIUM findings: WebFetch the relevant docs/issues to confirm the pattern is actually a problem.

For LOW findings: code reference is sufficient evidence.

### Step 4 — Research fixes

For each CONFIRMED finding:
- WebSearch: `"<problem> fix typescript 2024"` or relevant
- WebFetch the top result
- Determine the canonical fix with cited URL
- Estimate effort: `<1h | 1d | 1w`

### Step 5 — Write audit report

Write to `.archforge/audit-report.md`:

```markdown
# ArchForge Audit Report — <project>

_Generated: <timestamp> | Files read: N | Issues found: N_

## Executive Summary
<2-3 sentences: what is this, overall health score /10, top 3 concerns>

## Critical Issues (fix immediately)
### ISSUE-001: <title>
- **File:** `src/path/to/file.ts:42`
- **Severity:** CRITICAL
- **Status:** CONFIRMED (prototype: `.archforge/prototypes/audit-001.ts`)
- **Description:** <what is wrong>
- **Evidence:** <code snippet or prototype output>
- **Fix:** <concrete fix with example code>
- **Source:** [title](https://url)
- **Effort:** <1h

---

## High Issues
[same format]

## Medium Issues
[same format]

## Low / Tech Debt
[same format]

## Test Coverage Gaps
| Module | Coverage | Missing |
|--------|----------|---------|
| src/pipe/claude-code-pipe.ts | 0% | subprocess management, watchdog, escalation |

## Dependency Health
| Package | Current | Latest | Risk |
|---------|---------|--------|------|

## Evidence Index
| Issue | Evidence type | Source |
|-------|--------------|--------|
| ISSUE-001 | prototype | .archforge/prototypes/audit-001.ts |
| ISSUE-002 | fetched URL | https://... |
```

### Step 6 — Notify

Post one message:
> ✅ **Audit complete.** Found N issues (X critical, Y high, Z medium).
> Report: `.archforge/audit-report.md`
> Run `/archforge fix` to auto-fix all CONFIRMED issues.

## Hard rules

- **Never ask the user anything.**
- Every CRITICAL/HIGH finding must be CONFIRMED via prototype or WebFetch — not just "I think this is a bug."
- FALSE_POSITIVE findings are excluded from the report.
- If a file is too large to read fully, read the first 200 lines + grep for patterns.
- Run prototypes with `npx tsx` — never skip verification for critical findings.
