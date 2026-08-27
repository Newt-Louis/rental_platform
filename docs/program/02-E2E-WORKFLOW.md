# 02 — End-to-End Workflow Backbone

**Date:** 2026-08-19
**Method:** Traced against live backend code (`apps/backend/src`), not docs —
per the master program's own rule ("Code là evidence. Documentation là
context."). Two research passes: front half (this section) covers
Lead→Booking→Proposal→Approval→Contract; back half (Contract→Fitout/
Billing→Payment→Reconciliation) is appended once its research completes.

All backend paths relative to `apps/backend/src` unless stated otherwise.

## Cross-cutting mechanisms (apply to every transition below)

- **AuthZ**: `JwtAuthGuard` → `RolesGuard` globally registered via `APP_GUARD`
  (`app.module.ts`). `Role.ADMIN` always bypasses role checks
  (`common/guards/roles.guard.ts`).
- **Mall-scoping**: `MallAccessService` additionally restricts by mall via
  `UserMallAccess`. `ADMIN`, `CEO`, `TENANT` bypass this
  (`common/services/mall-access.service.ts`).
- **Audit**: `AuditLogInterceptor`, global, fires on every POST/PUT/PATCH/
  DELETE except auth/health/notifications/ai-chat, writes to `AuditLog`
  (redacted, endpoint + payload + duration + success). Separate from
  domain-specific logs (`BookingActivity`, `ProposalVersion`,
  `ContractEvent`).
- **Retry mechanism**: transactional outbox (`common/services/
  outbox.service.ts`). `approval.workflow.completed`/`.rejected` and
  `contract.activated` are enqueued inside the same DB transaction as the
  triggering state change; a 10s cron drains `OutboxEvent` with exponential
  backoff (`2^attempts`s, capped 300s). This is the system's only real
  domain-event retry mechanism.
- **Notifications**: in-app (`NotificationsService.create` → `Notification`
  table) + best-effort email (`EmailService.sendMail`, failures caught and
  logged, never block the write). No SMS/push.

---

## Transition 1 — Lead → Booking

- **Trigger:** `POST /bookings` → `BookingController.create()` →
  `BookingService.create()` (`modules/booking/booking.service.ts:31`). No
  dedicated "convert lead" endpoint — a Booking is created with an optional
  `leadId`. Lead status also moves via `PUT /crm/leads/:id` (generic update,
  includes the `WON` short-circuit → `CustomersService.createFromLead`) and
  `PUT /crm/leads/:id/move` (drag-drop).
- **Input:** `unitId` + one of `leadId`/`customerId`, optional area/term/
  rent/CAM proposal fields, `holdDays` (default 30).
- **Output:** `UnitBooking` (`BK-YYYY-NNNNN`, `ACTIVE` if first in queue else
  `PENDING`). If priority 1: `Unit.status → BOOKING`, and if `leadId`:
  `Lead.status → PROPOSAL` — **before any Proposal exists**.
- **Owner/Permission:** `MODULE_ROLES.booking = [ADMIN, LEASING_MANAGER,
  LEASING_EXECUTIVE, MALL_DIRECTOR]` + mall-access check.
- **State:** `Lead`: NEW/CONTACTED/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST.
  `UnitBooking`: PENDING/ACTIVE/EXPIRED/CANCELLED/CONVERTED. `Unit`:
  VACANT/BOOKING/NEGOTIATING/CONTRACTED/UNDER_FITOUT/OCCUPIED/MERGED,
  transition matrix enforced in `UnitStatusService`.
- **Side effect:** price-deviation validation can set `priceApprovalStatus
  = PENDING`, which later blocks Booking→Proposal conversion until resolved.
  Booking creation is blocked outright if the unit is `NEGOTIATING`/
  `MERGED`/`OCCUPIED`/`CONTRACTED`/`UNDER_FITOUT`.
- **Notification:** none on plain creation.
- **Failure handling — NOT ATOMIC (new finding):** `create()` does
  `unitBooking.create` → `unitStatus.transition` → `lead.update` → 2×
  `logActivity` as **separate, unwrapped writes**. If `unitStatus.transition`
  throws, the `UnitBooking` row is already committed but Unit/Lead status
  updates never run. Same bug class already fixed for Proposal→Contract
  (`docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md`), **not** applied
  here. Repeats in `BookingService.update()` (unit-change path) and
  `BookingService.cancel()` (via `promoteNextInQueue`).
- **Retry:** none.
- **Audit:** generic `AuditLog` + domain `BookingActivity`.

## Transition 2 — Booking → Proposal

- **Trigger:** `POST /bookings/:id/convert-to-proposal` →
  `BookingService.convertToProposal()` (`booking.service.ts:714`). A
  Proposal can also be created **directly** (`POST /proposals`), bypassing
  Booking — both paths are equally valid per `CrmService.resolveDealStage`.
