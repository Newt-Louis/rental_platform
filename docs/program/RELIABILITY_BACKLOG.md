# Reliability Backlog

Tracks every reliability finding surfaced by `docs/program/02-E2E-WORKFLOW.md`
(Phase 2) and updated as each is resolved by its owning phase. A finding is
only marked `RESOLVED` once actually fixed and test-covered in this
repository — not when merely documented or scoped.

| ID | Flow | Risk | Phase Owner | Status | Evidence |
|----|------|------|-------------|--------|----------|
| 1 | `BookingService.create()` | Booking row commits while Unit/Lead status updates fail partway (unwrapped writes); also a genuine duplicate-ACTIVE-booking race found in Phase 6 (concurrent creates both reading `MAX(priority)=0`) | Booking Phase / **Phase 6** | **RESOLVED** | `booking.service.ts` `create()` — one Serializable transaction + `runSerializable` P2034-retry helper. Tests: `booking-reliability.spec.ts`. Live-verified: 0 units with duplicate ACTIVE bookings (`scripts/backbone-reconciliation.mjs`) |
| 2 | `BookingService.update()` (unit-change path) | Same class of risk, plus the same queue-position race on the target unit | Booking Phase / **Phase 6** | **RESOLVED** | `booking.service.ts` `update()` — queue-position recomputed inside the same Serializable transaction as the write. Tests: `booking-reliability.spec.ts` |
| 3 | `BookingService.cancel()` | Same class of risk — a CANCELLED booking could leave its unit still reserved if queue promotion failed after the status write | Booking Phase / **Phase 6** | **RESOLVED** | `booking.service.ts` `cancel()` — atomic + idempotent (a retry against an already-cancelled booking is a safe no-op, not an error). Tests: `booking-reliability.spec.ts` |
| 4 | `ProposalsService.submit()` | Live `ApprovalWorkflow` could exist against a still-DRAFT proposal if the process crashed mid-write; no protection against a double-submit race | **Phase 3** | **RESOLVED** | `apps/backend/src/modules/proposals/proposals.service.ts` `submit()` — wrapped in one Serializable transaction, re-checks DRAFT status inside it, resolves a lost double-submit race via the pre-existing `ApprovalWorkflow.proposalId` unique constraint (P2002 repair). Tests: `proposals.service.spec.ts` (3 cases incl. the race), full suite green. |
| 5 | `ContractsService.updateStatus()` → billing schedule | Contract could end up `ACTIVE` with no billing schedule if schedule generation failed (ran outside the status-change transaction) | **Phase 3** | **RESOLVED** | `contracts.service.ts` `updateStatus()` — status change, `ContractEvent`, outbox-enqueue, and `billingScheduleService.buildScheduleForContract(id, tx)` now run inside one Serializable transaction; a lost concurrent-activation race (P2034) resolves to the winning outcome instead of erroring. `BillingScheduleService.buildScheduleForContract` now accepts an optional `tx` client so it can join a caller's transaction. Tests: `contract-activation.spec.ts` (5 cases incl. the concurrency race), full suite green. |
| 6 | `FitoutService.handleContractActivated()` (fitout project auto-creation) | Contract can end up `ACTIVE` with no fitout project, silently — the outbox-consumer's try/catch swallows the error, so the outbox's own retry never fires | Fitout Phase (Phase 5) | **RESOLVED** | `apps/backend/src/modules/fitout/fitout.service.ts` `createFromContract()` — atomic (project + first milestone in one transaction) + idempotent (P2002 repair on `FitoutProject.contractId @unique`). The outer event-handler's log-and-swallow boundary is unchanged (a genuinely failed create still isn't auto-retried by the outbox), but a half-created project can no longer exist, so a manual retry/recreate starts clean. Test: `fitout-lifecycle.spec.ts` |
| 7 | `FitoutService.advanceStatus()` (stage advance) | Unit status and fitout project stage can desync across 5 unwrapped write steps | Fitout Phase (Phase 5) | **RESOLVED** | `fitout.service.ts` `advanceStatus()` — unit-status transition, project-status update, both milestone writes, and the override audit log now commit as one Serializable transaction; concurrent-advance races resolve via in-transaction re-read (idempotent replay on exact-match, clear conflict error on stale-read, `P2034` repair on genuine same-instant race). Test: `fitout-lifecycle.spec.ts` (9 cases) |
| 8 | Approval `step-advanced` event bypasses the outbox retry path that `completed`/`rejected` use | **Evaluated in Phase 3, correctly left open — see reasoning below.** Missed "notify the next approver" side effect only; the workflow step itself has already committed atomically before this event fires, so no Proposal/Contract state-correctness risk. Re-confirmed in Phase 5: the Fitout-submittal side of this same event (`FitoutSubmittalService`'s own `step-advanced` listener) has the identical shape — notification-only, state already committed — so the same reasoning applies platform-wide, not just to Proposal. | Approval / Platform Reliability Phase | OPEN (evaluated, twice now) | `02-E2E-WORKFLOW.md` Transition 8; `approvals.service.ts:274`; `proposals.service.ts:561-565`; `fitout-submittal.service.ts` `onWorkflowCompleted`/`Rejected` (`step-advanced` listener not separately defined for Fitout beyond the shared notify call — confirmed same shape) |
| 9 | Fitout-submittal approver emails bypass the retryable `EmailDeliveryService` (unlike SLA-breach/AR-dunning emails in the same module) | Approver email not retried on transient SMTP failure — the in-app `Notification` still fires either way, so not a silent miss, just a degraded channel | Fitout Phase (Phase 5) | **RESOLVED** | `fitout-submittal.service.ts` `notifyPendingApprovers()` — now routes through `EmailDeliveryService.enqueue()`, deterministic per-(submittal, step, approver) `eventKey` prevents duplicate sends on re-trigger |
| 14 | `FitoutSubmittalController` had no mall-access enforcement on any route — unlike `FitoutController`'s `validateProject` pattern | A staff user with `fitout-submittals` role access but no mall assignment for a given project could read/act on submittals for any mall's fitout projects | Fitout Phase (Phase 5) | **RESOLVED** | `fitout-submittal.controller.ts` — every route now resolves its target project (directly, or via `FitoutSubmittalService.getProjectId`) and calls the same `mallAccess.extractAndValidateMallAccess` check `FitoutController` already used |

## Item 8 — why it stayed out of Phase 3 scope (per the phase brief's own boundary rule)

The Phase 3 brief's rule: fix the `step-advanced` retry gap within Phase 3
*only if* Contract/Proposal lifecycle correctness directly depends on it.
Verified against code: `ProposalsService.onApprovalWorkflowStepAdvanced`
(`proposals.service.ts:561-565`) does exactly one thing —
`notifyPendingApprovers(payload.workflowId, payload.nextStepOrder)`. The
actual state transition (`ApprovalStep.status`, `ApprovalWorkflow.status`)
already committed inside `ApprovalsService.approve()`'s own Serializable
transaction *before* this event is emitted. If the event is dropped, the
worst outcome is a delayed/missed notification to the next approver — not
an incorrect Proposal or Contract state. Per the phase brief's own rule 31
("notification is not state"), this is exactly the kind of gap that's
correctly deferred rather than fixed inside a lifecycle-correctness phase.
Left to whichever phase owns platform-wide event-delivery consistency.

## Found during Phase 3 verification (not one of the original 9)

| ID | Flow | Risk | Phase Owner | Status | Evidence |
|----|------|------|-------------|--------|----------|
| 10 | `ContractTerminationService.cancel()` restores `Contract.status` to `ACTIVE`/`EXPIRING`/`EXPIRED` without re-running `buildScheduleForContract` | If a contract's financial terms were amended while `TERMINATING`, cancelling the termination restores it to `ACTIVE` with a now-stale billing schedule. Low probability (requires an amendment mid-termination), not a "half-active-with-no-schedule" case — a schedule already exists from the original activation, just possibly outdated. Investigated further in Phase 4 (see item 10b below) — the more severe, actually-reachable variant of this class of risk has been fixed; this specific narrow case remains open. | Contract Lifecycle / Termination flow (future pass) | OPEN | `docs/program/03-CONTRACT-LIFECYCLE-MAP.md` "Invariant now enforced" section; `contract-termination.service.ts:145-168` |
| 10b | `BillingScheduleService.buildScheduleForContract` (manual rebuild endpoint) had no contract-status guard beyond the `isActive` soft-delete flag | **RESOLVED, Phase 4.** Could regenerate/resurrect a full billing schedule (through the contract's original `endDate`) for a `TERMINATED`/`TERMINATING`/`DRAFT`/`EXPIRED` contract via `POST /billing/schedule/:contractId/build` — this was the actually-reachable, higher-severity variant of the item-10 class of risk (Phase 3 only investigated the `cancel()` path; Phase 4 investigation found the manual-rebuild path was the real exposure). Fixed by restricting schedule (re)generation to `ACTIVE`/`EXPIRING` contracts only, matching `generateDueInvoices()`'s own filter. | Billing Phase (Phase 4) | **RESOLVED** | `apps/backend/src/modules/billing/billing-schedule.service.ts` `buildScheduleForContractUnsafe()`; test: `billing-schedule.service.spec.ts` |
| 11 | `ArDunningService` reads overdue invoices in one batch pass, then sends reminder emails — a payment that clears the invoice between the read and the actual send can still trigger one reminder | Tenant receives one stale "you owe X" reminder for a debt just paid. Never repeats (dunning-log unique constraint prevents re-sending the same policy level). Same eventual-consistency class as the pre-existing SLA-breach email gap (Phase 2 finding). | AR Dunning / Platform Reliability (future pass) | OPEN (evaluated, documented) | `docs/program/04-BILLING-CONCURRENCY.md` scenario 5 |
| 12 | Outstanding-AR formula (`adjustedTotal − netPaid`) is independently implemented in 5 places (`BillingService`, `ArDunningService`, `CollectionKpiService`, `PenaltyInterestService`, plus the canonical one) instead of one shared function | Verified mathematically identical today — not a live bug — but a future change to the formula in one place risks silently diverging from the other three. Consistency risk, not a correctness bug. | Billing Phase (future refactor pass) | OPEN (documented, low urgency) | `docs/program/04-BILLING-DOMAIN-MAP.md` "Money rules" section |
| 13 | `FilesController.downloadUnifiedDocument`'s `INVOICE` case had no role restriction for non-tenant users — any authenticated staff role, including ones with no Billing module access, could download invoice documents | **RESOLVED, Phase 4.** Restricted to `ADMIN`/`FINANCE`/`MALL_DIRECTOR` (matching `role-permissions.ts`'s `billing` read-access list), tenant-ownership check unchanged. | Billing Phase (Phase 4) | **RESOLVED** | `apps/backend/src/files/files.controller.ts`; test: `files.controller.spec.ts` |

## Found during the Backbone Consolidation Gate (2026-08-19)

| ID | Flow | Risk | Phase Owner | Status | Evidence |
|----|------|------|-------------|--------|----------|
| 15 | `FitoutService.handleContractActivated()`'s try/catch swallowed a genuine `createFromContract` failure with no retry — Phase 5 made the *creation itself* atomic/idempotent, but the outer event-handler boundary was not in that phase's scope | Contract could end up `ACTIVE` with billing correctly initialized and Fitout silently missing; only operator-visible signal was a "not started yet" badge that reads the same as a normal pending state, not a failure | Fitout Phase / this Gate | **RESOLVED** | `fitout.service.ts` `handleContractActivated()` — now rethrows instead of swallowing, so `OutboxService.processBatch()` marks the event `FAILED` and retries with its existing exponential backoff. Safe because `createFromContract` is idempotent (Phase 5). Test: `fitout-lifecycle.spec.ts` ("rethrows a genuine createFromContract failure so the outbox retries it") |
| 16 | `FitoutService.advanceStatus()` never reads `Contract.status` — a `TERMINATING`/`TERMINATED` contract's fitout project can still advance, including to `OPENED` (Handover) | P2 — operationally nonsensical (a terminated tenant's fitout progressing toward handover), not a data-corruption/financial risk (no shared DB constraint is violated), nothing fails silently. Symmetric to the Billing-side gap Phase 4 already fixed (`buildScheduleForContract`'s status guard) — the equivalent was never added on the Fitout side. Verified 0 live occurrences (no terminated contracts with fitout projects exist in current data) — a code-level gap, not a live-data violation. | Fitout Phase (continuation) / Phase 6 | OPEN — top candidate for an immediate small follow-up given how directly it parallels an already-fixed case | `06-BACKBONE-CONSOLIDATION.md` Finding C |
| 17 | `BillingScheduleService.generateDueInvoices()`'s per-contract loop called `buildScheduleForContract` with no try/catch — Phase 4's new status guard turned a rare theoretical uncaught-exception trigger (soft-delete-while-active) into a realistic one (contract terminating mid-batch-run), which would have silently aborted invoice generation for every other contract later in the loop | A single mid-run termination could stop same-night invoice generation platform-wide, not just for the terminated contract | Billing Phase / this Gate | **RESOLVED** | `apps/backend/src/modules/billing/billing-schedule.service.ts` `generateDueInvoices()` — now catches, logs, and skips the failing contract, continues the batch. Test: `billing-schedule.service.spec.ts` ("skips a contract whose schedule rebuild fails instead of aborting the whole batch") |
| 18 | `prisma/seed.ts` inserts `ACTIVE`/`EXPIRING` contracts directly (`prisma.contract.create`), bypassing `ContractsService.updateStatus()` — none of the 12 seeded active contracts have a `BillingScheduleEntry` | Live reconciliation query (`scripts/backbone-reconciliation.mjs`) confirmed all 12 of 12 seeded ACTIVE/EXPIRING contracts violate the "ACTIVE contract has a billing schedule" invariant — a genuine live-data finding, root-caused to seed-script construction, not a defect in the application's own activation transaction (which structurally guarantees this for every contract that actually goes through it) | Data/Seed hygiene (future pass) | OPEN — P3, not urgent | `06-BACKBONE-RECONCILIATION.md` |

## Found during Phase 6 (CRM & Booking) (2026-08-19)

| ID | Flow | Risk | Phase Owner | Status | Evidence |
|----|------|------|-------------|--------|----------|
| 19 | `BookingService.reinstate()` had the same unwrapped-writes + priority-computation race as `create()` | Same risk class as items 1-3 | Phase 6 | **RESOLVED** | `booking.service.ts` `reinstate()` — now uses `runSerializable`. Test: `booking-reliability.spec.ts` |
| 20 | `BookingService.expireOverdueBookings()` (hourly cron) had the same unwrapped-writes pattern, plus no re-check against a booking a user acted on in the same window | The exact "expiry vs confirm" race the phase brief asked about (section 38) | Phase 6 | **RESOLVED** | `booking.service.ts` `expireOverdueBookings()` — each candidate re-validated inside its own transaction; one booking's failure no longer aborts the batch. Test: `booking-reliability.spec.ts` |
| 21 | `create()`'s booking-number generation (`count()`-based) has no explicit `P2002` handling if the `bookingNumber @unique` constraint is ever actually hit | Low probability — Serializable isolation should already prevent two transactions from computing the same count and both committing; this would only surface as a raw, ungraceful Prisma error in the very unlikely event isolation is somehow bypassed | Booking Phase (future, low priority) | OPEN — documented, not fixed | `docs/program/07-CRM-BOOKING-RETRY-MATRIX.md` |

## Confirmed dead feature flag — RESOLVED Phase 4

`BillingConfig.notifyTenantOnIssue` — was togglable in Billing settings but
never read anywhere in the codebase (confirmed by Phase 2's grep,
re-confirmed during Phase 3). **Fixed in Phase 4**: now checked in both
`BillingService.issueInvoice()` (manual issue) and
`BillingScheduleService.generateDueInvoices()`'s auto-issue path, queuing a
tenant notification through the same retryable `EmailDeliveryService`
already used for AR-dunning/fitout-SLA email — not a synchronous send, and
not gating the invoice-issue transaction's success on email delivery
succeeding (only on the cheap, local delivery-queue write succeeding).

**Status: RESOLVED. `apps/backend/src/modules/billing/billing.service.ts`
`enqueueInvoiceIssuedNotification()`; tests:
`billing.invoice-issue.spec.ts`.**

## Running total

- **Phase 3 resolved:** items 4, 5 (2 of the original 9).
- **Phase 4 resolved:** items 10b (billing-schedule resurrection guard, a
  more severe variant of the item-10 class found and fixed during Phase 4's
  investigation), the dead `notifyTenantOnIssue` flag, and item 13
  (invoice-document role-scoping gap, found and fixed during Phase 4).
- **Phase 5 resolved:** items 6, 7, 9 (all three original Fitout findings)
  and item 14 (new — Submittal-controller mall-access gap, found and fixed
  during Phase 5).
- **Backbone Consolidation Gate resolved:** items 15 and 17 — both new
  findings from this gate's own cross-module analysis, both fixed the same
  day they were found (a small, well-understood rethrow fix and a
  try/catch batch-resilience fix, respectively — neither was "broad
  feature implementation").
- **Open, assigned an owning phase, nothing silently dropped:** 1, 2, 3
  (Booking Phase, not yet scheduled), 8 (evaluated three times now across
  Phases 3, 5, and this gate, deferred with reasoning each time), 10
  (narrower than originally scoped — see 10b), 11, 12 (Billing Phase,
  documented consistency risks, not live bugs), 16 (Fitout Phase
  continuation — top candidate for an immediate follow-up given how
  directly it parallels an already-fixed Billing case), 18 (new this gate,
  P3 seed-data hygiene). Fitout submission-vs-stage-advance and
  approval-vs-resubmission concurrency (see `05-FITOUT-CONCURRENCY.md`
  scenarios 4-5) were reasoned about but not test-covered — not filed as
  numbered backlog items since no defect was found, just an acknowledged
  gap in test depth.

**Running total after the Backbone Consolidation Gate: 19 tracked rows
(items 1-18, with 10b as a distinct row from 10) — 10 resolved
(4, 5, 6, 7, 9, 10b, 13, 14, 15, 17), 9 open (1, 2, 3, 8, 10, 11, 12, 16,
18).

**For the gate's GO/NO-GO purposes (cross-module P0/P1 blockers), the
relevant open items are 16 (P2) and the ones evaluated this gate (8, 18) —
all non-blocking. Items 1-3 are intra-module Booking findings, same class
of risk as the already-fixed Proposal-submit case, but explicitly
out-of-scope for this cross-module gate per its own scoping rule (section
2: "MODULE BOUNDARIES... not a full-system re-audit") — they remain
tracked and owned by the not-yet-started Booking Phase, not re-litigated
or re-severity-rated here. Items 10, 11, 12 are Billing-phase items,
unchanged this gate.**

## Running total after Phase 6 (CRM & Booking)

**22 tracked rows total** (items 1-21, with 10b distinct from 10) —
**15 resolved** (1, 2, 3, 4, 5, 6, 7, 9, 10b, 13, 14, 15, 17, 19, 20),
**7 open** (8, 10, 11, 12, 16, 18, 21). Every Booking-cluster finding from
Phase 2's original list (items 1-3) is now resolved — **0 known P0, 0
known P1 reliability findings remain anywhere in the tracked backlog.**
The 7 open items are all P2/P3, or (item 8) an explicitly
evaluated-and-accepted notification-reliability gap, none of them blocking
normal business operation.
