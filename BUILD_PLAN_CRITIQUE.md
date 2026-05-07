# BUILD_PLAN_CRITIQUE.md

Hostile review of `BUILD_PLAN.md`. Voice: a senior architect who assumes the author is overconfident.

## Findings

### F1 — `BREAKS`: "≥7 findings is prompt-only" silently ships a broken moat
The plan calls the Critic "the moat" then in the same breath says enforcement is best-effort prompting. If a model returns 4 findings the plugin proceeds as if critique passed. The differentiator described in the README will be a lie on day one for a meaningful fraction of runs.
**Fix:** Phase-5 skill MUST count findings programmatically (parse the YAML output block) and re-invoke the critic with "you returned N<7, continue" up to 2 retries before escalating. This is ~15 LOC, not v2 work.

### F2 — `BREAKS`: Hook stdin/stdout contract is asserted, not verified
The plan says "I will use the documented format." But the plan does not name the format. Claude Code hooks read a JSON event from stdin and write JSON to stdout; the response keys are specific (`continue`, `stopReason`, `decision`, etc., depending on hook version). Guessing wrong = hooks no-op silently, which is the single worst failure mode for this plugin.
**Fix:** Before writing hook code, fetch `https://docs.claude.com/en/docs/claude-code/hooks` (or the latest equivalent) once and cite the exact field names in `hooks/lib/state.ts` as a comment block.

### F3 — `RISKY`: Skills cannot directly invoke subagents
The plan assumes phase-5 skill "invokes critic." Skills are markdown instructions read by Claude — they don't have an "invoke" verb. The actual mechanism is: the skill instructs Claude to use the Agent tool with `subagent_type: critic`. If the agent isn't registered properly via the plugin, the Agent tool won't see it.
**Fix:** plugin.json must declare the agent path; phase-5 skill must spell out "use the Agent tool with subagent_type=critic"; agents/critic.md frontmatter must use the field name Claude Code's plugin loader actually reads (likely `name` matching the directory or filename).

### F4 — `DEGRADES`: BuildGate blocks ALL edits, including its own state writes
Phase skills WRITE markdown files to `.archforge/`. If BuildGate is "block edits until Phase 7", and phase-2 skill tries to write `components.md`, BuildGate blocks it. Self-deadlock.
**Fix:** BuildGate must whitelist writes to paths under `.archforge/` AND the project's `BUILD_PLAN.md` / docs; only block writes to source code (everything else). Define the whitelist explicitly.

### F5 — `DEGRADES`: LoopGuard relies on diff hashes that don't exist in the hook payload
PreToolUse hooks receive the tool name and the tool's input arguments — for Edit, that's `file_path`, `old_string`, `new_string`. Hashing `new_string` works for detecting "same diff", but "counter-edit" detection (T1 adds X, T5 removes X) requires comparing `new_string` of one event with `old_string` of another. Doable but the plan glosses over it.
**Fix:** explicitly define the edit-log schema: `{timestamp, file, old_hash, new_hash}`. Counter-edit = an event whose `old_hash` matches a recent event's `new_hash` AND whose `new_hash` matches that event's `old_hash`.

### F6 — `RISKY`: `npx tsx ./hooks/file.ts` from a plugin path is fragile
Plugins live in `~/.claude/plugins/<name>/` (or wherever Claude Code installs them). The hook command runs with the user's project as cwd, not the plugin's dir. `./hooks/file.ts` will resolve relative to the user's project and break.
**Fix:** the hook command must use the plugin's directory. Use the env var Claude Code exposes (commonly `CLAUDE_PLUGIN_DIR` or similar); if unknown, embed `${CLAUDE_PLUGIN_ROOT}` placeholder and document the exact var to use.

### F7 — `RISKY`: `tsx` requires `node_modules` install; users won't run `npm install` in a plugin dir
Distributing TypeScript hooks via a Claude Code plugin without a post-install step means the first hook invocation crashes because `tsx` isn't installed.
**Fix:** either (a) ship pre-compiled `.js` and skip `tsx`, or (b) document a one-time `cd <plugin>/hooks && npm install`. Option (a) is simpler for users but adds a build step for the maintainer. **Decision (revised plan):** ship pre-compiled JS alongside the `.ts` source. CI builds; users get `.js`.

### F8 — `DEGRADES`: README "demo GIF placeholder" is a known unfilled hole
Spec said "demo GIF placeholder" but reviewers will mark this as incomplete. State explicitly that the GIF is a follow-up artifact not blocking v0.1.

### F9 — `RISKY`: No mention of how `state.json` survives concurrent edits
If a phase skill is mid-write and the user opens a second Claude session in the same project, both can corrupt `state.json`. Probably rare but worth a sentence.
**Fix:** all state writes use atomic write-then-rename (write `state.json.tmp`, `fs.renameSync`).

### F10 — `BREAKS`: Self-deadlock — ArchForge built BY ArchForge would be blocked by its own BuildGate
If we eat our own dogfood literally, the BuildGate hook would fire on the very file writes that build it. We are NOT installing the plugin to build the plugin (we're building the plugin from scratch in a fresh repo), so this is fine in practice — but worth documenting that ArchForge is intended to be installed AFTER the project skeleton exists, never to bootstrap a project from `claude init`.

## Verdict
Plan is directionally right but has 5 BREAK-class holes (F1, F2, F3, F4, F10) and 5 DEGRADE/RISKY items that need fixes before code starts. Revising `BUILD_PLAN.md` now.
