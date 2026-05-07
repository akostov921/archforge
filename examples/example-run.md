# ArchForge — Annotated Example Run

A walkthrough of using ArchForge on a realistic task: **adding a "magic-link login" flow to an existing Next.js app**. This is a feature in an existing app, so the run uses the `feature` triage path (start at Phase 2).

---

## Session start

```
> /archforge "add magic-link login to the customer dashboard"
```

ArchForge orchestrator runs. Asks the triage question:

```
Three options:
  1. Quick exploration / prototype — skip planning, jump to building
  2. Production feature in existing app — start at component decomposition
  3. New product / system / large feature — walk all 7 phases

Which?
```

User: `2`

Orchestrator writes `.archforge/state.json`:

```json
{
  "phase": 2,
  "triage": "feature",
  "goal": "add magic-link login to the customer dashboard",
  "started_at": "2026-05-07T12:30:00Z",
  ...
}
```

Hands off to `archforge-phase-2-components`.

---

## Phase 2 — Components

Claude reads the existing repo (CLAUDE.md, README, src layout) to ground the decomposition. Writes `.archforge/components.md`:

```markdown
## EmailDispatcher
**Responsibility:** Send transactional emails via Postmark.
**Inputs:** `{to: string, template: 'magic-link', vars: {token, returnUrl}}`
**Outputs:** Promise<{messageId, status}>
**Owns:** outbound mail metrics, Postmark API key, retry queue
**Depends on:** -
**Risks:** Postmark outage; rate limits at 10/sec; bounce handling
**Interface:**
  send(params: SendParams): Promise<SendResult>

## MagicLinkService
**Responsibility:** Issue and verify single-use magic links.
**Inputs:** email (issue), token (verify)
**Outputs:** session cookie on verify, void on issue
**Owns:** magic_links table (email, token_hash, expires_at, used_at)
**Depends on:** EmailDispatcher, Auth (for session creation)
**Risks:** token replay; clock skew; email enumeration via timing
**Interface:**
  issue(email: string): Promise<void>
  verify(token: string): Promise<{userId: string} | null>

## LoginUI
**Responsibility:** /login page that takes an email, shows "check your email" UX.
...

## Dependency graph

\`\`\`mermaid
graph LR
  LoginUI --> MagicLinkService
  MagicLinkService --> EmailDispatcher
  MagicLinkService --> Auth
\`\`\`

## Contracts
| Caller | Callee | Method | Payload | Failure mode |
| LoginUI | MagicLinkService | issue() | {email} | network → retry once, then show banner |
| Email link | MagicLinkService | verify() | {token} | invalid/expired → /login?err=expired |
| MagicLinkService | EmailDispatcher | send() | {to,template,vars} | Postmark down → queue + retry; >5 failures → page oncall |
```

State advances to phase 3.

---

## Phase 3 — Risks

Claude lists unknowns:

- "Does Postmark deliverability for magic links match transactional SLAs?"
- "What's the right TTL for magic-link tokens — 5 min, 15 min, 1 hour?"
- "How does our existing session library (lucia-auth) handle session creation from outside an HTTP request?"

Resolves each. Writes `.archforge/risks-resolved.md`:

```markdown
## Unknown 1 — Postmark magic-link deliverability
**Resolution method:** Research
**Finding:** Postmark categorizes magic-link emails as transactional. SLA is 99.9%. Inbox placement is high but Gmail occasionally delays by 1-3 min.
**Sources:** https://postmarkapp.com/why/transactional ; https://github.com/ActiveCampaign/postmark/issues/...

## Unknown 2 — TTL choice
**Resolution method:** Deferred with explicit accept
**Finding:** Industry default is 15 min. Auth0 uses 30 min. Acceptance criterion: 15 min initially; tighten if abuse observed.

## Unknown 3 — lucia-auth session creation
**Resolution method:** Prototype (./scratch/lucia-prototype.ts)
**Finding:** lucia.createSession() works from any context that has DB access. No HTTP requirement.
```

State advances to phase 4.

---

## Phase 4 — Build plan

Topo sort: `EmailDispatcher → MagicLinkService → LoginUI → wiring`.

Tracer bullet: "User submits email on /login → receives email → clicks link → lands on /dashboard logged in." All three components in the thinnest possible form, no UX polish.

Per-step plan with verification commands. State advances to phase 5.

---

## Phase 5 — Critique

ArchForge invokes the `critic` subagent. It runs in its own context (no history of the prior phases). Reads all `.archforge/*.md` files.

The critic's output (excerpt):

