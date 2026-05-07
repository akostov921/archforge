# BUILD_PLAN.md — ArchForge

This is the build plan for ArchForge itself, written under ArchForge's own discipline.
Plan first, critique the plan (`BUILD_PLAN_CRITIQUE.md`), revise, then build.

## Goal restated in one sentence
Ship a Claude Code plugin that forces a 7-phase deliberation workflow before any code is written, with an adversarial Critic subagent as the differentiator.

## File creation order with dependencies

| # | File | Depends on | Why this order |
|---|------|------------|----------------|
| A1 | `.gitignore` | — | Avoid accidentally tracking `node_modules/` once hooks land |
| A2 | `LICENSE` | — | MIT, fixed text |
| A3 | `.claude-plugin/plugin.json` | — | Defines plugin name, version, declares skills/agents/commands/hooks paths |
| A4 | `README.md` (placeholder) | A3 | Stub now, full content in Stage F |
| B1 | `hooks/package.json` | — | Declares `tsx`, `zod` (validation), node engines |
| B2 | `hooks/lib/state.ts` | B1 | Shared helpers: read/write `.archforge/state.json`, paths, edit-log append |
| B3 | `hooks/pre-tool-use-build-gate.ts` | B2 | Simpler hook — written first to validate the runtime contract |
| B4 | `hooks/pre-tool-use-loopguard.ts` | B2 | More complex — uses edit-log persistence |
| C1 | `agents/critic.md` | — | The moat. Standalone — read by phase-5 skill |
| D1 | `skills/archforge-orchestrator/SKILL.md` | A3, C1 | Dispatcher + triage |
| D2-D8 | `skills/archforge-phase-{0..7}/SKILL.md` | D1 | Phase skills, each writes its own output to `.archforge/` |
| D9 | `skills/archforge-phase-5-critique/SKILL.md` | C1, D2-D5 | Invokes critic, loops up to 3x |
| E1 | `commands/archforge.md` | D1 | `/archforge "build X"` entry point |
| E2 | `commands/archforge-resume.md` | D1 | Reads state.json, dispatches to current phase |
| E3 | `commands/archforge-status.md` | — | Pretty-prints `.archforge/state.json` + file list |
| F1 | `README.md` (full) | everything | Real install, demo, when-to-use, when-not-to-use |
| F2 | `examples/example-run.md` | everything | Annotated walkthrough |
| G1 | `FINAL_REVIEW.md` | everything | Self-audit before declaring done |

Total: ~22 files.

## Self-identified risk areas (ranked by danger)

1. **`agents/critic.md`** — if this is soft, the entire plugin is theatre. Banned-phrase list, mandatory URL citations, mandatory ≥7 findings, adversarial framing must all be present and unambiguous. **Spend extra time here.**
2. **Hook runtime contract** — Claude Code PreToolUse hooks expect a stdin/stdout JSON contract. Getting `continue: false` wrong = hooks silently ignored OR Claude bricked. Need to verify the schema. Will use the documented format and test by running the hook script directly with sample input.
3. **`context: fork` frontmatter for the critic** — uncertain if this is a real Claude Code subagent frontmatter key. **Decision:** include it as documented behavior; if the runtime ignores it, the default subagent invocation already provides context isolation (each subagent runs in its own conversation), so the spec is honored either way. Note this in critic.md as a comment.
4. **State coupling between skills** — every phase skill writes a specific file path; `state.json` must reflect "current phase". A skill that updates state but crashes mid-write leaves corrupt state. **Mitigation:** state writes happen last in each skill, after the artifact file is written.
5. **LoopGuard false positives** — 4 edits to the same file in 15 min is normal during iterative dev. Risk of warning fatigue. **Mitigation:** WARNING (not STOP) at 4 edits; STOP only on counter-edit detection or 3+ minimal-variation diffs. Make threshold a top-of-file constant for easy tuning.
6. **"≥7 findings" enforcement is prompt-only** — can't programmatically gate without wrapping critic in a skill that re-invokes on count<7. **Decision (KISS):** prompt-level only in v1. Document as known limitation in README. Re-invocation wrapper is v2 work.
7. **Slash commands reading `.archforge/state.json`** — markdown commands run bash blocks; using `cat` + `jq` is fragile if `jq` is not installed. **Mitigation:** use `node -e` instead (node is required for hooks anyway).