- **Input:** `ConvertToProposalDto` — area/term/startDate/rentPerSqm
  required plus a large set of optional financial/fitout fields.
  Preconditions: Booking must be `ACTIVE`, not already converted,
  `priceApprovalStatus` not `PENDING`/`REJECTED`.
- **Output:** `Proposal` (`PROP-YYYY-NNNNN`), `tenantId` auto-resolved from
  Lead/Customer (explicit prior bug fix, noted in code comment).
  `UnitBooking.status → CONVERTED`. `Lead.status → PROPOSAL`.
- **Owner/Permission:** `MODULE_ROLES.booking`.
- **State:** `BookingStatus.ACTIVE → CONVERTED`; `ProposalStatus` starts
  `DRAFT`; `LeadStatus → PROPOSAL` (idempotent).
- **Side effect:** financials computed server-side, not trusted from client.
  Remaining `PENDING` bookings for the unit are queried for a
  queue-notification that has an explicit `// TODO` — **not implemented**.
- **Notification:** not implemented (see TODO above).
- **Failure handling — atomic (correctly fixed):** wrapped in
  `prisma.$transaction` covering Proposal create + Booking update + Lead
  update. Positive counter-example to Transition 1.
- **Retry:** none.
- **Audit:** generic `AuditLog` + `BookingActivity` (`CONVERTED`). No
  `ProposalVersion` snapshot taken here — inconsistent with the direct
  `POST /proposals` path, which does snapshot on creation.

## Transition 3 — Proposal → Approval

- **Trigger:** `POST /proposals/:id/submit` →
  `ProposalsService.submit()` (`proposals.service.ts:296`).
- **Input:** none — acts on Proposal + active `ApprovalPolicyRule` rows,
  evaluated against discount%, rent-free days, industry tag, AR debt flag,
  and price-deviation% (recomputed at submit time — a prior fix; comment
  notes Director/CEO price-deviation rules never fired before it).
- **Output:** `ApprovalWorkflow` (`IN_PROGRESS`) + `ApprovalStep` rows built
  from matched policy rules, deduped/renumbered. `Proposal.status →
  SUBMITTED`. A `ProposalVersion` snapshot (`SUBMITTED`) taken first.
- **Owner/Permission:** `PROPOSAL_EDIT_ROLES = [ADMIN, LEASING_MANAGER,
  LEASING_EXECUTIVE, MALL_DIRECTOR]` + mall-access check.
- **State:** `ProposalStatus.DRAFT → SUBMITTED`; `WorkflowStatus =
  IN_PROGRESS`; each `ApprovalStep.status = PENDING`.
- **Side effect:** hard failure (`BadRequestException`) if no active policy
  rules exist, or none match — a proposal can get **permanently stuck at
  DRAFT** if approval-policy config is incomplete.
- **Notification:** `notifyPendingApprovers()` — in-app `Notification`
  (`APPROVAL_PENDING`) + best-effort email to up to 5 step-1 approvers.
- **Failure handling — NOT ATOMIC (new finding):** three unwrapped writes
  (optional pricing update → workflow create → status update to
  `SUBMITTED`). A crash between steps 2–3 leaves a live `ApprovalWorkflow`
  against a still-`DRAFT` Proposal — an approver could see a pending item
  the submitter believes was never submitted. Lower risk than Transition 1
  but still unwrapped.
- **Retry:** none for submit; notification emails have no retry.
- **Audit:** generic `AuditLog` + `ProposalVersion` (full diffable
  snapshot).

## Transition 4 — Approval decision → Contract creation

Two linked steps: per-step approve/reject, then automatic (or manual)
Proposal→Contract conversion once the workflow completes.

### 4a. Approve/reject a step
- **Trigger:** `POST /approvals/:id/approve|reject` →
  `ApprovalsService.approve()/reject()` (`approvals.service.ts:206-331`).
- **Owner/Permission:** controller-level `MODULE_ROLES.approvals =
  [ADMIN, LEASING_MANAGER, MALL_DIRECTOR, FINANCE, LEGAL, CEO, OPERATION]`,
  **plus** a service-layer check: `userRole !== step.approverRole` →
  Forbidden (unless ADMIN); if the step has a specific `approverId`, only
  that user or ADMIN may act. Sequential-step enforcement: an earlier
  unapproved step blocks a later one.
- **Output/State:** `ApprovalStep.status → APPROVED/REJECTED`. Last pending
  step approved → `ApprovalWorkflow.status → APPROVED` + outbox event
  `approval.workflow.completed`. Any reject → `WorkflowStatus → REJECTED`
  immediately (single-reject-fails-workflow) + outbox event
  `approval.workflow.rejected`.
