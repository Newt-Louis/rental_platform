# 11 — Information Flow

> Phase 18. Traces data ownership across the core lifecycle, using the same code
> paths verified in [03-USER-JOURNEYS](03-USER-JOURNEYS.md).

## Core flow: Lead → ... → SAP

```text
LEAD CREATED (CRM)
   Owner: Leasing Executive/Manager who created it (assignedTo)
      ↓
BOOKING CREATED (bridges Lead + Unit)
   Owner: same leasing user; Data owner of Unit availability: Spaces module
      ↓
PROPOSAL CREATED (from Booking, prefilled)
   Owner: proposal creator
   Process owner: ApprovalPolicyRule engine (config-driven, Admin-owned config)
      ↓
APPROVAL WORKFLOW
   Approvers: Leasing Manager → [Mall Director] → [CEO] (discount/rent-free-gated)
              + Finance (+ Finance Risk if AR debt) + Legal, in parallel/sequence
              per stepOrder
   Notification recipients: each step's approverRole (in-app + email);
              proposal creator on final approve/reject
      ↓
CONTRACT + TENANT (if new) + UNIT STATUS
   Created atomically in one server mutation on proposal conversion
   Owner: Leasing Manager (drives DRAFT→PENDING_LEGAL→PENDING_SIGNATURE→ACTIVE)
   > **CORRECTED AFTER LIVE CODE VERIFICATION (2026-08-19, docs/program/02-E2E-WORKFLOW.md
   > and 03-CONTRACT-LIFECYCLE-COMPLETION.md):** the line below ("Consumers notified: none
   > automatic at ACTIVE... a human must separately start each") is **stale**. Fitout
   > project creation and Billing schedule generation are both automatically triggered by
   > `ContractsService.updateStatus` on activation (`contract.activated` outbox event →
   > `FitoutService.handleContractActivated`, and a direct call to
   > `BillingScheduleService.buildScheduleForContract`, made atomic with the status change
   > as of Phase 3 hardening). This was true even before Phase 3 — only the atomicity
   > changed, not whether the handoff happens. No manual trigger exists or is needed.
      ↓
FITOUT (manually initiated)
   Owner: Operation (fitout coordinator)
   Process: 9-stage FitoutStageConfig pipeline, SLA-tracked per stage
   Notifies: assignee on issue/assignment, escalation role on SLA breach
      ↓
BILLING (manually initiated schedule, then automatic per cycle)
   Owner: Finance
   Automatic: invoice generation from schedule, OVERDUE transition (9am cron),
              dunning escalation (policy-matched)
   Notifies: tenant + Finance per ArDunningPolicy flags
      ↓
SAP SYNC
   Owner: Finance/Admin
   Process: mock sync of customers/invoices/payments, logged
   Consumer: external SAP FI/CO (out of platform scope)
      ↓
REPORTING
   Consumers: Dashboard (role-shaped), Reports, Analytics, Cross-Mall, Pipeline
   Stats — 4-6 surfaces reading the same underlying tables independently (FR-11)
```

## Source of Truth table

| Data | Source of truth | Owner | Notes |
|---|---|---|---|
| Lead/Customer identity | CRM module (`Lead`/`Customer` models) | Leasing | No dedup/merge policy across Lead→Customer→Tenant identity fields (V2-flagged) |
| Unit availability/status | Spaces module (`Unit.status`) | Spaces/Leasing | Also written by Fitout (auto-transitions to `UNDER_FITOUT`/`OCCUPIED`) and Proposal conversion — 3 writers, one field |
| Approval decision | `ApprovalWorkflow`/`ApprovalStep` | Approvals engine | Proposal reacts to workflow events, does not own the decision itself — correct separation |
| Contract terms | `Contract` model | Legal/Leasing Manager | Amendments tracked separately, not always shown alongside current terms in one view (V2-flagged tab sprawl) |
| Fitout stage | `FitoutProject.status` (String, FK to `FitoutStageConfig`) | Operation | Config-driven by design — Admin can edit stage list without a migration |
| Invoice status | `Invoice.status`, recomputed from `Payment` sum | Finance | `recomputeInvoiceStatusFromPayments()` is the single recompute function — good, one source |
| Notification | `Notification` model | 8 producer modules | Single consumer surface, no task/notification split today (FR-07) |
| Audit trail | `AuditLog` | System | Asynchronous, fire-and-forget per V2 — not covered further here (engineering concern, see V2 §Administration and audit) |

## Where the flow visibly breaks for a user (cross-reference to friction report)

- **Lead→Booking is a hard prerequisite with no visible prompt** (FR-02) — the flow
  diagram above is invisible to a first-time user; nothing in the UI states "you
  must create a Booking before a Proposal."
- ~~**Contract ACTIVE does not visibly hand off to Fitout/Billing** — a manager has
  to know, from institutional memory, to go start those two processes manually.
  This is the platform's biggest "user doesn't know the next action" gap at a
  cross-module level (distinct from FR items, which are within-module or
  navigation-level; this is a process-completeness gap already named as a P2
  engineering item in V2 but with a direct UX consequence: the Dashboard's action
  list could and should surface "Contract #X is ACTIVE but has no Fitout project
  started" as a needs-attention item).~~
  **CORRECTED AFTER LIVE CODE VERIFICATION (2026-08-19):** this claim is stale.
  Fitout/Billing kickoff on contract activation is automatic (see the corrected
  note earlier in this document), and Option B already surfaced both handoff
  states directly on the Contract detail screen — two status badges
  ("Fitout đã bắt đầu"/"Fitout chưa bắt đầu", "Đã lên lịch billing"/"Chưa lên lịch
  billing") with "View Fitout"/"View Billing" links
  (`apps/frontend/src/pages/contracts/ContractsPage.tsx:643-668`), confirmed live
  in `docs/readiness/POST_OPTION_B_GATE_REVIEW.md`. See
  `docs/program/02-E2E-WORKFLOW.md` for the full verification. This finding
  should be treated as resolved, not open, in any future audit that cites it.
- **Reporting reads from too many places** (FR-11) for a user to know which number
  is authoritative when two reports disagree.

## Recommendation

Add one dashboard/task-center action item type: "Hợp đồng đã hiệu lực nhưng chưa
có Fitout/Billing" — a cheap, purely additive query against existing tables (no new
model), directly closing the biggest silent handoff gap found in this trace.
