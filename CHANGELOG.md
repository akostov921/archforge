# CHANGELOG

## v0.2.0 — Self-critique fixes (2026-05-07)

This release closes the BREAKS-class holes the v0.1 Critic found in ArchForge's own architecture when run against `BUILD_PLAN.md`. Eat your own dog food.

### Fixed (BREAKS-class)
- **F12 (Bash bypass) — new `bash-gate.ts` hook.** The previous BuildGate matched only `Edit|Write|MultiEdit|NotebookEdit`. Bash commands like `echo x > app/server.ts`, `sed -i ... src/main.go`, or `cat > foo.ts <<EOF` bypassed it entirely. New hook detects redirects (`>`, `>>`), `tee`, `sed -i`, `awk -i inplace`, `perl -i`, and `truncate` against non-whitelisted paths. Tested with 6 attack vectors and 5 legitimate-use cases — all classified correctly.
- **F3 (subagent isolation claim).** v0.1 docs implied default subagents give "context isolation". In reality, default subagents inherit a **lossy summary** of the parent conversation, not a clean slate. `agents/critic.md` now states this explicitly and explains that the moat is structural enforcement (URL citations, finding count, exact quotes, JSON parse gate) — NOT context isolation.
- **F1 (silent fail-open).** All hooks already had try/catch with explicit `emitAllow()` on error. v0.2 adds louder, clearly-labelled stderr messages (`"failing open, source edits NOT gated this call"`) so failures surface in the user's session log instead of disappearing.

### Fixed (DEGRADES-class)
- **F4 (Windows EPERM) — `fs.renameSync` now retries** with backoff up to 5 attempts on EPERM/EACCES/EBUSY. Antivirus, OneDrive, and concurrent file-handle scenarios no longer brick state writes.
- **F5 (concurrent sessions race).** State writes now acquire an advisory `state.lock` via `fs.openSync(..., "wx")` with stale-lock detection (>5s old gets stolen). Two concurrent ArchForge sessions in the same project no longer overwrite each other's phase advances.
- **F7 (YAML → JSON for critic output).** Critic prompt now emits JSON in a fenced ```json block. Phase-5 skill parses with `JSON.parse`. Eliminates the YAML failure modes (unquoted colons in `file.md:42` quotes, indentation drift, code-fence wrapping). Quality heuristic added: every finding's `claim` must contain a `file.ext:lineno` pattern (rejects vague findings).
- **F9 (hash collisions + log growth).** Edit-log hashes now use **full SHA-256** (64 hex chars) instead of 16-char prefixes. Log is **rotated** on every append — entries older than 15 min are pruned. Prevents both the 64-bit collision risk and unbounded log growth.

### Improved
- **Banned-phrase list expanded** to catch synonym escapes (`appears to`, `likely`, `reads as`).
- **Evidence URL validation** — phase-5 skill now requires each finding's `evidence_url` to match `^https?://` (string presence is no longer enough).
- **Hook stderr standardized** — all three hooks log errors with the same `[archforge <name>]` prefix and an explicit "failing open" disclaimer.

### Not fixed (intentional)
- **F8 (supply chain — unsigned dist).** Real concern but out of scope for v0.2. v0.3 will add SHA256 sums + GPG-signed tags. Until then: install only from the canonical repo and verify the commit SHA.
- **F10 (Opus 4.7 cost).** Documented in README. Future work: `--cheap` flag to use Sonnet for the critic.
- **F11 (meta-critique deferral pattern).** No code change applicable.

### Known limitations of bash-gate (F12 fix)
- Heuristic, not airtight. Known evasions: `eval`, `bash -c`-wrapped strings, dynamically-built paths via env vars, `find -exec`. These are not currently caught.
- `rm`, `mv`, `cp` with source-code targets are NOT gated (too noisy — many legit uses). v0.3 may add a stricter mode for paranoid projects.

## v0.1.0 — Initial release (2026-05-07)
- 9 skills (orchestrator + 7 phases + critique helper)
- Adversarial Critic agent with banned phrases, URL citations, ≥7 findings
- LoopGuard hook (counter-edit + minimal-variation churn detection)
- BuildGate hook (blocks source edits until plan finalized)
- 3 slash commands