- **Side effect:** `ApprovalsService` is deliberately entity-agnostic — it
  doesn't know what "PROPOSAL" vs "FITOUT_SUBMITTAL" means; consumers
  subscribe to the emitted events.
- **Failure handling — correctly atomic:** both methods run inside
  `prisma.$transaction(..., { isolationLevel: Serializable })` including
  the outbox insert, so the state change and "event is now queued" are
  guaranteed consistent.
- **Retry:** via outbox cron/backoff — a throwing consumer doesn't silently
  lose the completion signal.
- **Audit:** generic `AuditLog`; `ApprovalStep` row itself is the durable
  decision record.

### 4b. Workflow completion → Proposal→Contract
- **Trigger (automatic):** `ProposalsService.onApprovalWorkflowCompleted()`
  — `@OnEvent('approval.workflow.completed')` listener, fired by the outbox
  processor, not a direct user action.
- **Logic:** sets `Proposal.status = APPROVED`, then
  `handleProposalFullyApproved()`. If `tenantId` is null: **no contract is
  created** — notifies the creator "needs a tenant assigned" and returns
  `NO_TENANT`. If a Contract already exists (idempotency check): just
  rebuilds the billing schedule. Otherwise: `createContractFromProposal()`
  → `buildScheduleForContract()` → notify `CONTRACT_DRAFT`.
- **Trigger (manual alternative):** `POST /proposals/:id/convert` →
  `convertToContract()`, roles `[ADMIN, LEASING_MANAGER, MALL_DIRECTOR]`.
  Handles the no-tenant case itself: creates a `Tenant` + tenant-portal
  `User` inside its own transaction, sends a best-effort activation email,
  then calls the same `createContractFromProposal()`.
- **Output (both paths converge):** `createContractFromProposal()` —
  already hardened per `docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md`,
  verified still accurate against current code. Creates `Contract`
  (`CTR-YYYY-NNNNN`, `DRAFT`), `Unit.status → CONTRACTED`, cancels
  remaining live `UnitBooking`s for the unit, `Proposal.status →
  CONVERTED`, `Lead.status → WON`.
- **Failure handling — already fixed, correctly:** one
  `prisma.$transaction(..., Serializable)` covering idempotency re-check,
  unit-uniqueness check, Contract create, unit-status transition, booking
  cancellation, proposal/lead updates. `P2002` race on
  `Contract.proposalId` caught and resolved to the winning contract rather
  than thrown. Deliberately excluded from the transaction (idempotent/
  best-effort, logged-and-swallowed): `CustomersService.createFromLead()`
  and the tenant-portal invitation email. 5 dedicated unit tests cover
  happy path, rollback, idempotency, race resolution, pre-write guard.
- **Notification:** in-app on both `APPROVED` and `CONTRACT_DRAFT`;
  best-effort tenant-portal invite email on the manual new-tenant path.
- **Retry:** workflow-completion signal via outbox; no retry inside
  contract creation beyond the P2002 resolve.
- **Audit — gap found:** generic `AuditLog` only. `ContractEvent` is **not**
  written at creation time via this flow (only the separate, manual
  `ContractsService.create()` path logs `CONTRACT_CREATED`). Contracts
  created via proposal conversion get no creation event, only later
  status-change events.

## Transition 5 — Contract activation

- **Trigger:** `PATCH /contracts/:id/status` (`{status:'ACTIVE'}`) →
  `ContractsService.updateStatus()` (`contracts.service.ts:341`). A
  pre-check, `GET /contracts/:id/activation-readiness`, is meant to gate
  the UI's activate action.
- **Input:** target status only; readiness gated server-side (contract/
  tenant/unit active, `Unit.status` already `CONTRACTED`, valid dates,
  non-negative financials).
- **Output:** `Contract.status → ACTIVE`, `ContractEvent`
  (`STATUS_CHANGED`), outbox event `contract.activated`
  (contractId/tenantId/unitId/handoverDate/openingDate from the linked
  Proposal). `BillingScheduleService.buildScheduleForContract()` invoked
  **synchronously after** the transaction commits.
- **Owner/Permission:** `CONTRACT_STATUS_ROLES = [ADMIN, LEASING_MANAGER,
  MALL_DIRECTOR]` — narrower than `CONTRACT_EDIT_ROLES` (which also
  includes `LEGAL`): Legal can edit contract data but not flip status.
- **State:** `ContractStatus`: DRAFT/PENDING_LEGAL/PENDING_SIGNATURE/
  ACTIVE/EXPIRING/EXPIRED/TERMINATING/TERMINATED. Transition matrix allows
  `DRAFT → ACTIVE` directly (comment: UI has no separate legal/signature
  step today).
