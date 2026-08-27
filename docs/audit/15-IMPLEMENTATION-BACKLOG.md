# 15 — Implementation Backlog

> Phase 30. Format: EPIC → FEATURE → STORY → TASK. Stories are written to be
> directly actionable by an engineer or coding agent — each cites the exact file(s)
> involved from this audit's research, so no re-discovery is needed.

---

## EPIC 1 — Fix Critical Access & Discovery Gaps (P0)

### FEATURE 1.1 — RBAC table consistency

**STORY:** As a Tenant, I should never see a nav item that 403s.
- Problem: `apps/frontend/src/lib/permissions.ts` `ROUTE_PERMISSIONS.fitout`
  includes `TENANT`; `apps/backend/src/common/constants/role-permissions.ts`
  `MODULE_ROLES.fitout` does not.
- Expected behavior: either remove `/fitout` from `TENANT_NAV`/frontend
  `ROUTE_PERMISSIONS` (tenants already see fitout status inside Tenant Portal), or
  add `Role.TENANT` to backend `MODULE_ROLES.fitout` if tenant-facing fitout
  endpoints are actually intended.
- Acceptance criteria: no role has a frontend-granted route that the backend
  rejects; add a CI check (or unit test) asserting `ROUTE_PERMISSIONS` and
  `MODULE_ROLES` module-by-module role sets match, to prevent regression.
- Dependencies: none. Risk: low. Priority: P0. Effort: XS (config diff + 1 test).

### FEATURE 1.2 — Proposal creation entry point

**STORY:** As a Leasing Executive opening `/proposals` for the first time, I want a
visible "Tạo đề xuất" action, so I don't need to already know proposals are only
created via Bookings.
- Current: `apps/frontend/src/pages/proposals/ProposalsPage.tsx` has no create
  action; creation only exists in `apps/frontend/src/pages/bookings/
  ConvertToProposalDialog.tsx`.
- Expected behavior: add a primary "+ Tạo đề xuất" button to `ProposalsPage.tsx`
  header that opens a booking-picker (reuse `bookingApi` list, filter to bookings
  without a linked proposal) → then opens the existing `ConvertToProposalDialog`.
  If no eligible booking exists, empty state should explain "cần tạo Booking
  trước" with a CTA into Bookings.
- Acceptance criteria: a user who has never opened Bookings can still start a
  Proposal from the Proposals page in ≤3 clicks.
- Dependencies: none (reuses existing dialog/API). Risk: low. Priority: P0.
  Effort: S.

---

## EPIC 2 — Task & Notification Clarity (P0/P1)

### FEATURE 2.1 — Split Notifications from Tasks

**STORY:** As any staff user, I want to see "việc cần làm" separately from
"thông báo," so I can tell what needs action without opening every item.
- Current: `apps/frontend/src/components/NotificationCenter.tsx` renders one flat
  feed; only a hardcoded approvals banner is special-cased.
- Expected behavior: add a static classification map (`type` → `task`|
  `notification`) covering the ~15 known types from
  `apps/backend/src/modules/notifications/notifications.service.ts` call sites
  (billing, fitout, patrol, proposals, tickets, work-orders, contracts, CRM, AI);
  render two tabs in `NotificationCenter`, each with its own unread count.
- Acceptance criteria: `APPROVAL_PENDING`, `TICKET_SLA_BREACH`,
  `FITOUT_SLA_BREACH`, `FITOUT_ESCALATION`, `TICKET_ESCALATION` classify as tasks;
  `PROPOSAL_APPROVED`, `SYSTEM` (AI insight), routine updates classify as
  notifications. Existing single-feed behavior is preserved inside the
  "Thông báo" tab (no regression).
- Dependencies: none — pure frontend reclassification of existing data.
  Risk: low. Priority: P0. Effort: M.

### FEATURE 2.2 — Dashboard action coverage

**STORY:** As an Operation user, I want fitout SLA breaches and work-order/patrol
overdue items on my dashboard action list, since my `focusAreas` today only
include tickets/fitout counts but the fitout SLA breach type isn't surfaced there.
- Current: `apps/backend/src/modules/dashboard/dashboard.service.ts`
  `ActionItems`/action-list query covers 6 fixed types (overdue invoices, expiring
  contracts ×2, open tickets, expiring bookings, pending approvals).
- Expected behavior: extend the action-item query to include fitout SLA breach
  count (from `FitoutSlaService`/`FitoutMilestone` overdue records) and, for
  Operation-focused roles, work-order/patrol overdue counts.
- Acceptance criteria: an Operation-role dashboard shows a fitout-delay action
  item when one exists in seed/test data.
- Dependencies: none. Risk: low. Priority: P1. Effort: M.

---

## EPIC 3 — Approval Decision Context (P1)

### FEATURE 3.1 — Inline deal context on approval rows

**STORY:** As a Manager/Director/CEO, I want to see discount %, rent-free days,
and why this hit my approval tier, directly in the Approvals queue, so I don't
need to open the Proposal separately to decide.
- Current: `apps/frontend/src/pages/approvals/ApprovalsPage.tsx` `ApprovalPipeline`
  shows step/status only.
- Expected behavior: extend the approvals list API response to include the
  policy-relevant fields already computed server-side
  (`apps/backend/src/modules/approvals/approval-policy.util.ts` `PolicyContext`:
  discountPct, rentFreeDays, hasArDebt, priceDeviationPct) and which rule
  triggered this step; render as a compact summary line per row.
