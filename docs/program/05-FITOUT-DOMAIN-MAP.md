# 05 — Fitout & Handover: Domain Map

**Date:** 2026-08-19. Extracted from `apps/backend/prisma/schema.prisma`
and the services that own each write path. There is no separate
"Inspection" or "Handover" entity — both are modeled as stages/state on
`FitoutProject` itself (`INSPECTION`, `APPROVED_TO_OPEN`, `OPENED`), not
distinct tables. Not invented to match the phase brief's illustrative list.

## Entity inventory

| Entity | Created By | State Owner | Critical Writes | Downstream Dependency |
|---|---|---|---|---|
| `FitoutProject` | `FitoutService.createFromContract` (auto, on `contract.activated`) | `FitoutService.advanceStatus` | `status` (FK to `FitoutStageConfig.code`), `startDate`, `actualOpenDate`, `operationManagerId` | `Unit.status` (via `triggersUnitStatus`), `FitoutMilestone`, all child entities below |
| `FitoutStageConfig` | Admin (config) | Admin | `order`, `triggersUnitStatus`, `setsField` — drives the entire pipeline | Every `advanceStatus` call reads this to validate transitions |
| `FitoutFormType` | Admin (config) | Admin | `approvalLevels`, `approverRoles` | Drives `FitoutSubmittal` approval-step generation |
| `FitoutDocumentGate` | Admin (config) | Admin | `stage` × `documentType` → `isRequired` | Read by `checkGateRequirements` to block/allow stage advance |
| `FitoutSubmittal` | `FitoutSubmittalService.create`/`resubmit` | Shared `ApprovalWorkflow` engine (via `workflowId`) | `status` (SUBMITTED/IN_PROGRESS/APPROVED/REJECTED/PUBLISHED/OBSOLETED), `revisionNo` | Gates stage-advance via `FitoutDocumentGate`; `stageCode` is denormalized at submission time for fast gate lookup |
| `ApprovalWorkflow`/`ApprovalStep` | Shared engine, same tables Proposal approval uses (`entityType: 'FITOUT_SUBMITTAL'`) | `ApprovalsService` | Reused, not reimplemented — see `03-CONTRACT-PATTERN-REFERENCE.md` Pattern 3 | `FitoutSubmittal.status` reacts via `@OnEvent` listeners |
| `FitoutIssue` | Operator (manual, via D-Map pin or list) | Assignee | `status` (OPENED/IN_PROGRESS/DONE/CLOSED/REOPENED/CANCELLED — the **only** Fitout entity with an explicit reopen state) | Not a stage-advance gate — informational/punch-list, doesn't block `advanceStatus` in code (verified: `checkGateRequirements` only reads `FitoutDocumentGate`/`FitoutSubmittal`, never `FitoutIssue`) |
| `FitoutChecklist` | `FitoutService.createChecklist` (manual) | `FitoutService.updateChecklist` | `isCompleted` | **Not a stage-advance gate either** — same verification as above; purely informational today, despite `checklists` being prominently included in `findAll`/`findOne` |
| `FitoutDocument` | `FitoutController.uploadDocument` | `FitoutDocumentsService.reviewDocument` | `status` (`FitoutDocumentStatus` enum) | Separate from `FitoutSubmittal` — an older/parallel document-upload path; **not** read by `checkGateRequirements` (which only reads `FitoutSubmittal`/`FitoutFormType`/`FitoutDocumentGate`) — flagged as a possible dead/parallel path, not investigated further this phase (out of scope; no correctness question was raised about it) |
| `FitoutMilestone` | `FitoutSlaService.recordMilestone` (one per project × stage, upserted) | `FitoutSlaService.completeMilestone` | `startedAt`, `completedAt`, `targetDate`, `isOverdue` | Drives the SLA-breach cron |
| `FitoutSlaPolicy` | Admin (config) | Admin | `targetDays`, `warningDays`, `escalateToRole` | Read by `recordMilestone` and the breach cron |
| `FitoutContractor` / `WorkerAccessLog` | `FitoutContractorService` | Operator | Not investigated this phase — no correctness question raised, out of scope |

## Gate-check invariant, verified

`FitoutDocumentsService.checkGateRequirements(projectId, targetStatus)`
only consults `FitoutDocumentGate` → `FitoutFormType` → `FitoutSubmittal`
(status `APPROVED`/`PUBLISHED`). **`FitoutChecklist` and `FitoutIssue` are
not part of the backend-enforced gate**, despite both being surfaced
prominently in the project detail payload. This means: today, a project
can advance past a stage with open checklist items or open defects, as
long as the stage's configured document gates are satisfied. Not flagged
as a bug — the phase brief's own illustrative lifecycle
("Inspection → Defect Resolution → Final Acceptance") assumes checklist/
issue-gating exists; **verified it doesn't**, so this is a business-rule
gap to raise with the domain owner, not a reliability defect to silently
fix by inventing new gating logic no one asked for.

## Actual pipeline (from `FitoutStageConfig` seed data, `order` ascending)

```text
CONTRACT_SIGNED (1)
  ↓
SUBMIT_DESIGN (2)         — gate: DESIGN_DRAWING + MEP_DRAWING submittals approved
  ↓
DESIGN_REVIEW (3)
  ↓
FIRE_SAFETY_REVIEW (4)    — gate: FIRE_SAFETY_CERT + PCCC_APPROVAL
  ↓
CONSTRUCTION_PERMIT (5)   — gate: CONSTRUCTION_PERMIT + INSURANCE_CERT
  ↓
FITOUT_IN_PROGRESS (6)    — setsField: startDate; triggersUnitStatus: UNDER_FITOUT
  ↓
INSPECTION (7)            — gate: INSPECTION_REPORT
  ↓
APPROVED_TO_OPEN (8)      — gate: HANDOVER_FORM
  ↓
OPENED (9, terminal)      — setsField: actualOpenDate; triggersUnitStatus: OCCUPIED
```

**"Handover" is not a separate transition** — it's the `APPROVED_TO_OPEN →
OPENED` step in this same pipeline, gated by an approved `HANDOVER_FORM`
submittal. There is no dedicated `Handover` entity, acceptance record, or
signature capture beyond the `HANDOVER_FORM` submittal's own approval
workflow. Confirmed by schema search — no `Handover`-named model exists.

## Forward-only, verified — no reopen path exists for `FitoutProject.status`

`advanceStatus` rejects `newIdx <= currentIdx` unconditionally. No code
path sets `FitoutProject.status` to an earlier stage. The **only** entity
in this domain with an explicit reopen state is `FitoutIssue`
(`REOPENED`), which is informational and doesn't affect the project's own
stage. Section 31's "reopen/rollback semantics" question is answered: not
implemented, not needed to be investigated further (nothing to review — it
doesn't exist).
