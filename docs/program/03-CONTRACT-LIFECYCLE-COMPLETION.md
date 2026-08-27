# Phase 3 — Contract Lifecycle: Completion Report

**Date:** 2026-08-19

## Phase 3 status: COMPLETE

Scope, per the phase brief: make Proposal→Approval→Contract→Activation→
Billing-schedule atomic, idempotent, observable, understandable, and
operationally safe — not a Contract-screen redesign. Measured against the
brief's own yardstick: *can a real Contract move from Proposal through
Activation into Billing without partial state, duplication, hidden
failure, or operator guesswork?* — now yes, for the two flows in scope.

## Stale findings corrected

`docs/audit/11-INFORMATION-FLOW.md` claimed Contract→Fitout/Billing
handoff "requires institutional memory" and has no automatic trigger. This
was already stale before Phase 3 (Option B fixed the visibility gap
earlier); Phase 3 marked both passages `CORRECTED AFTER LIVE CODE
VERIFICATION` in place, rather than silently deleting the history or
leaving two contradicting documents in the repo with no explanation.

## Proposal submit

**Before:** Three unwrapped writes (pricing update → `ApprovalWorkflow`
create → status update to `SUBMITTED`). A crash between the workflow
create and the status update left a live `ApprovalWorkflow` referencing a
`Proposal` still showing `DRAFT` — an approver could see a pending item for
a proposal the submitter believed was never submitted. No protection
against a double-click/browser-retry/concurrent-API-call double-submit.

**After:** All four writes (pricing update, `ProposalVersion` snapshot,
`ApprovalWorkflow`+steps create, status update) run inside one
`Serializable` transaction that re-checks `DRAFT` status internally. A lost
double-submit race resolves via the pre-existing
`ApprovalWorkflow.proposalId` unique DB constraint (`P2002` caught,
resolved to the winning workflow) — the same pattern already proven in
`createContractFromProposal`. Best-effort notification dispatch
(`notifyPendingApprovers`) stays outside the transaction by design (network
side effect, not state).

**Transaction boundary:** one `prisma.$transaction(..., { isolationLevel:
Serializable })` around the full write set.

**Idempotency:** yes — concurrent double-submit produces exactly one
`ApprovalWorkflow`; both callers receive the same `workflowId`.