```yaml
findings:
  - id: F1
    claim: "magic_links table (email, token_hash, expires_at, used_at) — components.md:34"
    attack: "Storing email in plaintext in magic_links makes the table a high-value target. A read-only DB leak (very common in incidents) hands an attacker a list of every customer who tried to log in. Hash the email or store only a foreign key to the users table."
    evidence_url: "https://krebsonsecurity.com/2023/01/leaked-credentials-found-in-old-backups/"
    evidence_summary: "Multiple breaches over the past 5 years involved old DB snapshots leaking PII that was no longer needed in active tables."
    scenario: security
    severity: BREAKS

  - id: F2
    claim: "Acceptance criterion: 15 min initially — risks-resolved.md:14"
    attack: "15 min TTL with no rate limit on /login endpoint allows email enumeration: attacker probes 1M emails, watches which return 'sent' vs 'no account'. Plan does not mention rate limiting on issue() or response-time normalization."
    evidence_url: "https://owasp.org/www-community/attacks/Account_Enumeration"
    ...
    severity: BREAKS

  - id: F3
    ...

verdict:
  total_findings: 8
  breaks_count: 2
  degrades_count: 4
  risky_count: 2
  recommendation: LOOP_BACK_TO_PHASE_2
  loop_back_reason: "Components.md is missing rate-limiting and email-storage hardening; both belong in MagicLinkService's responsibilities."
```

Phase-5 skill saves this as `.archforge/critique-v1.md`. Increments `state.critique_cycles` to 1. Routes user back to phase 2.

User goes back, updates components.md (rate limit + email hashing), rolls forward through 3, 4 again. Re-critiques. Critic finds 4 new degrade-class issues but no breaks. Recommendation: `PROCEED`. Saves as `critique-v2.md`. State advances to phase 6.

---

## Phase 6 — Approval

ArchForge generates `.archforge/summary.md`:

```markdown
# ArchForge — Plan Summary for Approval

Goal: add magic-link login to the customer dashboard
Triage: feature
Critique cycles: 1

Architecture: lucia-auth + Postmark + new magic_links table.
Components: EmailDispatcher, MagicLinkService, LoginUI.

Top critique findings (residual after rework):
1. [DEGRADES] Token TTL of 15 min may be aggressive for some users on slow email...
2. [RISKY] Postmark single point of failure...
3. [RISKY] No automated test for the bounce-handling code path...

Build steps: 8. Tracer bullet: email → link → dashboard, no polish.
```

Asks user: A. Approve / B. Loop back / C. Abort.

User: A.

State advances to phase 7. Phase-7 skill announces: **"BuildGate is now open. Source-code edits are no longer blocked."**

---

## Phase 7 — Execute

Step 1: build EmailDispatcher.
- Files: `src/services/email-dispatcher.ts`, `src/services/email-dispatcher.test.ts`
- Verification: `npm test -- email-dispatcher` → green
- `progress.md` row: `| 1 | EmailDispatcher | completed | ... | ... | tests pass |`

Step 2: MagicLinkService.
- Files created.
- `npm test -- magic-link` → 1 test fails: token rotation logic.
- **STOP.** Phase-7 skill refuses to continue. Returns the user to phase 5: "test failed, this is a planning problem, not an execution problem."

User reviews. The test reveals an assumption in components.md that lucia handles session-on-verify atomically; in fact it doesn't. Updates components.md, rolls forward, re-critiques (no new breaks), re-approves, re-enters phase 7.

Step 2 retried. Passes. Step 3 LoginUI. Step 4 wiring. Tracer bullet works end-to-end.

ArchForge writes `.archforge/done.md` summarizing what shipped, what's deferred, what's known follow-up.

---

## What you'd see in your terminal

The whole run is conversational. The phase skills do most of the talking via Claude. The hooks are silent unless they fire.

Total user touchpoints in this example:
1. Initial `/archforge "..."` invocation
2. Triage choice
3. ~3 batches of clarifying Q&A (skipped here because feature path skips Phase 0)
4. Phase 6 approval (twice — once after critique loop-back)
5. Watching tests pass

Total Claude touchpoints (where you could intervene):
- After each phase: artifact written to `.archforge/`. You can read it. You can edit it. You can `/archforge:resume` from a later phase if you tweak.

---

## Things this example glosses over

- The actual UI/UX of the AskUserQuestion tool. Claude Code shows it as a styled prompt.
- The exact wording of the critic. See `agents/critic.md` for the canonical prompt.
- LoopGuard never fired in this run. If Claude had tried to "fix" the failing test without stopping, LoopGuard's counter-edit and minimal-variation rules would have blocked the third or fourth retry.
