# Phase 5 — Fitout & Handover: Completion Report

**Date:** 2026-08-19

## Phase 5 status: COMPLETE (reliability/correctness/security scope) — UX explicitly not attempted, consistent with Phase 4's precedent

Per the phase's own priority ordering (data integrity → atomicity →
idempotency → concurrency → workflow state → event/notification
reliability → auditability → **UX last**), this pass verified all three
known Fitout backlog items against current code, found all three still
present exactly as documented (no stale-audit surprises this time, unlike
Phase 3/4's corrections), fixed all three, plus found and fixed a fourth,
previously-undocumented gap (Submittal-controller mall-access enforcement)
during the domain-map investigation.

## Fitout auto-create

**BEFORE:** `FitoutService.createFromContract` — bare `findUnique` →
`create` with no transaction. A failure between the `FitoutProject.create`
and the `FitoutMilestone.upsert` left a project with no SLA tracking and
no automatic recovery (the outer event handler only logs and swallows).
Concurrent/redelivered `contract.activated` events could race past the
pre-check and hit an unhandled `P2002`, silently dropping that delivery's
execution with the error only logged, never resolved.

**AFTER:** Project creation + first milestone commit as one Serializable
transaction — either both exist or neither does. `FitoutProject.contractId`
already had a DB-level unique constraint; a genuine concurrent race now
resolves via the same P2002-repair pattern proven in
`createContractFromProposal` (Phase 3) and `ProposalsService.submit`
(Phase 3) — re-fetch, return the winner, no error surfaced.

## Stage advance

**BEFORE:** `FitoutService.advanceStatus` — 5 separate unwrapped writes
(conditional unit-status transition, project-status update, 2
milestone writes, optional override audit log). A crash partway could
leave `Unit.status` advanced with `FitoutProject.status` unchanged, or
vice versa — exactly the invariant violation section 13 warns against.
No concurrency handling at all: two concurrent advances would silently
last-write-wins with no error to either caller.

**AFTER:** All five writes commit as one Serializable transaction,
gated by an in-transaction re-read of the project's current status:
- Exact-match (project already at the requested target) → idempotent
  no-op success, handles double-click/retry cleanly.
- Stale-read (project moved to a *different* status since validation) →
  clear `BadRequestException` telling the caller to refresh, not a silent
  overwrite.
- Genuine same-instant commit race (`P2034`) → resolved to the winning
  outcome, same pattern as Contract activation (Phase 3).

## Concurrency

7 scenarios analyzed in `05-FITOUT-CONCURRENCY.md`. 3 newly test-covered
(auto-create race, stage-advance conflict, stage-advance idempotent
replay — 9 total new tests). 1 (SLA-vs-completion timing) documented as an
accepted eventual-consistency window, matching how the equivalent Billing
scenario was handled in Phase 4. 2 (submission-vs-advance,
approval-vs-resubmit) reasoned about from the code but explicitly **not**
test-covered — flagged honestly rather than claimed verified.

## Notifications

**BEFORE:** `FitoutSubmittalService.notifyPendingApprovers` called
`emailService.sendMail()` directly — no retry, no delivery visibility,
inconsistent with the SLA-breach/AR-dunning emails in adjacent code that
correctly use the retryable queue.

**AFTER:** Routed through the same `EmailDeliveryService` (15s poll,
exponential backoff to 30 min) already proven elsewhere. Deterministic
per-(submittal, step, approver) `eventKey` prevents duplicate sends if the
same step's notification logic runs twice. In-app `Notification` (the
actual approval task, unaffected by email delivery) was already correct
and untouched — email failure never risked losing the task itself, even
before this fix; the fix closes the *retry* gap, not a data-loss gap.

## SLA

Re-verified, not changed: `FitoutSlaService.checkSlaBreaches` already uses
`SchedulerLockService` (distributed lock + `JobExecution` ledger) and the
retryable `EmailDeliveryService` correctly. `recordMilestone`/
`completeMilestone` gained an optional transaction-client parameter this
phase (to join `advanceStatus`'s transaction) — the SLA cron's own
read/write pattern is otherwise unchanged.

## Handover

Confirmed there is no separate "Handover" entity or transition — reaching
the terminal `OPENED` stage (gated by an approved `HANDOVER_FORM`
submittal) *is* Handover in this domain, and it now inherits all of
`advanceStatus`'s atomicity/idempotency/concurrency guarantees, since it's
the same code path as every other stage transition. No dedicated Handover
hardening was needed beyond the general `advanceStatus` fix.

## Security

**Found and fixed:** `FitoutSubmittalController` had zero mall-access
enforcement on any of its 11 routes — only the class-level role guard
applied. A staff user with role access to Fitout submittals but no mall
assignment for a specific project could read/act on that project's
submittals regardless of mall scope. Every route now resolves its target
project and runs the same `mallAccess.extractAndValidateMallAccess` check
`FitoutController` already used for its own routes.

**Re-verified, unchanged:** Fitout document access (`fitout-documents/
:fileId`, and the `FITOUT_SUBMITTAL`/`FITOUT_ISSUE`/`FITOUT_DAILY_REPORT`
cases of `documents/:fileId`) already enforces authentication + tenant
ownership + role checks, confirmed in Phase 4's `files.controller.ts`
review — not re-broken by this phase's changes, not re-tested here since
no code in that controller was touched this phase.

## Audit

`AuditLog` (global interceptor, unchanged) covers every POST/PUT/PATCH.
The Fitout-specific `FITOUT_GATE_OVERRIDE` audit entry now commits inside
the same transaction as the stage advance it documents — an override that
can't be logged no longer silently takes effect anyway (Phase 5 fix, part
of the `advanceStatus` atomicity work).

