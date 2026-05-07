# CHANGELOG

## v0.3.0 — Citation enforcement everywhere (2026-05-07)

This release closes the largest remaining hallucination surface in ArchForge: **decisions made during planning that were not backed by verified evidence**. Until v0.2, only the Phase 5 Critic had hard citation rules. Phases 1, 2, and 4 produced architectural decisions with zero evidence trail. This release extends the Critic's discipline to every phase that produces factual claims, and adds a Phase 7 import scanner that refuses to let Claude use a third-party library API it has not documented with a fetched URL first.

### Added
- **`skills/_shared/claim-schema.md`** — single source of truth for the claim record format. Every phase that produces claims emits a sibling `claims-phaseN.json` and runs the drop-uncited validation gate before saving.
- **Phase 1 citation gate.** Every Strength / Weakness / Best-when bullet, every stress-test failure mode, and every "vs Option X" comparison in `decision.md` is a claim. Claims with `confidence: verified | inferred` and a missing or non-URL `evidence_url` are dropped from `claims-phase1.json` AND from the markdown. `confidence: design_choice` (architectural taste, decomposition cuts) is exempt and does not need citation.
- **Phase 2 citation gate.** Library capability claims and external service contract assertions require a fetched URL. Pure decomposition (component cuts, ownership) is `design_choice`. The schema includes worked examples of which sentence types are claims and which are not.
- **Phase 3 tightened.** All three resolution paths now require evidence: Research → fetched URL; Prototype → existing file path under `.archforge/prototypes/` (gate verifies file presence via `file://` scheme); Defer → cited fallback technique (RFC, vendor docs). The previous "Defer with explicit accept" loophole that allowed pure "we'll handle it" is closed.
- **Phase 4 citation gate.** Time estimates require a cited basis (similar prior project, library benchmark, or vendor doc). Framework-specific test-strategy claims ("Vitest's `--coverage` ships v8 by default") require URLs. Topological ordering, tracer-bullet selection, and cut points remain `design_choice` and need no citation.
- **Phase 5 cross-check.** Before invoking the Critic, the orchestrator scans every `claims-phaseN.json` for non-`design_choice` entries with empty / non-URL `evidence_url`. If any are found, the Critic is **not** invoked — the run is routed back to the originating phase. The Critic only sees bundles that pass structural integrity.
- **Critic agent updated.** The Critic now also (a) treats orphan markdown claims (sentences that look factual but have no matching JSON entry) as BREAKS-class findings, (b) verifies that each phase's `evidence_url` is reachable and that the page content matches the `evidence_summary`, and (c) flags hallucinated evidence as severity BREAKS, scenario integration.
- **Phase 7 import scanner — BuildGate v2.** When `state.phase >= 7` and an Edit/Write/MultiEdit/NotebookEdit targets a `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py` file, the hook extracts third-party imports (ES modules, CommonJS `require`, Python `from X import` and `import X`). For each undocumented package it denies the edit with a reason instructing Claude to run WebFetch on the official docs and append a row to `.archforge/library-claims.md` first. Stdlib (Node + Python), relative imports, and `node:` prefixes are exempt. New `library-claims.md` is initialized at Phase 7 pre-flight.
- **`hooks/test/run-import-scanner-test.sh`** — 4-case test for the Phase 7 import scanner: (1) undocumented stripe → deny, (2) stripe documented → allow, (3) stdlib only → allow, (4) pre-Phase-7 source edit → deny (regression test). Wired into `npm test`.

### Changed
- **BuildGate hook** is now dual-mode. Pre-Phase-7 behavior unchanged (block all source edits). At Phase 7, runs the new import scanner. Existing tests still pass.
- **Plugin description** in both `plugin.json` and `marketplace.json` updated to reflect the citation-enforcement positioning.

### Not changed (intentional)
- **F8 (supply chain — unsigned dist).** Still deferred. Real concern; v0.4 will add SHA256 sums + GPG-signed tags.
- **Citation reachability check is regex-shape only by default.** A stricter mode that performs `WebFetch` on every URL during the gate exists in the schema (`state.strict_citations: true`), but is off by default — the per-claim fetch cost is high and the Critic does deeper validation in Phase 5.
- **Import scanner languages.** Only TypeScript/JavaScript and Python in v0.3. Go, Rust, Java, C++ imports pass through unchecked. Future work: per-language plugin extension points.
- **Bash-routed file writes that introduce imports** (e.g. `cat > foo.ts <<EOF\nimport stripe...\nEOF`) bypass the import scanner. BashGate catches the redirect itself, but only pre-Phase-7. Known limitation, documented.

### Migration from v0.2
- Existing v0.2 runs in progress: `claims-phaseN.json` files do not exist for those runs. The Phase 5 cross-check will flag them as "missing_claims_file" and route the user back. Either delete `.archforge/` and start fresh on v0.3, or manually create empty claims files (`{"phase":N,"generated_at":"...","claims":[]}`) to acknowledge zero-citation legacy state.
- New `.archforge/library-claims.md` is created on first Phase 7 entry and is the only artifact the BuildGate import scanner reads.

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
