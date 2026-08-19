# 05 — Fitout & Handover: State Transition Matrix

**Date:** 2026-08-19. Every multi-write transition below has an explicit
transaction-boundary note, per the phase brief's requirement.

| From | Action | Guards | Writes | Events | To |
|---|---|---|---|---|---|
| *(none — Contract activation)* | `contract.activated` outbox event → `FitoutService.handleContractActivated` → `createFromContract` | No existing `FitoutProject` for this contract (idempotency pre-check + in-transaction re-check); at least one active `FitoutStageConfig` exists | **One Serializable transaction (Phase 5):** `FitoutProject.create` + `FitoutMilestone.upsert` (first stage) | None emitted — this is itself an event consumer, not a producer | `CONTRACT_SIGNED` (or whichever stage has the lowest active `order`) |
| `CONTRACT_SIGNED` → `SUBMIT_DESIGN` → ... → `OPENED` | `PUT /fitouts/:id/status` → `FitoutService.advanceStatus` | Forward-only (`newIdx > currentIdx`); gate requirements met (or `override` + `overrideReason`); in-transaction re-read confirms the project is still at the status the pre-checks were run against | **One Serializable transaction (Phase 5):** optional `UnitStatusService.transition` (joins this transaction) + `FitoutProject.update` (status, and `startDate`/`actualOpenDate` if this stage sets them) + `FitoutMilestone` complete-previous/record-next (2 writes) + optional `AuditLog.create` (gate override) | None — no outbox event on stage advance (verified: no `outbox.enqueue` call anywhere in `advanceStatus`) | Next configured stage |
| *(any submittal-relevant stage)* | `POST /fitout-submittals` → `FitoutSubmittalService.create` | Project exists; form type resolves to approval steps (falls back to single `OPERATION`-role step if unconfigured) | **One transaction (pre-existing, unchanged):** `FitoutSubmittal.create` + `ApprovalWorkflow`/`ApprovalStep[].create` | In-app `Notification` + **retryable** email (Phase 5 fix, see below) to step-1 approvers | `FitoutSubmittal.status = SUBMITTED` |
| `SUBMITTED`/`IN_PROGRESS` | `POST /approvals/:id/approve`\|`reject` (shared engine, unchanged) | Sequential-step + approver-role/id match (`ApprovalsService`, Serializable transaction — see `03-CONTRACT-PATTERN-REFERENCE.md` Pattern 3) | `ApprovalStep.status` + (on last step or reject) `ApprovalWorkflow.status` + outbox-enqueue, all in one transaction | `approval.workflow.completed`/`.rejected` (outbox, retried) → `FitoutSubmittalService.onWorkflowCompleted`/`onWorkflowRejected` sets `FitoutSubmittal.status`; `approval.workflow.step-advanced` (direct emit, **not** retried — same platform-wide gap as the Proposal case, `RELIABILITY_BACKLOG.md` item 8, not Fitout-specific, not re-fixed here) → `notifyPendingApprovers` for the next step | `APPROVED`/`REJECTED`/`IN_PROGRESS` |
| `REJECTED` | `POST /fitout-submittals/:id/resubmit` | Not traced line-by-line this phase (existing code, no reliability question raised against it) | Not traced this phase | Not traced this phase | New revision, `SUBMITTED` |
| `APPROVED` | `POST /fitout-submittals/:id/publish` | Not traced line-by-line this phase | Not traced this phase | Not traced this phase | `PUBLISHED` |

## Contract→Fitout auto-creation — exact writes (answers section 7's questions)

**What event creates it, and when:** the `contract.activated` outbox
event, emitted from `ContractsService.updateStatus()` when a contract's
status transitions to `ACTIVE` (Phase 3). Not at Proposal approval, not at
any other state — confirmed by grep, this is the only emitter of
`contract.activated` in the codebase.

**Exact writes (Phase 5, now one transaction):**
```text
1. FitoutProject.create (status = lowest-order active FitoutStageConfig.code)
2. FitoutMilestone.upsert (the first stage's milestone, target date from FitoutSlaPolicy if configured)
```
No "initial checklist" or "assignment" write happens here — `FitoutChecklist`
rows and `operationManagerId` are both created/set later, manually, by an
operator (`createChecklist`, `assign`). Not invented as part of
auto-creation because no code creates them there.

## Failure topology — see `05-FITOUT-FAILURE-MATRIX.md` for the full table.

## Transition guards — backend-authoritative, verified

Every guard enforced in `advanceStatus`/`checkGateRequirements` is a
backend check with no UI-only equivalent found:
- Forward-only ordering: `stages.findIndex` comparison in the service.
- Gate documents: `FitoutDocumentsService.checkGateRequirements`, called
  from the service, not just displayed by the frontend.
- Override requires a non-empty `overrideReason`, audited.
- Mall/project access: **was missing entirely on the Submittal
  controller (fixed this phase)** — present on the main `FitoutController`
  via `validateProject`.
