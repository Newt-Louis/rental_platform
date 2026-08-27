# 03 — Contract Lifecycle: Domain Map (extracted from code, not invented)

**Date:** 2026-08-19. States below are taken directly from
`apps/backend/prisma/schema.prisma` enums and the transition matrices
enforced in the corresponding services — not the illustrative example in
the Phase 3 brief. Where the brief's example status differs from actual
code, actual code wins.

## Actual states

```text
ProposalStatus (schema.prisma:201)
├── DRAFT
├── SUBMITTED
├── UNDER_REVIEW      (defined in the enum; no code path currently sets this
│                       value — proposals go DRAFT→SUBMITTED→APPROVED/REJECTED
│                       directly. Flagged, not removed: out of Phase 3 scope
│                       to change the schema for an unused-but-harmless value.)
├── APPROVED
├── REJECTED
└── CONVERTED

WorkflowStatus (schema.prisma:210) — generic, shared by PROPOSAL and
FITOUT_SUBMITTAL entity types via ApprovalWorkflow.entityType
├── PENDING            (schema default; no code path was found setting a
│                       workflow to PENDING after creation — every workflow
│                       is created directly as IN_PROGRESS)
├── IN_PROGRESS
├── APPROVED
└── REJECTED

StepStatus (schema.prisma:217)
├── PENDING
├── APPROVED
├── REJECTED
└── SKIPPED            (enum value exists; no code path currently sets it —
                        flagged, not removed)

ContractStatus (schema.prisma:232)
├── DRAFT
├── PENDING_LEGAL
├── PENDING_SIGNATURE
├── ACTIVE
├── EXPIRING
├── EXPIRED
├── TERMINATING
└── TERMINATED
```

## Proposal state transitions (actual code paths, not a generic matrix)

Unlike Contract, there is **no** generic `PROPOSAL_STATUS_TRANSITIONS` table
— each transition is a distinct service method with its own guard:

| From | Method | Guard | To |
|---|---|---|---|
| DRAFT | `ProposalsService.submit()` | must be DRAFT; active `ApprovalPolicyRule`s must exist and match | SUBMITTED |
| SUBMITTED | `onApprovalWorkflowCompleted` (`@OnEvent`) | workflow reached APPROVED (all steps approved) | APPROVED |
| SUBMITTED | `onApprovalWorkflowRejected` (`@OnEvent`) | any step rejected | REJECTED |
| APPROVED | `createContractFromProposal()` | tenant must be assigned; no existing contract for this proposal | CONVERTED |

`REJECTED` and `CONVERTED` are terminal in code — no method transitions out
of either. A rejected proposal cannot be resubmitted; a new proposal must be
created (verified by absence of any `REJECTED →` write in
`proposals.service.ts`).

## Contract state transitions

**Actual transition matrix**, `CONTRACT_STATUS_TRANSITIONS`
(`apps/backend/src/modules/contracts/contracts.service.ts:20-31`):

```text
DRAFT              → PENDING_LEGAL, ACTIVE
PENDING_LEGAL       → PENDING_SIGNATURE, DRAFT
PENDING_SIGNATURE   → ACTIVE, PENDING_LEGAL
ACTIVE              → EXPIRING, EXPIRED, TERMINATING
EXPIRING            → ACTIVE, EXPIRED, TERMINATING
EXPIRED             → (terminal — no transitions out via this matrix)
TERMINATING         → TERMINATED, ACTIVE
TERMINATED          → (terminal)
```

Note: `DRAFT → ACTIVE` is a direct, single-hop transition, by design — a
code comment explicitly documents that today's UI has no separate
operator-facing step for `PENDING_LEGAL`/`PENDING_SIGNATURE`, so contracts
are typically activated straight from `DRAFT`.

**Frontend-exposed subset**, `CONTRACT_UI_TRANSITIONS`
(`apps/frontend/src/pages/contracts/ContractsPage.tsx:46-55`) —
deliberately narrower than the backend matrix:

```text
DRAFT               → PENDING_LEGAL, ACTIVE
PENDING_LEGAL       → PENDING_SIGNATURE, DRAFT
PENDING_SIGNATURE   → ACTIVE, PENDING_LEGAL
ACTIVE              → EXPIRING                (not EXPIRED/TERMINATING)
EXPIRING            → ACTIVE, EXPIRED         (not TERMINATING)
EXPIRED             → (none)
TERMINATING         → (none — has its own dedicated tab, not this button group)
TERMINATED          → (none)
```