- **Side effect (cross-module kickoff):**
  `FitoutService.handleContractActivated()` — `@OnEvent('contract.activated')`
  — auto-creates a `FitoutProject` (first configured stage,
  handover/openDate carried over), wrapped in try/catch so a failure here
  only logs an error and does **not** roll back contract activation.
  Billing-schedule generation is **not** decoupled the same way — it's a
  direct synchronous call, not event-driven.
- **Notification:** none found directly on activation; Fitout kickoff and
  billing-schedule generation are silent to the user unless they open the
  Contract detail page.
- **Failure handling — partially atomic:** the core status+event+outbox
  write **is** transactional. `buildScheduleForContract()` runs **after and
  outside** that transaction — if it throws, the contract is already
  `ACTIVE` and `contract.activated` is already queued, but no billing
  schedule exists yet. `docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md`
  explicitly scoped this out as untouched — confirmed still true.
- **Retry:** `contract.activated` retried via outbox; the synchronous
  `buildScheduleForContract` call has none.
- **Audit:** generic `AuditLog` + `ContractEvent` (`STATUS_CHANGED`,
  before/after), viewable via `GET /contracts/:id/events`.

## Cross-module navigation — verified as a strength, not a gap

Contrary to the assumption that this would need building: it's already
implemented and wired into the frontend.

- Backend: `CrmService.getLeadTimeline()` (unified Lead→Booking→Proposal→
  Approval→Contract timeline), `ContractsService.findOne()` (includes
  `proposal.lead`, `proposal.booking`, `fitoutProject`, `billingSchedule`
  — explicitly framed in code comments as "cross-module handoff
  visibility" per the prior audit), `CrmService.getUnifiedDeals()` (single
  pipeline view with computed `nextAction` text per stage).
- Frontend: Contract detail has a clickable "Source" panel to Booking/
  Proposal/Lead plus links to Fitout/Billing (`ContractsPage.tsx`).
  Proposal detail links back to Lead and forward to Contract. Booking
  detail links forward to the resulting Proposal.
- One unverified item: `getLeadTimeline()` may not have a frontend call
  site (grepped `pages/crm` for "timeline", no match beyond the page file
  itself) — flagged as possibly-unused, not confirmed dead code, since a
  full API-call audit wasn't done.

## Non-atomic multi-entity writes found (front half) — new backlog

Beyond the already-fixed Proposal→Contract case:

| Location | Writes involved | Risk |
|---|---|---|
| `BookingService.create()` | `unitBooking.create` → `unitStatus.transition` → `lead.update` → 2×`logActivity` | Booking commits while Unit/Lead status updates fail partway |
| `BookingService.update()` (unit-change path) | `unitBooking.update` → `promoteNextInQueue` → `unitStatus.transition` | Same class |
| `BookingService.cancel()` | `unitBooking.update` → `logActivity` → `promoteNextInQueue` (→ its own `unitStatus.transition`) | Same class |
| `ProposalsService.submit()` | optional pricing update → `approvalWorkflow.create` → status update to `SUBMITTED` | Live workflow could exist against a still-DRAFT proposal |
| `ContractsService.updateStatus()` activation | transactional core is atomic, but `buildScheduleForContract()` runs after/outside it | Contract can be ACTIVE with no billing schedule |

By contrast, `convertToProposal()`, `ApprovalsService.approve()/reject()`,
and `createContractFromProposal()` are correctly transactional (two at
`Serializable` isolation) — the codebase is **inconsistent**, not uniformly
missing this pattern. These five rows are the concrete Phase 3/Phase 12
backlog (Contract Lifecycle hardening / Reliability pass), scoped the same
way the original Proposal→Contract fix was: one flow at a time, tested,
not a blind sweep.

## Documentation vs. code discrepancies noted

`docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md` verified accurate
against current code, including its own "not done in this pass" scope note
— which correctly predicted the Transition 5 gap (contract activation →
Fitout/Billing kickoff untouched). The Transition 1 and 3 non-atomicity
findings above are **new** — not previously documented anywhere.
`docs/redesign/crm-bookings.md`, `proposals-contracts.md`, `approvals.md`
were not cross-checked line-by-line (forward-looking specs, not as-built
docs) — flagged unverified, not claimed consistent or inconsistent.

---

## Back half (Contract → Fitout/Billing → Payment → Reconciliation)

Same method: traced against live code in `apps/backend/src/modules/
{contracts,fitout,billing,approvals,sap}`, `common/services/{outbox,
scheduler-lock,unit-status}.service.ts`, the fitout config-driven migration,
and `apps/frontend/src/pages/contracts/ContractsPage.tsx`.

