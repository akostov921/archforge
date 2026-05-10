---
description: ArchForge Fix — read audit-report.md or a stated problem, plan fixes, apply them one by one with verification after each. Fully autonomous.
---

# ArchForge — Fix Mode

Goal: apply fixes for all CONFIRMED issues from an audit report (or a stated problem) with verification after each step. Never breaks working code. Never asks the user.

**Invoke:** `/archforge fix` (uses existing audit-report.md) or `/archforge fix <description>` (runs mini-audit first).

---

## Process

### Step 0 — Load issues

If `.archforge/audit-report.md` exists → read it, extract all CONFIRMED issues ordered by severity.
If no audit report → run a targeted mini-audit of the stated problem area first (same process as audit skill, scoped to relevant files).

Advance state to phase 7 immediately (fixes are source edits):

```bash
node -e '
const fs=require("fs"),p=process.env.CLAUDE_PROJECT_DIR+"/.archforge/state.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.phase=7; s.updated_at=new Date().toISOString();
fs.writeFileSync(p+".tmp",JSON.stringify(s,null,2));
fs.renameSync(p+".tmp",p);
'
```

### Step 1 — Plan fixes (before touching any file)

For each issue, determine:
1. **Fix type:** `code_change | config_change | add_test | refactor`
2. **Files affected:** list exact paths
3. **Reversibility:** is this safe to auto-apply? (safe = no schema changes, no external API calls, no destructive ops)
4. **Verification:** how to confirm it worked (test command, prototype, grep)

Skip any fix marked NOT SAFE — log it in `.archforge/fix-skipped.md` with reason.

### Step 2 — Apply fixes one by one

For each safe fix:

**2a. Apply the change**
Edit the file with the fix. Follow the canonical fix from the audit report (already has cited source).

**2b. Document in library-claims.md if new imports introduced**
If the fix adds a new package import → WebFetch its docs → append to `.archforge/library-claims.md` first.

**2c. Verify immediately**

Run one of:
```bash
# TypeScript compile check
npx tsc --noEmit

# Run specific test
npx vitest run <test-file>

# Run prototype
npx tsx .archforge/prototypes/verify-<issue-id>.ts

# Grep to confirm fix applied
grep -n "<fixed pattern>" <file>
```

**2d. Assess result**
- ✅ Passes → mark issue as FIXED, continue to next
- ❌ Fails → revert the change, mark as NEEDS_MANUAL, continue to next (never get stuck)

### Step 3 — Write fix report

Append to `.archforge/audit-report.md`:

```markdown
---

## Fix Report — <timestamp>

| Issue | Status | Verification |
|-------|--------|-------------|
| ISSUE-001 | ✅ FIXED | tsc --noEmit passes |
| ISSUE-003 | ✅ FIXED | vitest run passes |
| ISSUE-005 | ⚠️ NEEDS_MANUAL | Requires schema migration — skipped |

### Fixed: ISSUE-001 — <title>
**Change:** `src/path/file.ts:42`
```diff
- const broken = x ?? 0 : 0  // always 0
+ const fixed = x > 0 ? x : 0
```
**Verified:** `tsc --noEmit` exit 0
```

### Step 4 — Notify

> ✅ **Fix complete.** Fixed N/M issues.
> ⚠️ M issues need manual review → see `.archforge/fix-skipped.md`

## Hard rules

- **One fix at a time.** Apply → verify → next. Never batch.
- **Never skip verification.** If you can't verify → mark NEEDS_MANUAL, move on.
- **Never touch files outside the stated scope** without explicit reasoning.
- **Revert on failure** — a failed fix is worse than no fix.
- **Never ask the user.** If ambiguous → pick the safer option, log the choice.
- Schema migrations, env changes, infra changes → always NEEDS_MANUAL.