`TERMINATING` is intentionally excluded from the generic transition-button
group and given its own "Chấm dứt hợp đồng" (Terminate) tab with a
dedicated form (reason, effective date, notice period, deposit
refund/penalty) and destructive (`bg-red-600`) styling — verified in code,
not assumed. This already satisfies the brief's action-hierarchy rule
(destructive actions must not share visual weight with routine ones); no
UI change was needed here.

## Transition matrix for the two hardened flows (FROM / EVENT / GUARD / WRITES / SIDE EFFECT / TO)

### Proposal Submit

```text
FROM:        DRAFT
EVENT:       POST /proposals/:id/submit
GUARD:       status === DRAFT (re-checked inside the transaction);
             active ApprovalPolicyRule rows exist and at least one matches
WRITES:      [inside one Serializable transaction, as of Phase 3]
             1. proposal.update — pricingRuleId/pricingSnapshot (conditional)
             2. proposalVersion.create — 'SUBMITTED' snapshot
             3. approvalWorkflow.create — with nested approvalStep rows
             4. proposal.update — status = SUBMITTED
SIDE EFFECT: [outside the transaction, best-effort]
             notifyPendingApprovers() — in-app Notification + email to
             step-1 approvers
TO:          SUBMITTED
```

### Contract Activation

```text
FROM:        DRAFT | PENDING_LEGAL | PENDING_SIGNATURE | EXPIRING
EVENT:       PATCH /contracts/:id/status { status: ACTIVE }
GUARD:       getActivationReadiness() — contract/tenant/unit active, unit
             already CONTRACTED, valid dates, non-negative financials;
             re-checked via CONTRACT_STATUS_TRANSITIONS; current status
             re-read inside the transaction (closes the concurrent-
             activation race)
WRITES:      [inside one Serializable transaction, as of Phase 3]
             1. contract.update — status = ACTIVE (skipped if already ACTIVE
                — see idempotent-retry note below)
             2. contractEvent.create — STATUS_CHANGED (skipped if already
                ACTIVE)
             3. outboxEvent upsert — 'contract.activated' (always, even on
                a same-status replay — see below)
             4. billingScheduleService.buildScheduleForContract(id, tx) —
                upserts BillingScheduleEntry rows, now via the same tx
SIDE EFFECT: [async, via outbox consumer, after commit]
             FitoutService.handleContractActivated() — creates FitoutProject
             (unchanged this phase — see RELIABILITY_BACKLOG.md item 6)
TO:          ACTIVE
```

**Idempotent-retry note:** calling activation again when the contract is
already `ACTIVE` is now a *safe, effective recovery path* — it skips the
status/event writes (nothing changed) but still re-runs the outbox-enqueue
and billing-schedule build. This means an operator who sees "contract is
ACTIVE but billing isn't ready" (which could only happen from a run before
this phase's fix, or from a still-open gap like item 6 in the reliability
backlog) can fix it by re-issuing the same activate call, with no special
"repair" tooling needed.

## Proposal Submit — failure matrix (traced, not assumed)

Every write below is inside the one Phase 3 transaction; a failure at any
point rolls back all of them (Postgres transaction semantics — Prisma's
`$transaction` issues `ROLLBACK` on any thrown error inside the callback).