### Verification of a specific prior claim: is the Contract→Fitout/Billing handoff automated and visible?

**Automated: confirmed yes.** Both legs fire from the same
`ContractsService.updateStatus` call with no separate manual step — fitout
via the `contract.activated` outbox event consumed by
`FitoutService.handleContractActivated`, billing via a direct synchronous
call to `BillingScheduleService.buildScheduleForContract`.

**Visible on the Contract detail UI: confirmed yes**, and this **corrects a
stale claim** in `docs/audit/11-INFORMATION-FLOW.md` (Phase 18), which said
a manager has to know "from institutional memory" to start Fitout/Billing
manually. `ContractsService.findOne` includes `fitoutProject`/
`billingSchedule` (explicit code comment citing that same audit doc as the
reason), and `ContractsPage.tsx:643-668` renders two handoff-status badges
with "View Fitout"/"View Billing" buttons. This matches the commit recorded
in `docs/readiness/POST_OPTION_B_GATE_REVIEW.md` — Option B already fixed
this, the standalone audit doc just wasn't updated to reflect it.

### Transition 6 — Contract Activated → Fitout Project Created

- **Trigger:** outbox event `contract.activated` →
  `FitoutService.handleContractActivated` → `createFromContract`, creates
  the lowest-`order` active `FitoutStageConfig` project (`CONTRACT_SIGNED`)
  + a `FitoutMilestone`.
- **Side effect:** idempotent — looks up an existing `FitoutProject` for the
  contract first, so duplicate event delivery is safe.
- **Failure handling — gap:** the enqueue (inside the contract's own
  `$transaction`) is atomic, but `createFromContract` runs async via the
  outbox consumer with a try/catch that only logs. Because the throw is
  caught inside the handler, it never propagates to the outbox's own retry
  logic — **if fitout-project creation fails (e.g. no active
  `FitoutStageConfig` rows), the contract silently ends up with no fitout
  project and no automatic retry.**
- **Notification:** none.
- **Audit:** `ContractEvent` + global `AuditLog`.

### Transition 7 — Contract Activated → Billing Schedule Created

- **Trigger:** direct synchronous call inside `updateStatus`, **not**
  event-driven (unlike the fitout leg).
- **Output:** upserts `BillingScheduleEntry` rows keyed on
  `contractId_period`; deletes stale un-invoiced (`invoiceId: null`)
  entries no longer in the generated set — already-invoiced periods are
  protected from pruning.
- **Manual path:** `POST /billing/schedule/:contractId/build`
  (`billingStaff` role) — idempotent, safe to re-run after an amendment.
- **Failure handling — same-class gap as fitout, worse:** runs **outside**
  the contract's `$transaction`. If it throws, `Contract.status = ACTIVE`
  has already committed — contract ends up ACTIVE with no billing schedule
  and no automatic recovery (a human has to notice and call the manual
  build endpoint). Confirms
  `docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md`'s own scope note that
  this leg was explicitly left untouched by the earlier hardening pass.
- **Audit:** only the global `AuditLog` on the triggering request — no
  domain-specific event log for schedule generation itself.

### Transition 8 — Fitout Plan (Submittal) → Approval

- **Trigger:** `POST /fitout-submittals` creates a `FitoutSubmittal` +
  generic `ApprovalWorkflow`/`ApprovalStep[]` (`entityType:
  'FITOUT_SUBMITTAL'`) in one `$transaction`, steps built from
  `FitoutFormType.approvalLevels`/`approverRoles` (default: single
  `OPERATION`-role step if unconfigured).
- **Owner:** `MODULE_ROLES.fitout = [ADMIN, OPERATION, LEASING_MANAGER,
  MALL_DIRECTOR]`. **Unverified:** seed data's `SUBMIT_DESIGN` stage lists
  `roleColumn: TENANT`, but the submittal-creation endpoint's guard doesn't
  include `Role.TENANT` — no tenant-facing submittal path was located;
  flagged, not asserted broken.
- **Permission — gap found:** `FitoutSubmittalController` does **not** call
  `mallAccess`/`validateProject` on any action, unlike the main
  `FitoutController`, which validates mall access on every action via
  `validateProject`. Worth a P2 security-regression check in Phase 12, not
  confirmed exploitable here (role scoping still applies).
- **Approval:** same `ApprovalsService.approve/reject` engine as
  Transition 4a (Serializable transaction, sequential-step gating,
  approver-role/approver-id matching). On completion:
  `FitoutSubmittalService.onWorkflowCompleted/Rejected/StepAdvanced`
  (`@OnEvent` listeners) set `FitoutSubmittal.status` accordingly.
