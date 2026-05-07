# ArchForge

> A Claude Code plugin that **stops Claude from building the wrong thing** by forcing a 7-phase deliberation workflow before any code is written.

Claude Code is fast and confident. That's the problem. The cascade-failure pattern is well-known: Claude builds, gets a little confused, fixes one thing while breaking another, loops, and gradually destroys the codebase. ArchForge prevents this by treating the planning phase as a first-class artifact, subjecting it to an adversarial critique by a forked subagent, and refusing to let Claude write source code until the plan has survived attack.

![demo placeholder — watch ArchForge stop Claude before it builds the wrong thing](docs/demo.gif)

> Demo GIF is a follow-up artifact, not blocking v0.1. To see it run, install and try `/archforge "build a thing"`.

---

## Install

One-liner from inside any Claude Code session:

```
/plugin install github.com/akostov921/archforge
```

Or test locally before installing:

```
git clone https://github.com/akostov921/archforge
claude --plugin-dir ./archforge
```

Then start a run:

```
/archforge "rebuild the lead-scoring service in Rust"
```

---

## What it does, in plain English

When you invoke `/archforge`, the plugin asks one question: **how big is this?** Three answers:

1. **Quick exploration / prototype** → skip the heavy planning, jump to building.
2. **Production feature in an existing app** → start at component decomposition.
3. **New product / system / large feature** → walk all 7 phases.

For path 3, you go through:

| Phase | What happens | Output |
|-------|--------------|--------|
| **0. Requirements** | Claude asks you clarifying questions in batches until it self-rates >85% confident. No hard cap on rounds. | `requirements.md` |
| **1. Architecture** | Generate 3-7 alternative architectures, stress-test each under scale/security/cost/edge cases, pick a winner with explicit comparison. | `architecture-options.md`, `stress-tests.md`, `decision.md` |
| **2. Components** | Decompose into components with concrete interfaces and a DAG dependency graph. Every cross-component contract has an explicit failure mode. | `components.md` |
| **3. Risks** | List every "I don't know how" moment. Resolve via research, prototype, or explicit deferral. Define test strategy per component. | `risks-resolved.md` |
| **4. Build plan** | Topologically sort components. Define a tracer-bullet path. Per-step verification commands. | `build-plan.md` |
| **5. Critique** | A **forked subagent** with zero conversation history reviews the plan. Adversarial framing. Banned phrases (`looks good`, `probably`, `seems`...). Every finding requires a real URL citation. Minimum 7 findings. If it finds BREAKS-class issues, you loop back. | `critique-vN.md` |
| **6. Approval** | Executive summary with top-3 critique findings. You approve, loop back, or abort. **Only mandatory user touchpoint after triage.** | `summary.md` |
| **7. Execute** | Claude builds per the plan, one step at a time, with verification at each step. **LoopGuard hook** detects edit churn and counter-edits and stops Claude. **BuildGate** opens for source edits only at this phase. | actual code + `progress.md` |

All artifacts live in `.archforge/` inside your project. They're plain markdown. Versioned (`requirements-v1.md`, `requirements-v2.md`...). Git-track them or `.gitignore` them — your call.

---

## The Critic — why this is different

Most "thoughtful" Claude workflows are theatre because Claude critiques its own plan. The critique is soft because the same model has motivated reasoning to ship.

ArchForge's critique runs in a **separate subagent invocation** — own context window, no conversation history with the planner. The critic prompt:

- Forbids softening phrases (`looks good`, `overall`, `I think`, `probably`, `seems`, `might`)
- Requires every finding to quote the plan exactly and cite a real URL
- Demands a minimum of 7 findings — if fewer, the orchestrator re-invokes the critic
- Mandates probing 7 specific dimensions: scale, security, dependency change, edge case, maintenance, cost, integration
- Prohibits constructive suggestions in the critique itself — pure attack only

If the critique surfaces a `BREAKS`-class finding, the run loops back to the relevant phase and regenerates. After 3 cycles without convergence, it escalates to you.

This is the moat. Without it, ArchForge would be a verbose CLAUDE.md.

---

## The hooks

Three `PreToolUse` hooks fire on file-mutating tool calls:

- **BuildGate** (Edit/Write/MultiEdit/NotebookEdit) — until `state.phase >= 7`, blocks edits to source code with a "plan not finalized" message. Whitelists planning artifacts (`.archforge/`, root `*.md`, `docs/`).
- **BashGate** (Bash) — closes the obvious bypass: blocks `>`, `>>`, `tee`, `sed -i`, `awk -i inplace`, `perl -i`, `truncate` when the target is a source path and `phase < 7`. Heuristic, not airtight (see `CHANGELOG.md` for known limitations).
- **LoopGuard** (Edit/Write/MultiEdit/NotebookEdit) — logs every edit, detects:
  - **Counter-edits** (T1: `A → B`, then T5: `B → A`) → STOP
  - **Minimal-variation churn** (3+ edits to the same file with similar lengths within 5 min) → STOP
  - **Same-file frequency** (4+ edits in 15 min) → WARNING, not stop