| Failure point | Persistent DB state | User sees | Recoverable | Risk (pre-Phase-3 / post-Phase-3) |
|---|---|---|---|---|
| Before entering the transaction (rules missing / no step matched) | No writes at all | `BadRequestException` with a specific message | Yes — fix policy config, retry | Low / Low (unchanged — this was already a clean pre-check) |
| Write 1 fails (pricing update) | Rolled back — proposal still DRAFT, no version, no workflow | Generic 500 or the underlying DB error | Yes — retry the submit call | **Pre-Phase-3: N/A (this write didn't exist inside a transaction boundary at all — it committed alone).** Post-Phase-3: **none** — full rollback |
| Write 2 fails (version snapshot) | Rolled back — proposal still DRAFT, no workflow | Same | Yes — retry | Pre-Phase-3: N/A (ran standalone before the workflow create, so a failure here left DRAFT correctly — this particular step was accidentally safe before, by ordering, not by design). Post-Phase-3: **none** |
| Write 3 fails (workflow + steps create) | Rolled back — proposal still DRAFT | Same | Yes — retry | **Pre-Phase-3: proposal remained DRAFT correctly (this was the last write before status), so this specific failure point was already safe.** Post-Phase-3: unchanged (still safe), but now guaranteed by the transaction rather than by write ordering. |
| Write 4 fails (status → SUBMITTED) | **Pre-Phase-3: WorkflowIN_PROGRESS + steps already committed, proposal still DRAFT — a live approval workflow against a DRAFT proposal, the exact bug this phase fixes.** Post-Phase-3: rolled back — no workflow, no version, proposal still DRAFT | Pre: approver sees a pending item for a proposal the submitter believes wasn't submitted. Post: `BadRequestException`/error, safe retry | Post: Yes, clean retry. Pre: required manual DB intervention to detect/fix | **Pre-Phase-3: HIGH (the actual, real gap this phase closed). Post-Phase-3: none — full rollback, no orphaned workflow** |
| Two requests both reach the transaction concurrently | Both attempt `approvalWorkflow.create`; DB unique constraint on `proposalId` lets exactly one through | Loser's request gets a `P2002`, caught and resolved to the winner's `workflowId` — both callers get a success response referencing the same workflow | Yes — no user-visible error at all | Post-Phase-3 only (pre-existing behavior for concurrent submits was previously unverified/untested) |

## Contract Activation — failure matrix

| Failure point | Persistent DB state | User sees | Recoverable | Risk (pre-Phase-3 / post-Phase-3) |
|---|---|---|---|---|
| Readiness check fails | No writes | `BadRequestException` listing missing prerequisites | Yes | Low / Low (unchanged) |
| Write 1-3 fail (status/event/outbox) inside the transaction | Rolled back entirely | Error, contract stays in prior status | Yes — retry | Low / Low (this part was already transactional pre-Phase-3) |
| Billing-schedule generation fails | **Pre-Phase-3: contract already committed ACTIVE (separate transaction had already closed), no billing schedule, no automatic recovery signal.** Post-Phase-3: entire transaction rolls back — contract stays in its prior status, no schedule, no event | Pre: contract shows ACTIVE in the UI with no billing-readiness badge — operator must notice the "Billing chưa lên lịch" badge and know to call the manual rebuild endpoint. Post: activation fails outright with an error; contract never appears falsely ACTIVE | Pre: yes, via `POST /billing/schedule/:contractId/build`, but undiscoverable without reading this badge. Post: yes — just retry activation | **Pre-Phase-3: MEDIUM (recoverable but silent — the exact gap this phase closed). Post-Phase-3: none — "no half-active contract" invariant now holds structurally, not just via a UI badge.** |
| Two users activate the same contract concurrently | One transaction commits; Postgres Serializable isolation aborts the other with a conflict (`P2034`) | Loser's request is caught and resolved to the winner's already-ACTIVE contract — no error surfaced if the winner's target status matches | Yes — transparent | Post-Phase-3 only (pre-existing concurrent-activation behavior was previously unverified/untested) |

## Invariant now enforced: no half-active contract

> A contract must never appear operationally ACTIVE when mandatory billing
> setup failed.

Confirmed as a **structural** guarantee for the activation path, not a UI
convention, as of Phase 3: the only way a contract goes from a pre-active
status to `ACTIVE` via `ContractsService.updateStatus()` now does so inside
one transaction that also contains the billing-schedule write. If schedule
generation throws, the status change never commits either.

**One other code path also writes `Contract.status = ACTIVE`, found while
verifying this claim — correction to an earlier draft of this document,
which incorrectly stated no other path exists:**
`ContractTerminationService.cancel()`
(`apps/backend/src/modules/contracts/contract-termination.service.ts:145-168`)
restores a contract's status (to `ACTIVE`, `EXPIRING`, or `EXPIRED`,
computed from `endDate`) when an in-progress termination request is
cancelled. This does **not** violate the invariant in practice — a
contract can only reach `TERMINATING` from `ACTIVE`/`EXPIRING` in the first
place (per `CONTRACT_STATUS_TRANSITIONS`), meaning it already had a live
billing schedule from its original activation before termination was ever
initiated; `cancel()` restores that pre-existing state rather than
activating a contract that was never billing-ready. Still, this path does
**not** re-run `buildScheduleForContract`, so if an amendment changed the
contract's financial terms *while* it was `TERMINATING`, the restored
`ACTIVE` contract's schedule could be stale. Recorded as a small, distinct
follow-up (not part of the Phase 2 backlog, found during Phase 3
verification) rather than fixed here — termination-cancellation is
Termination-flow scope, not Activation scope, and changing it risks the
already-correct restoredStatus date logic for a low-probability edge case.
See `docs/program/RELIABILITY_BACKLOG.md` if this is picked up later.