- **Retry inconsistency found:** `completed`/`rejected` events go through
  the outbox (retried). The intermediate `step-advanced` event is emitted
  via a **direct, non-outbox** `eventEmitter.emit()` call after the
  transaction commits — **not retried** if a listener throws.
- **Notification inconsistency found:** submittal-approver emails use a
  direct synchronous `emailService.sendMail()` call, **not** the retryable
  `EmailDeliveryService.enqueue()` used elsewhere in fitout/billing (e.g.
  SLA-breach and AR-dunning emails) — submittal-approval emails have no
  retry where comparable emails elsewhere in the same module do.
- **Audit:** global `AuditLog` only; no dedicated `FitoutSubmittal` history
  table beyond the `status` field itself.

### Transition 9 — Approval → Execution / Inspection (stage advance)

- **Trigger:** `PUT /fitouts/:id/status` → `FitoutService.advanceStatus`.
  Config-driven pipeline (`FitoutStageConfig`, seeded order):
  `CONTRACT_SIGNED`(1) → `SUBMIT_DESIGN`(2) → `DESIGN_REVIEW`(3) →
  `FIRE_SAFETY_REVIEW`(4) → `CONSTRUCTION_PERMIT`(5) →
  `FITOUT_IN_PROGRESS`(6, Execution) → `INSPECTION`(7) →
  `APPROVED_TO_OPEN`(8) → `OPENED`(9, Handover). Forward-only (no going
  backward).
- **Gate check:** `FitoutDocumentsService.checkGateRequirements` — each
  stage requires specific `FitoutSubmittal`s in `APPROVED`/`PUBLISHED`
  status (e.g. `SUBMIT_DESIGN` needs `DESIGN_DRAWING`+`MEP_DRAWING`).
  Missing gate → `BadRequestException` unless the caller passes
  `override: true` + a non-empty `overrideReason`, logged to `AuditLog`
  (`action: 'FITOUT_GATE_OVERRIDE'`) — a deliberate, audited escape hatch,
  not a silent bypass.
- **State:** `FitoutProject.status` advances; entering `FITOUT_IN_PROGRESS`
  auto-sets `startDate` and flips `Unit.status → UNDER_FITOUT` — the only
  stage in the pipeline that changes `Unit.status`.
- **Permission — informational-only field found:** `FitoutStageConfig.
  roleColumn` (`COORDINATOR`/`TENANT` in seed data) is never read by
  `advanceStatus` — it's schema/UI metadata, not a server-enforced
  per-stage role gate. Only the class-level `MODULE_ROLES.fitout` guard
  applies at every stage.
- **Failure handling — NOT ATOMIC (new finding):** `advanceStatus` runs (1)
  gate-check read, (2) `unitStatus.transition` (its own inner
  transaction), (3) `fitoutProject.update`, (4) SLA milestone
  complete/record, (5) optional override audit-log write — as **five
  separate operations**, not one `$transaction`. A crash between (2) and
  (3) can leave `Unit.status = UNDER_FITOUT` while `FitoutProject.status`
  never advances, with no automatic reconciliation. This is the same bug
  class as the front-half findings, in a fourth location.
- **Notification:** none fires purely from a stage advance.
- **Audit:** global `AuditLog` + `UnitHistory` (unit-status side effect) +
  explicit `AuditLog` entry for gate overrides.

### Transition 10 — SLA breach tracking (Execution/Inspection)

- **Trigger:** daily cron (08:00, `Asia/Ho_Chi_Minh`),
  `FitoutSlaService.checkSlaBreaches`, wrapped in
  `schedulerLock.runExclusive('fitout-sla-check', 4h TTL, ...)`.
- **Output:** in-app `Notification` to the assigned operation manager
  (warning) and to `policy.escalateToRole` users (escalation), plus a
  queued (retried) email via `EmailDeliveryService.enqueue` — correctly
  using the retryable path, unlike Transition 8's submittal emails.
- **Unverified:** whether one milestone's notification failure aborts the
  rest of that day's batch — not traced past the per-milestone loop.
- **Audit:** `JobExecution` ledger entry per run (success or failure), via
  the platform's scheduler-lock/job-ledger mechanism.

### Transition 11 — Inspection → Handover

- Structurally identical to Transition 9 (`advanceStatus` to
  `APPROVED_TO_OPEN` then `OPENED`). Gate: approved `HANDOVER_FORM`
  submittal. On reaching `OPENED` (terminal stage): `actualOpenDate` set,
  `Unit.status → OCCUPIED`.
- **Notification:** none — tenant is not automatically told their unit
  opened.
- **Cross-module gap confirmed by direct grep:** no code in `billing/`
  subscribes to fitout stage changes — nothing marks "fitout complete" as
  a domain event other modules could react to.
- Same non-atomicity and audit characteristics as Transition 9.