**Tests:** `proposals.service.spec.ts` — happy path (existing, re-verified),
"no rules configured" rejection (existing), and a new test for the
concurrent-double-submit race (P2002 → resolved to winner). Full backend
suite: 321/321 passing (was 319 at Phase 0 baseline; +2 net from this
phase's two new race-condition tests).

## Contract activation → billing schedule

**Before:** `Contract.status = ACTIVE` + `ContractEvent` + outbox-enqueue
committed in one transaction; `billingScheduleService.buildScheduleForContract(id)`
ran **afterward, outside** that transaction, as a direct synchronous call.
If schedule generation threw, the contract was already durably `ACTIVE`
with no billing schedule and no automatic recovery signal — only a UI
badge an operator had to notice, and a manual rebuild endpoint they had to
know existed.

**After:** `BillingScheduleService.buildScheduleForContract` now accepts an
optional Prisma transaction client and joins the caller's transaction when
given one. `ContractsService.updateStatus()` runs the status change,
`ContractEvent`, outbox-enqueue, *and* the billing-schedule build inside one
`Serializable` transaction. A concurrent-activation race (`P2034`,
Postgres's serialization-conflict error) is caught and resolved to the
winning outcome rather than surfacing a raw error. Re-calling activation
when already `ACTIVE` is now a safe, idempotent recovery path — it
re-attempts the outbox-enqueue and schedule build without re-writing the
already-correct status/event.

**Billing invariant:** "a contract must never appear operationally ACTIVE
when mandatory billing setup failed" now holds structurally for the
activation path (same transaction, same commit-or-nothing). One adjacent
path was found and documented, not silently missed: `ContractTerminationService.cancel()`
restores `Contract.status` to `ACTIVE`/`EXPIRING`/`EXPIRED` without
re-running schedule generation — low-risk (a schedule already exists from
before the contract entered `TERMINATING`), tracked as reliability-backlog
item 10 rather than fixed in this pass (out of Activation scope, in
Termination-flow scope).

**Concurrency:** tested — two-users-activate-same-contract race resolves to
one winner, verified via a new test asserting the `P2034` catch path.

**Tests:** `contract-activation.spec.ts` — readiness reporting (existing),
atomic activate (existing, mocks updated for the new in-transaction
re-read), pre-requisite rejection (existing), idempotent replay (existing,
mocks updated), and a new concurrent-activation-race test. Full backend
suite green.

## Proposal→Contract conversion (benchmark, verified unchanged)

Re-verified against current code, not re-derived: still atomic
(`Serializable` transaction), still duplicate-safe (`P2002` repair for a
concurrent double-conversion), still permission-scoped
(`PROPOSAL_CONVERT_ROLES`), still auditable (`ContractEvent` on later
changes, though — per Phase 2's finding, unchanged here — contract
*creation* itself via this path has no `ContractEvent` row, only
`ContractsService.create()`'s manual path does). No regression introduced.
`proposal-contract-conversion.spec.ts`: all 5 existing tests still passing.

## Concurrency / idempotency

Both hardened flows now have a dedicated concurrency test simulating the
DB-level conflict Postgres actually raises under `Serializable` isolation
(`P2002` for the unique-constraint case, `P2034` for the
serialization-conflict case) and asserting the caller-facing resolution —
not just asserting "no error," but asserting the *correct* winning state is
returned.

## Critical event delivery

Evaluated (not blindly fixed) per the phase brief's own scope rule: the
approval `step-advanced` event bypasses the outbox retry path that
`completed`/`rejected` use. Traced its only Proposal-side consumer
(`ProposalsService.onApprovalWorkflowStepAdvanced`) and confirmed it only
sends a next-approver notification — the actual state transition already
committed atomically before this event fires. Correctly left open,
documented with reasoning in `RELIABILITY_BACKLOG.md` item 8, owned by a
future Approval/Platform-reliability phase rather than fixed here (avoids
scope creep into an event-bus concern that isn't a Contract-lifecycle
correctness risk).

## Observability

Reused existing infrastructure rather than introducing a new stack:
- `OperationalMetricsService` (already exposed at `GET /operations/metrics`
  to ADMIN/CEO) extended with a generic named-counter map. Added counters:
  `proposal_submit_failure_total`, `contract_activation_failure_total`,
  `billing_schedule_generation_failure_total`,
  `duplicate_transition_blocked_total` (incremented on every resolved
  P2002/P2034 race, both flows).
- Structured JSON log lines (matching the existing convention used by
  `RequestObservabilityInterceptor`) added around the transaction boundary
  in both flows: `proposal.submit.started/completed/failed` and
  `contract.activation.started/completed/failed`, with
  `proposalId`/`contractId`, `tenantId` (proposal), `actorId` (contract),
  and `durationMs`. Scoped to the transaction boundary specifically (not a
  full-method rewrite) to keep the diff reviewable and avoid destabilizing
  already-tested validation logic earlier in each method.

## Contract detail UX

Reviewed against the brief's target list (status, current stage, what
happens next, downstream status, billing/fitout readiness, approval
history, key dates, action hierarchy, role experience) — **VALIDATED, no
redesign performed**, because the target state substantially already
exists:
- Handoff-readiness badges for Fitout/Billing with "View" links (Option B).
- A "Quy trình xử lý" (workflow) panel showing available next transitions
  and, when blocked, the exact missing prerequisites inline
  (`readiness.missing`).
- A "Source" panel linking back to the originating Booking/Proposal/Lead.
- An "events" tab (backend-authoritative `ContractEvent` audit trail, not
  frontend-only activity text) and a dedicated Termination tab with its own
  form and destructive (red) styling — already correctly distinguished from
  routine transitions, contrary to an initial assumption before reading the
  code.

No code change made here — confirming this required reading the component,
not assuming a gap existed because the brief listed it as a checklist item.

## Files changed

**Backend:**
`modules/proposals/proposals.service.ts` (submit() hardening + snapshotProposal
tx-client param + observability),
`modules/contracts/contracts.service.ts` (updateStatus() hardening +
observability),
`modules/billing/billing-schedule.service.ts` (buildScheduleForContract
tx-client param + failure counter),
`common/services/operational-metrics.service.ts` (generic counter support).

**Tests:**
`modules/proposals/proposals.service.spec.ts` (+1 race test, mock updates),
`modules/proposals/proposal-contract-conversion.spec.ts` (mock updates for
new constructor dependency),
`modules/contracts/contract-activation.spec.ts` (+1 race test, mock
updates),
`modules/billing/billing-schedule.service.spec.ts` (mock updates).

**Docs (this phase):**
`docs/program/03-CONTRACT-PATTERN-REFERENCE.md`,
`docs/program/03-CONTRACT-LIFECYCLE-MAP.md`,
`docs/program/RELIABILITY_BACKLOG.md`,
`docs/program/03-CONTRACT-LIFECYCLE-COMPLETION.md` (this file),
`docs/audit/11-INFORMATION-FLOW.md` (stale-claim correction).

No frontend files changed — the Contract detail UX review concluded no
change was warranted (see above).

## Build

**PASS.** `npx tsc --noEmit` clean, both before and after every edit in
this phase.

## Tests

**PASS.** Full backend suite: 64/64 suites, 321/321 tests (Phase 0
baseline was 319; +2 net from this phase's new concurrency-race tests, 0
regressions). Frontend untouched this phase — its pre-existing 9-failure
gap (`docs/reliability/TEST_BASELINE_REMEDIATION.md`, tied to a screen
already flagged for a later phase) is unrelated and unaffected.

## Remaining risks

- Reliability backlog items 1-3 (Booking non-atomicity), 6-7 (Fitout
  non-atomicity/no-retry), 9 (Fitout email retry gap) remain open, owned by
  their respective future phases — not silently dropped, tracked in
  `RELIABILITY_BACKLOG.md`.
- Item 10 (termination-cancel stale-schedule edge case), found during this
  phase's own verification work, is new and also tracked, not fixed.
- `ProposalStatus.UNDER_REVIEW` and `StepStatus.SKIPPED` exist in the schema
  with no code path currently setting them — flagged in
  `03-CONTRACT-LIFECYCLE-MAP.md`, left alone (schema change is out of scope
  for a reliability-hardening phase without a driving requirement).

## Deferred backlog

7 of the original 9 Phase 2 findings remain open (2 resolved this phase),
plus 1 dead feature flag (`BillingConfig.notifyTenantOnIssue`, confirmed
still dead, owned by the future Billing phase) and 1 new finding (item 10).
Full detail in `docs/program/RELIABILITY_BACKLOG.md`.

## Production impact

No breaking API changes, no new migrations, no removed routes. The two
hardened endpoints (`POST /proposals/:id/submit`,
`PATCH /contracts/:id/status`) keep their existing request/response
contracts — callers cannot tell the difference except that failure modes
that previously left inconsistent state now either fully succeed or fully
roll back, and concurrent duplicate calls now resolve gracefully instead of
racing.

## Recommended next phase

Per the master program's sequencing: **Phase 4 (Billing & Finance)** —
picks up the confirmed-dead `notifyTenantOnIssue` flag and the AR-aging/
dunning/collection-KPI Vietnamese-glossary item already identified in
Phase 1. Alternatively, **Phase 5 (Fitout & Handover)** is the more direct
continuation of this phase's reliability work (backlog items 6, 7, 9 all
live there). No blocking dependency between the two — either can go next.