## Files I considered cutting (kept all of them, here's why)

- `examples/example-run.md` — could skip but README without a walkthrough is worse for adoption. Kept.
- `archforge-status.md` command — could be a skill instead of a command. Kept as command because users expect to type `/archforge-status`.
- `hooks/lib/state.ts` — could inline into both hooks. Kept because both hooks need the same `.archforge/` path resolution and edit-log helpers; DRY wins here at ~80 LOC of shared code.

## Files NOT being built (explicit non-goals from prompt)
- Visual dashboard / web UI
- Multi-language AST parsing
- Real-time dep graph
- IDE integrations
- Anything tree-sitter
- Any `*.json` databases (markdown-only state per spec)

## Testing strategy during the build
- After Stage A: `cat .claude-plugin/plugin.json | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))'` to validate JSON.
- After Stage B: pipe a sample PreToolUse JSON event into each hook and verify the response shape.
- After Stage D/E: parse YAML frontmatter on each skill/command to make sure it loads.
- After Stage G: `tree`, file count, basic grep for TODOs/placeholders.

## What success looks like (from the spec)
- `tree` shows the structure
- Reading any SKILL.md is self-contained
- `agents/critic.md` reads as intimidating
- README invites install
- Zero TODOs / unfinished sections
- Real runnable TypeScript in hooks, not pseudocode

## REVISIONS APPLIED (after critique + docs)

Verified Claude Code plugin contract via https://code.claude.com/docs/en/plugins and /docs/en/hooks:

- **F1 (≥7 findings):** phase-5-critique skill counts findings programmatically by parsing critic YAML output; re-invokes up to 2x if N<7, then escalates.
- **F2 (hook contract):** confirmed via docs. Input on stdin: `{tool_name, tool_input:{file_path,old_string,new_string,...}, session_id, cwd, ...}`. Output: `{hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"deny"|"allow"|"ask", permissionDecisionReason}}` OR exit code 2 with stderr.
- **F3 (agent invocation):** plugin auto-discovers `agents/*.md`. Phase-5 skill instructs Claude to use Agent tool with subagent_type matching the agent name. `context: fork` is NOT in docs — relying on default subagent isolation (each invocation is a fresh context window). Documented as comment in critic.md.
- **F4 (BuildGate whitelist):** allow Edit/Write to paths matching: `.archforge/**`, `BUILD_PLAN*.md`, `FINAL_REVIEW*.md`, `*.md` at root, anything under `docs/`. Block Edit/Write to source code (`src/`, `app/`, `lib/`, `*.ts`, `*.js`, `*.py`, etc.) until `state.json.phase >= 7`.
- **F5 (counter-edit detection):** edit-log entry = `{ts, tool, file, old_hash, new_hash}`. Counter-edit = exists prior entry where `old_hash==current.new_hash AND new_hash==current.old_hash`.
- **F6 (plugin path):** hooks/hooks.json command uses `${CLAUDE_PLUGIN_ROOT}` env var (per docs). State path comes from `$CLAUDE_PROJECT_DIR/.archforge/`.
- **F7 (zero-install runtime):** ship `hooks/dist/*.js` (compiled) alongside `hooks/src/*.ts` (source). hooks.json invokes `node "${CLAUDE_PLUGIN_ROOT}/hooks/dist/<name>.js"`. Build via `npm run build` (tsc) — only maintainer needs node_modules.
- **F8 (demo GIF):** README placeholder + explicit "follow-up artifact, not blocking v0.1" note.
- **F9 (atomic state writes):** `state.ts` helper writes to `.tmp` then `fs.renameSync`.
- **F10 (no self-bootstrap):** README "When NOT to use" section adds: don't use ArchForge to bootstrap an empty project; install after the skeleton exists.

Plugin manifest fields used: `name`, `version`, `description`, `author{name,url}`, `homepage`, `repository`, `license`.