State writes are atomic (tmp+rename) with retry on EPERM/EACCES/EBUSY (Windows compatibility) and use an advisory `state.lock` for concurrent-session safety. Edit-log hashes are full SHA-256, log is rotated on every write to stay bounded.

Hooks are TypeScript in `hooks/src/`, compiled to JS in `hooks/dist/` — zero install step for users.

---

## When to use this

- Greenfield products / services / large features
- Production code that will live > 6 months
- Teams that have been burned by Claude cascade-failures before
- Any task where the cost of building the wrong thing exceeds the cost of an extra hour of planning

## When NOT to use this

- Quick prototypes or one-off scripts (use the `quick` triage path or just don't use ArchForge)
- Bootstrapping an empty project — install ArchForge **after** you have a project skeleton, not as a way to start one
- Tasks under ~50 lines of code
- Tasks where you already know exactly what you want and just need it typed out

---

## Honest limitations

- **Cost.** The Critic is pinned to Opus 4.7 (~$5/$25 per Mtok). A typical critique cycle is ~$1-3. If you loop 2-3 times, factor that in. Future work: a `--cheap` flag to use Sonnet for the critic at lower assurance.
- **The "≥7 findings" gate is prompt-level + programmatic JSON+heuristic checks.** A determined model can pad findings, but combined with the URL-citation requirement, exact-quote requirement (every finding's claim must contain `file.ext:lineno`), and banned-phrase detection (incl. synonym escapes), padding is hard. Not impossible. Future work: post-hoc verify cited URLs return 200.
- **BashGate is heuristic.** Known evasions: `eval`, dynamically-built paths via env vars, `find -exec`. `rm`/`mv`/`cp` are NOT gated (too noisy). For paranoid projects, lock down further in your own settings.
- **State coupling between sessions.** Advisory lockfile + atomic rename mitigate corruption. Logical consistency is best-effort — running two parallel ArchForge runs in the same project is unsupported.
- **LoopGuard's "minimal variation" uses length-tolerance**, not semantic similarity. It may miss semantically-identical edits that change length significantly, and may false-positive on cosmetic refactors. Tunable in `hooks/src/loopguard.ts`.
- **No IDE integrations** — Claude Code only. Cursor, Windsurf, etc. don't load this plugin.
- **The critic uses `WebSearch`/`WebFetch`** — if the network is restricted, the critic falls back to training-data-grounded findings, which the validation gate will flag as missing/invalid `evidence_url` and re-invoke. After 2 invalid invocations the critique is escalated to the user.
- **Supply-chain trust.** v0.2 ships compiled `hooks/dist/*.js` from the maintainer's machine without a signature. Until v0.3 adds GPG-signed tags + SHA256 sums, install only from the canonical repo and verify the commit SHA.

---

## File structure

```
archforge/
├── .claude-plugin/plugin.json          # manifest
├── skills/
│   ├── archforge-orchestrator/SKILL.md # dispatcher + triage
│   ├── archforge-phase-0-requirements/SKILL.md
│   ├── archforge-phase-1-architecture/SKILL.md
│   ├── archforge-phase-2-components/SKILL.md
│   ├── archforge-phase-3-risks/SKILL.md
│   ├── archforge-phase-4-buildplan/SKILL.md
│   ├── archforge-phase-5-critique/SKILL.md
│   ├── archforge-phase-6-approval/SKILL.md
│   └── archforge-phase-7-execute/SKILL.md
├── agents/
│   └── critic.md                       # the moat — adversarial subagent
├── commands/
│   ├── archforge.md                    # /archforge "..."
│   ├── archforge-resume.md             # /archforge:resume
│   └── archforge-status.md             # /archforge:status
├── hooks/
│   ├── hooks.json                      # PreToolUse declarations
│   ├── package.json                    # devDeps for build
│   ├── tsconfig.json
│   ├── src/
│   │   ├── lib/state.ts                # shared state + I/O helpers
│   │   ├── build-gate.ts
│   │   └── loopguard.ts
│   ├── dist/                           # compiled JS — what hooks.json invokes
│   └── test/sample-edit.json           # test fixture
├── examples/
│   └── example-run.md                  # annotated walkthrough
├── README.md
├── LICENSE                             # MIT
├── BUILD_PLAN.md                       # how this plugin was itself built
├── BUILD_PLAN_CRITIQUE.md              # ...and the critique of that plan
└── FINAL_REVIEW.md                     # post-build self-audit
```

---

## Development

```bash
git clone https://github.com/akostov921/archforge
cd archforge/hooks && npm install && npm run build
cd .. && claude --plugin-dir .
```

After editing `hooks/src/*.ts`, run `npm run build` in `hooks/` to regenerate `dist/`.

---

## Credits

Built on top of [Claude Code](https://docs.claude.com/claude-code) by Anthropic. Plugin architecture follows the [official plugin spec](https://code.claude.com/docs/en/plugins).

Maintained by [Nemei Systems](https://nemei.systems) — cybersecurity + AI automation, Sofia.

---

## License

MIT — see [LICENSE](./LICENSE).
