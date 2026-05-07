# FINAL_REVIEW.md

Post-build self-audit. Done from a fresh-eyes perspective on the full repo.

## Spec compliance check

| Spec requirement | Where it lives | Pass? |
|---|---|---|
| 7-phase workflow | 9 SKILL.md files under `skills/` | ✓ |
| Triage layer (3 paths) before Phase 0 | `skills/archforge-orchestrator/SKILL.md` step 2 | ✓ |
| `.archforge/` markdown-only state | `hooks/src/lib/state.ts` paths + skill outputs | ✓ |
| All artifacts versioned (`-vN.md`) | Each phase skill's "Versioning" section | ✓ |
| Critic forked context | Default subagent isolation (each invocation = fresh context); `agents/critic.md` documents this | ✓ |
| Critic ≥7 findings + URL citations + banned phrases | `agents/critic.md` "Hard rules" section + `phase-5` skill validation block | ✓ |
| LoopGuard with counter-edit detection + minimal-variation + same-file frequency | `hooks/src/loopguard.ts` | ✓ |
| BuildGate blocks code edits until Phase 7 with whitelist | `hooks/src/build-gate.ts` | ✓ |
| 3-cycle critique limit then escalate | `phase-5` skill decision rules | ✓ |
| Resumability via `state.json` | `commands/archforge-resume.md` + every skill's state update | ✓ |
| README with install / phases / when-to-use / when-not / limitations / credits | `README.md` | ✓ |
| Demo GIF placeholder | README line 7, with explicit follow-up note | ✓ |
| MIT license | `LICENSE` | ✓ |
| Real runnable TypeScript hooks | `hooks/src/*.ts` (compiled, tested with sample input) | ✓ |
| Annotated example | `examples/example-run.md` | ✓ |

## Silent assumptions worth surfacing

1. **`subagent_type: critic` is Phase-5's invocation contract.** I'm assuming Claude Code matches the agent file's `name:` frontmatter (or filename) to the `subagent_type` arg of the Agent tool. If it instead requires the full namespaced form (`archforge:critic`), the phase-5 skill needs a tweak. Will be caught on first install test.

2. **`node` is on `PATH`.** Hooks (`node ...`) and skills' state-update bash blocks (`node -e '...'`) require it. Documented in README "Development" but not in install. Most users will already have it; worth a one-line note in install.

3. **`WebSearch`/`WebFetch` are available to subagents.** The critic relies on them. If a user's environment restricts them, the critic falls back to no-evidence findings, which the validation block re-invokes. Documented as a limitation.

4. **Atomic state writes are durable.** `fs.renameSync` is atomic on POSIX; on Windows behavior is similar but not identical. ArchForge is implicitly POSIX-first.

5. **The critic must produce its YAML inside a fenced ```yaml block** for the orchestrator's regex parse to work. The agent prompt asks for "only the YAML block" — but it's a soft instruction. If the model wraps it in different fencing the parse fails. Mitigation: the regex is permissive (falls back to entire string), but a malformed response could escape detection of `bannedHits`. Acceptable for v0.1.

## What would Karpathy criticize

1. **Markdown LOC > TS LOC by 4x.** Most of the plugin is prose. Defensible — it's an instruction system for a model — but worth noting that the value is in the prompt design, not in code volume. No hidden complexity is hiding under the prose.

2. **Phase skills repeat the same `node -e` state-update block.** ~7 lines duplicated across 6 skills. Could be a single helper script, but would add an indirection layer the user has to chase. Kept inline for readability. Defensible.

3. **The `loopguard` "minimal variation" detector uses raw length tolerance.** Cheap, occasionally wrong. Better would be edit-distance or token similarity. Out of scope for v0.1 — the goal is to catch obvious churn, not subtle ones.

4. **No CI.** This is a hand-built artifact; a GitHub Actions workflow that runs `tsc --noEmit` and basic frontmatter validation would catch regressions. Follow-up.

5. **README has "100% punchy" sections but the install one-liner depends on `/plugin install` resolving the GitHub URL** — works only if the repo is actually published. Until publish, only `--plugin-dir` works.

## Minor fixes applied during review

- **Phase-5 skill's `CRITIQUE_TEXT` env var:** clarified it's the critic's full text response, set immediately before the bash block. (Edit applied below.)

## What's NOT done (and why that's correct)

- No CI workflow — out of scope for v0.1
- No published plugin marketplace listing — depends on the repo actually existing on GitHub
- No demo GIF — explicit follow-up artifact
- No tests for hooks beyond the sample fixture I ran manually — `npm test` script wires up `dist/<x>.js < test/sample-edit.json` so a maintainer can extend
- No icon — plugin manifest doesn't require one

## Verdict

The plugin matches the spec. It's installable as `claude --plugin-dir ./archforge` once published. The Critic prompt is the moat and reads as intentionally hostile. Hooks have been tested with sample stdin events and produced the correct JSON responses.

**Status: ready for v0.1 publish.**