## Failure injection

Both hardened flows have dedicated tests simulating the actual failure
classes: a genuine mid-transaction error (propagates and rolls back,
verified via the "propagates a genuine failure" test), a lost P2002/P2034
race (resolved gracefully), and a stale-read conflict (rejected clearly).

## UX

Not attempted this phase, matching Phase 4's precedent and the phase
brief's own "UX only after reliability" ordering. Sections 38-43 (Fitout
detail content, process guide, blocked-transition messaging, work queue,
role experience) remain open for a future pass.

## Tests

**PASS.** Full backend suite: 66/66 suites, 337/337 tests (Phase 4 ended
at 328; +9 net from this phase's new `fitout-lifecycle.spec.ts`). 0
regressions.

## Build

**PASS.** `npx tsc --noEmit` clean throughout.

## Files changed

**Backend:**
`modules/fitout/fitout.service.ts` (createFromContract + advanceStatus
hardening),
`modules/fitout/fitout-sla.service.ts` (recordMilestone/completeMilestone
tx-client param),
`modules/fitout/fitout-submittal.service.ts` (retryable notification,
getProjectId helper, removed now-unused EmailService dependency),
`modules/fitout/fitout-submittal.controller.ts` (mall-access enforcement
on every route).

**Tests:** new `modules/fitout/fitout-lifecycle.spec.ts` (9 tests).

**Docs:** `docs/program/05-FITOUT-DOMAIN-MAP.md`,
`05-FITOUT-STATE-MACHINE.md`, `05-FITOUT-FAILURE-MATRIX.md`,
`05-FITOUT-CONCURRENCY.md`, `05-FITOUT-HANDOVER-COMPLETION.md` (this
file), `docs/program/RELIABILITY_BACKLOG.md` (updated).

No frontend files changed.

## Regression check

Re-ran the full suite (not just Fitout's), confirming Phase 3/4 hardening
(Proposal submit, Contract activation, Invoice generation/issue, Payment
recording, Approval engine) all still pass unchanged — Fitout's changes
touched shared collaborators (`UnitStatusService.transition`,
`EmailDeliveryService`) but only by adding an optional trailing parameter,
not altering their existing call signatures' defaults.

## Reliability backlog

Before this phase: 13 tracked, 5 resolved, 8 open.
After this phase: **14 tracked** (1 new: item 14) — **9 resolved** (+4:
items 6, 7, 9, 14) — **5 open** (items 1, 2, 3 — Booking, not yet
scheduled; item 8 — evaluated twice, correctly deferred; items 11, 12 —
Billing, documented low-urgency risks; item 10 — narrow termination edge
case).

## New findings

Item 14 (Submittal-controller mall-access gap) — found during the domain
map investigation this phase was asked to do, not from a prior audit.
Fixed the same phase it was found, per the "no issue disappears" rule
rather than deferred.

## Production impact

No breaking API changes, no new migrations, no removed routes. Two
behavioral changes: (1) `PUT /fitouts/:id/status` on an already-at-target
project now returns success instead of silently double-writing (or,
previously, having undefined last-write-wins behavior under concurrency);
(2) `fitout-submittals/*` routes now enforce mall access — a caller
without mall assignment for a project's mall who was previously served
data will now get a 403. This is a correctness fix, not contract-breaking
for any legitimately-scoped caller.

## Recommended next phase

Per the master program's sequencing: **Phase 6 (CRM & Booking)** — picks
up reliability-backlog items 1-3 (Booking non-atomicity), the last
unresolved cluster from the original Phase 2 findings, and continues the
program into its upstream (Lead/Booking) surface after four phases
working downstream (Contract → Billing → Fitout). Alternatively, any of
the three phases' deferred UX reviews (Billing sections 33-39, Fitout
sections 38-43) are available as a consolidated UX pass if preferred over
continuing reliability work.