### Transition 12 — Billing Schedule → Invoice Generated

- **Trigger (automatic):** monthly cron (06:00 on the 1st,
  `Asia/Ho_Chi_Minh`), `BillingScheduler.generateMonthlyInvoices`,
  `schedulerLock` 6h TTL. **Trigger (manual):** `POST
  /billing/schedule/generate-due` (`billingStaff`). **Trigger (per-item):**
  `POST /billing/receivables/pending/:sourceType/:id/create-invoice`.
- **Output:** `Invoice` (`status: DRAFT`, deterministic
  `invoiceNumber: INV-SCHEDULE-<scheduleRowId>` — naturally idempotent
  against retries) + `RENT`/`CAM` lines; `BillingScheduleEntry.status →
  INVOICED`. If `BillingConfig.autoIssueInvoices`: immediately → `ISSUED`
  in the same transaction.
- **Failure handling — well engineered:** each invoice wrapped in
  `Serializable` `$transaction`; a `P2002` collision (concurrent/retried
  run) is caught and **repaired** (links the existing invoice to the
  schedule entry) rather than failing — explicit defense-in-depth on top
  of the scheduler lock.
- **Notification — dead config flag found:** `BillingConfig.
  notifyTenantOnIssue` exists as a toggle in the settings UI/DTO but is
  **never read anywhere in the codebase** (confirmed by grep — only
  appears in the DTO type and the config-update passthrough). An admin can
  toggle "notify tenant on issue" and it silently does nothing. No
  notification fires on invoice creation or auto-issue at all.
- **Audit:** global `AuditLog` for manual triggers; `JobExecution` ledger
  for cron runs; no dedicated invoice-creation event log.

### Transition 13 — Invoice → Payment

- **Trigger:** `POST /invoices/:id/issue` (DRAFT→ISSUED), then `POST
  /invoices/:id/payment` → `BillingService.recordPayment`.
- **Input:** `{ amount, method?, reference?, paidAt?, notes?,
  idempotencyKey? }` — key may also come from an `Idempotency-Key` header
  (preferred over body).
- **State:** `recomputeInvoiceStatusFromPayments` always recomputes from
  the full sum of active (`reversedAt: null`) payments vs. `adjustedTotal`
  rather than incrementing a running balance — self-healing by
  construction. Guards reject payment against `CANCELLED` invoices,
  over-balance amounts, and `paidAt` dates >1 day in the future.
- **Side effect:** `syncSourceReceivable` mirrors status onto
  `ServiceContractPayment`/`ParkingMonthlyStatement` for those source
  types; lease-contract invoices have no separate receivable-mirror table.
- **Failure handling — the best-engineered write in the codebase:** sha256
  hash of the semantic payload + `idempotencyKey`; pre-check returns the
  existing payment on an exact-match replay, throws `ConflictException` on
  a key-reuse-with-different-amount attempt; `Serializable` transaction;
  **also** catches a `P2002` race at the DB constraint level for genuine
  concurrent double-submits, resolving it the same way as the pre-check.
  Retrying `POST .../payment` with the same `Idempotency-Key` is
  guaranteed not to double-count.
- **Reversal/Void:** `reversePayment` (mandatory reason, same
  Serializable-transaction pattern) and `voidInvoice` (blocked if any
  active payment or approved adjustment exists — prevents orphaning
  collected cash) are equally defensive.
- **Notification:** none fires directly on payment recording; overdue
  reminders are a separate, delayed AR-dunning cron, not tied to the
  payment event itself.
- **Audit:** global `AuditLog`; the `Payment` row's own reversal fields
  double as a lightweight audit trail for that action.

### Transition 14 — Payment → Reconciliation

Two distinct mechanisms exist under "reconciliation" — worth keeping
separate in any UI/reporting work in Phase 4:

**14a. Internal invoice-status reconciliation (implicit, per-payment):**
already covered by Transition 13's `recomputeInvoiceStatusFromPayments` —
runs synchronously after every payment/reversal/void/adjustment, always
from the full source-of-truth payment set, so it self-heals rather than
drifting.

**14b. SAP (external ERP) reconciliation:**
- **Trigger — unverified, likely manual-only:** no `@Cron` decorator found
  on `SapReconciliationService.reconcilePending`; grep of the whole `sap`
  module found no scheduled invocation. Flagged as a finding to confirm,
  not asserted as fact, since `sap.controller.ts`'s route guards weren't
  fully re-read.
- **Logic:** processes the most recent 100 successful `SapIntegrationLog`
  rows, dedups via a deterministic `idempotencyKey`, and for `INVOICE`
  entities compares `Invoice.totalAmount` against SAP's reported amount:
  `MATCHED` (diff < 1), `MISMATCH`, or `NEEDS_REVIEW` (unparseable SAP
  response — explicitly **not** defaulted to "matched" when data is
  missing, per an inline code comment warning against exactly that
  mistake).