- Acceptance criteria: approver can approve/reject without navigating away from
  `/approvals` for the common case (complex cases can still drill in).
- Dependencies: none. Risk: low. Priority: P1. Effort: M.

### FEATURE 3.2 — Pre-submit approval-chain preview

**STORY:** As a proposal submitter, I want to see which approvers my proposal will
require before I submit, so I'm not surprised by a 3-step chain.
- Expected behavior: expose a dry-run of `buildApprovalStepsFromRules()` (or an
  equivalent read-only endpoint) callable from the proposal edit screen with
  current draft values.
- Dependencies: `approval-policy.util.ts` logic must be safely callable without
  side effects (it should already be pure). Risk: low. Priority: P2. Effort: M.

---

## EPIC 4 — Navigation Restructure (P1)

### FEATURE 4.1 — Regroup sidebar into task clusters

**STORY:** As any staff user, I want the sidebar grouped by what I'm trying to do,
consistently across all groups (today only `salesProcess`/`crm` are task-grouped).
- Current: `apps/frontend/src/lib/permissions.ts` `NAV_GROUPS`.
- Expected behavior: implement the target tree in
  [13-UX-BLUEPRINT](13-UX-BLUEPRINT.md) — merge Parking Central into Operations'
  parking item (fixes FR-03), split `operations` into 3 sub-clusters (Thi công &
  Bàn giao / Xử lý sự cố / An ninh & Bãi đỗ xe), consolidate reporting surfaces.
- Acceptance criteria: no route is removed (per audit rule: don't delete
  functionality), only regrouped; existing `canAccessModule` filtering continues
  to work unchanged since it operates per-item, not per-group.
- Dependencies: none structurally, but should land after Epic 1 (RBAC fix) so the
  nav config change doesn't compound with an unrelated permission bug.
  Risk: medium (touches every user's daily nav — needs a design review /
  screenshot pass before merge). Priority: P1. Effort: M.

---

## EPIC 5 — Empty State Consistency (P0)

### FEATURE 5.1 — CTA-driven empty states on Contracts, Proposals, Billing Invoices

**STORY:** As a new user hitting an empty list, I want a helpful message and a
relevant action, matching what Tickets already does.
- Reference implementation: `apps/frontend/src/pages/tickets/TicketsPage.tsx`
  (~line 768-836) — icon + message + contextual CTA ("Xóa bộ lọc" vs. "Tạo phiếu
  kiểm tra" depending on whether a filter is active).
- Targets: `apps/frontend/src/pages/contracts/ContractsPage.tsx` (~line 1377),
  `apps/frontend/src/pages/proposals/ProposalsPage.tsx` (~line 1193),
  `apps/frontend/src/pages/billing/BillingPage.tsx` Invoices tab (~line 1116) —
  all three should use the already-imported shared `AsyncState`/`EmptyState`
  component with its `emptyAction` slot filled in (the AR Aging tab in the same
  Billing file already demonstrates the pattern half-correctly, at line ~1199).
- Acceptance criteria: each of the 3 screens distinguishes "no data at all" from
  "no results for current filter," and provides a working CTA for both cases.
- Dependencies: none. Risk: low. Priority: P0. Effort: S (×3 screens).

---

## EPIC 6 — Global Search (P2)

### FEATURE 6.1 — Ctrl+K command palette

**STORY:** As any staff user, I want to jump directly to a Tenant/Proposal/
Contract/Ticket/Unit/Lead by name or ID from anywhere, without knowing which
module currently holds it.
- Expected behavior: new header search trigger + `cmdk`-based palette; backend
  search endpoint(s) scoped by the same `MODULE_ROLES`/`MallAccessGuard` checks
  each entity's list endpoint already applies; reuse routing logic already
  implemented in `NotificationCenter.tsx`'s `entityLink()` for navigating to
  results.
- Acceptance criteria: search results never include a record the user's role/mall
  scope couldn't otherwise see (verified by a permission test per entity type).
- Dependencies: none. Risk: medium (new backend query surface — needs its own
  authorization review). Priority: P2. Effort: L.

---

## EPIC 7 — Module Redesigns (P1/P2, sequenced after Epics 1–5)

Each of the following reuses V2's existing gap/recommendation analysis; this
backlog only adds the *screen-spec* pointer so implementation has a concrete
target:

- **CRM split** (Lead Workspace / Customer 360) — spec: `docs/redesign/
  crm-bookings.md`. Priority P1. Effort L.
- **Bookings split** (reservation queue / unit availability / pricing) — spec:
  `docs/redesign/crm-bookings.md`. Priority P1. Effort L.
- **Contracts summary-first redesign** — spec: `docs/redesign/
  proposals-contracts.md`. Priority P1. Effort M.
- **Billing tab regrouping** (action-needed vs. reference) — spec: `docs/
  redesign/billing.md`. Priority P1. Effort M.
- **Fitout workspace regrouping** (5 clusters per V2) — spec: `docs/redesign/
  fitout.md`. Priority P1. Effort L.
- **Admin monolith split** — Priority P2. Effort L. (No dedicated redesign spec
  written in this pass — sequence after Epic 4 lands, since it reuses the same
  "regroup by task not by module" technique.)

All Epic 7 items depend on Epic 1 (RBAC/entry-point fixes) and Epic 4 (nav
restructure) landing first, so users aren't navigating a half-migrated IA while a
module redesign is also in flight.