- **Failure handling:** per-record try/catch, one bad log doesn't abort the
  batch; a JSON-parse failure falls back to `MISMATCH`/`PENDING` rather
  than silently skipping.
- **Retry:** dedup key means re-running is safe for anything still
  `PENDING`, but existing `MISMATCH`/`NEEDS_REVIEW` records have no
  auto-retry-to-MATCHED path — they need manual resolution.
- **Audit:** `SapReconciliationRecord` itself is the audit trail.

### Back-half summary table

| Transition | Trigger type | Atomic? | Retry | Notification |
|---|---|---|---|---|
| Contract Activated → Fitout Project | Outbox event | Enqueue atomic; creation async, errors swallowed | Outbox backoff (emit only, not creation failure) | None |
| Contract Activated → Billing Schedule | Direct sync call | Not transactional with contract-status commit | None automatic; manual rebuild endpoint | None |
| Submittal → Approval | HTTP + Approval engine | Yes (Serializable) for approve/reject | Outbox for completed/rejected; **not** for step-advanced | In-app + non-retried email |
| Stage advance (Execution/Inspection/Handover) | HTTP | **No** — 5 unwrapped steps | None | None |
| SLA breach check | Daily cron | Best-effort per milestone | Scheduler lock + retried email | In-app + queued email |
| Billing Schedule → Invoice | Monthly cron + manual | Yes (Serializable per invoice) | Idempotent invoice numbers + P2002 repair | **None** (dead config flag) |
| Invoice → Payment | HTTP | Yes (Serializable + idempotency key + DB constraint) | Client-safe replay | None |
| Payment → Reconciliation (internal) | Sync, every payment mutation | Yes | Self-recomputed | None |
| Payment → Reconciliation (SAP) | Manual/unclear | Per-record, non-transactional batch | Dedup key only | None |

### Flagged for follow-up (back half, unverified — not asserted as fact)

1. Whether tenants submit fitout design documents through
   `FitoutSubmittalController` directly, or via an unlocated different path
   (role guard excludes `TENANT` despite `roleColumn: TENANT` seed data).
2. Role/permission guards on `sap.controller.ts` for triggering SAP
   reconciliation, and whether anything schedules it.
3. Whether one throwing milestone notification aborts the rest of that
   day's SLA-breach batch.

## Consolidated non-atomic multi-write backlog (front + back half)

| # | Location | Risk |
|---|---|---|
| 1 | `BookingService.create()` | Booking commits while Unit/Lead status updates fail partway |
| 2 | `BookingService.update()` (unit-change path) | Same class |
| 3 | `BookingService.cancel()` | Same class |
| 4 | `ProposalsService.submit()` | Live approval workflow could exist against a still-DRAFT proposal |
| 5 | `ContractsService.updateStatus()` → billing schedule | Contract ACTIVE with no billing schedule if schedule build fails |
| 6 | `FitoutService.handleContractActivated()` (fitout project creation) | Contract ACTIVE with no fitout project, silently, no retry |
| 7 | `FitoutService.advanceStatus()` (stage advance) | Unit status and fitout stage can desync across 5 unwrapped writes |

Two more inconsistencies (not data-integrity risks, but reliability gaps):
`step-advanced` approval events bypass the outbox (no retry) while
`completed`/`rejected` use it; fitout-submittal approver emails bypass the
retryable `EmailDeliveryService` while SLA-breach and AR-dunning emails use
it correctly. And one dead feature flag: `BillingConfig.notifyTenantOnIssue`
has no effect anywhere in the code.

These seven rows plus the two inconsistencies and the dead flag are the
concrete evidence-based backlog for Phase 3 (Contract Lifecycle), Phase 4
(Billing & Finance), Phase 5 (Fitout & Handover), and Phase 12
(Reliability) — each fixed within its own module phase, one flow at a
time with dedicated tests, matching how the original Proposal→Contract fix
was scoped, not a blind platform-wide sweep.

## Gate

**Phase 2 complete.** The business journey is real, largely well-built, and
now fully evidenced against live code rather than assumed from docs. Two
prior-audit claims were checked and one corrected (confirm-dialog count in
Phase 1), one confirmed-fixed-but-undocumented (Contract→Fitout/Billing
handoff visibility, corrects `docs/audit/11-INFORMATION-FLOW.md`). Nine
concrete reliability findings feed forward into Phases 3–5 and 12 as
scoped, evidence-backed backlog rather than being fixed in an unscoped
sweep here.

**Proceeding to Phase 3 (Contract Lifecycle).**
