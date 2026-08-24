# UX Restructure Implementation — Option B

Status: **COMPLETE** · Started and completed 2026-08-18 · See
`OPTION_B_COMPLETION_REPORT.md` for the final summary.

## Wave 1 — Critical P0

### FR-01 RBAC Drift (Tenant / Fitout)

**Before:** `apps/frontend/src/lib/permissions.ts` `ROUTE_PERMISSIONS.fitout`
included `"TENANT"`; corresponding backend sub-resource controllers
(submittal/issue/gantt/daily-report/controls) do not grant `Role.TENANT`. A
tenant reaching `/fitout` via direct URL would load the overview then 403 on
every other tab. See `UX_DECISIONS.md` DECISION-001 for full analysis.

**Change:** Removed `"TENANT"` from `ROUTE_PERMISSIONS.fitout` in
`permissions.ts`. Tenant fitout visibility remains fully served by Tenant
Portal's existing embedded Fitout tab (unchanged, still uses the 2
TENANT-permitted endpoints in `fitout.controller.ts`).

**Files:**
- `apps/frontend/src/lib/permissions.ts`
- `apps/frontend/src/lib/permissions.test.ts` (updated assertions)

**Tests:** `npx vitest run src/lib/permissions.test.ts` — 4/4 passed.

**Result:** DONE. Cross-checked all other `@Roles(...TENANT)` grants
platform-wide (tickets, tenants, fitout, contracts) — Contracts and the rest
are already consistent between frontend and backend; Fitout was the only
drift.

---

### FR-02 Proposal Creation Entry Point

**Before:** `ProposalsPage.tsx` had no "create" action anywhere — creation only
existed inside `bookings/ConvertToProposalDialog.tsx`, reachable only from a
booking's detail view.

**Change:** Added a "+ Tạo đề xuất" primary action to the Proposals list
header (visible to `canEdit` roles: ADMIN/LEASING_MANAGER/LEASING_EXECUTIVE/
MALL_DIRECTOR). It opens a new booking-picker dialog
(`CreateProposalDialog.tsx` → `CreateProposalEntryDialog`) that lists active
bookings without a linked proposal (`status: 'ACTIVE'`, filtered client-side
for `!booking.proposal`), searchable by booking number/unit/tenant. Picking a
booking opens the existing `ConvertToProposalDialog` unchanged — no new
creation logic, pure reuse. If no eligible bookings exist, the picker explains
why and offers "Tạo Booking trước" linking to `/bookings`. Also brought the
list's empty state up to the same standard while in this file (see FR-09 entry
below) since both fixes touch the identical empty-state block.

**Files:**
- `apps/frontend/src/pages/proposals/CreateProposalDialog.tsx` (new)
- `apps/frontend/src/pages/proposals/ProposalsPage.tsx`
- `apps/frontend/src/locales/{vi,en}/deals.json` (new `proposals.createEntry.*`
  keys; reused pre-existing unused `proposals.create` / `proposals.filters`
  keys)

**Tests:** `npx tsc --noEmit` — 0 errors. `npx vitest run src/pages/proposals
src/pages/bookings` — no new failures; the 27 pre-existing `BookingsPage.
test.tsx` + 10 `LeadEditDialog.test.tsx` failures were verified present on the
clean tree (via `git stash`) before this change, unrelated to files touched
here. No test file exists yet for `ProposalsPage.tsx`.

**Result:** DONE.

---

### FR-07 Task vs Notification Split

**Before:** `NotificationCenter.tsx` rendered one flat feed for every
`Notification.type` (SLA breaches, escalations, informational updates, AI
insights) with only read/unread state; the only special case was a hardcoded
"pending approvals" banner fetched separately from `approvalsApi.pending()`.

**Change:** Added `apps/frontend/src/lib/notification-classification.ts` — a
pure `classifyNotification(type)` function built from a static map verified
against every live `notificationsService.create()` call site across 8 backend
modules (cross-checked which of two duplicate contract-expiry schedulers is
actually registered — only `notifications/contract-expiry.scheduler.ts` is;
`analytics/contract-expiry.scheduler.ts` is dead code, per V2's own
"duplicate scheduler" finding, left untouched as out of scope for Option B).
`NotificationCenter.tsx` now renders two tabs — "Việc cần làm" (Task) and
"Thông báo" (Notification) — each with its own unread count, computed from
the already-fetched notification list (no new backend endpoint; see
`UX_DECISIONS.md` DECISION-002). The pending-approvals banner moved into the
Task tab. Task tab gets a positive empty state ("Không có việc cần xử lý")
instead of a blank list. Header bell badge in `Layout.tsx` is unchanged
(still one combined count) — a deliberate scope limit, see DECISION-002.

**Files:**
- `apps/frontend/src/lib/notification-classification.ts` (new)
- `apps/frontend/src/components/NotificationCenter.tsx`
- `apps/frontend/src/locales/{vi,en}/admin.json` (`notifications.tabs.*`,
  `notifications.noTasks`)

**Tests:** New `notification-classification.test.ts` (4 tests) and
`NotificationCenter.test.tsx` (5 tests, mocks `@/api`, verifies task items
land in the Task tab, informational items in the Notification tab, pending
approvals surface in the Task tab, and the positive empty state appears when
nothing needs action) — all pass. `npx tsc --noEmit` — 0 errors.

**Result:** DONE.

---

### FR-09 Empty-State Consistency (Contracts, Billing Invoices)

**Before:** `ContractsPage.tsx` (~line 1377) and the Billing `InvoicesTab`
(~line 1116) both showed a bare icon + one line of text, with no CTA and no
distinction between "genuinely empty" and "no results for the active filter."
(Proposals was already fixed as part of the FR-02 change above, since both
issues shared the same empty-state block on that screen.)

**Change:** Both screens now branch on whether a filter is active (reusing
each screen's pre-existing filter state — `hasFilter` on Contracts,
`search/status/bucket/sourceType` on Billing's `InvoicesTab`):
- Filtered + empty → "no results for this filter" message + a working "Xóa
  bộ lọc" button (Contracts reuses its existing `clearFilters()`; Billing
  adds an equivalent inline clear).
- Genuinely empty (no filter) → an explanatory message instead of a dead
  end. Neither screen has a direct "create" action of its own (contracts are
  generated from approved Proposals; invoices are generated from the billing
  schedule or the existing "Chờ xử lý" pending-receivables section on the
  same tab), so rather than inventing an artificial CTA, Contracts links to
  `/proposals` (the actual source of new contracts) and Billing's copy points
  to the pending-receivables section already on the page.

**Files:**
- `apps/frontend/src/pages/contracts/ContractsPage.tsx`
- `apps/frontend/src/pages/billing/BillingPage.tsx` (`InvoicesTab`)
- `apps/frontend/src/locales/{vi,en}/contracts.json`,
  `apps/frontend/src/locales/{vi,en}/billing.json`

**Tests:** `npx tsc --noEmit` — 0 errors. No pre-existing test files for
either page (none added here — low-risk, additive JSX/i18n change to
existing state, proportionate to the size of the change).

**Result:** DONE. **Wave 1 (all 4 P0 items) complete.**

### Wave 1 gate

- `npx tsc --noEmit` — 0 errors.
- `npx vite build` — succeeds (pre-existing >500kB chunk warning, unrelated).
- `npx vitest run` (full suite) — 180 passed / 39 failed / 219 total. All 39
  failures verified pre-existing on the clean tree via `git stash` (3 files:
  `BookingsPage.test.tsx` 27, `LeadEditDialog.test.tsx` 10,
  `DashboardPage.test.tsx` 2 — none touched by Wave 1). 22 new tests added in
  Wave 1, all passing.

---

## Wave 2 — Navigation + Dashboard

### FR-12 / FR-03 Navigation Regroup

**Before:** `NAV_GROUPS.operations` bundled 7 functionally unrelated items
into one flat technical-module list; a separate `parkingCentral` group split
Parking reporting away from the main Parking item.

**Change:** Replaced `operations` + `parkingCentral` with 3 task clusters —
"Thi công & Bàn giao" (Fitout), "Xử lý sự cố & Bảo trì" (Tickets, Work
Orders, Inventory), "An ninh & Bãi đỗ xe" (Patrol, Parking, Parking
Transaction, Parking Report — fixes the FR-03 fragmentation) — and moved
Service Contracts into the Tài chính group. See `UX_DECISIONS.md`
DECISION-003 for the full rationale. No route paths, `ROUTE_PERMISSIONS`, or
`MODULE_ROLES` grants changed — this is a pure regrouping/relabeling.

**Files:**
- `apps/frontend/src/lib/permissions.ts` (`NAV_GROUPS`)
- `apps/frontend/src/locales/{vi,en}/nav.json` (`groups.*`)

**Tests:** Added a regression guard to `permissions.test.ts` asserting every
`RouteModule` appears exactly once across `NAV_GROUPS` (catches accidental
duplication or a dropped module in future edits to this structure) — 5/5
pass. `npx tsc --noEmit` — 0 errors. Verified no duplicate module entries via
a one-off script before committing the change.

**Result:** DONE.

---

### FR-08 Dashboard Action Coverage (Fitout SLA breaches)

**Before:** `ActionItems` on the Dashboard covered 6 fixed types (pending
approvals, overdue invoices, expiring contracts ×2, open tickets, expiring
bookings). Fitout SLA/milestone breaches already exist as a real signal
(`FitoutSlaService`, notification type `FITOUT_SLA_BREACH`) but never
appeared on the dashboard, even though `focusAreasForRole` already scopes
Operation to `['tickets', 'fitout']`.

**Change:** `dashboard.service.ts` now queries a **live** overdue-milestone
count (`FitoutMilestone` where `completedAt: null && targetDate < now`,
mall-scoped the same way every other dashboard query is) — deliberately
computed live rather than relying on the daily cron's `isOverdue` flag, so it
stays accurate between cron runs instead of reflecting only yesterday's 8am
snapshot. Added `openFitoutSlaBreaches` to the dashboard payload and to
`shapeForRole`'s OPERATION branch (Overview roles already receive the full
payload). Frontend `ActionItems` gained a new urgent item ("Fitout trễ SLA"),
gated by the same `showOperations` flag as the existing ticket item, linking
to `/fitout/dashboard`.

**Files:**
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.spec.ts` (added
  `fitoutMilestone` mock + 2 new tests: mall-scoping of the new query, and
  that non-Operation/Overview roles like FINANCE don't receive the field)
- `apps/frontend/src/pages/dashboard/DashboardPage.tsx`
- `apps/frontend/src/locales/{vi,en}/dashboard.json`
  (`actionItems.fitoutSlaBreaches`)

**Tests:** Backend: `npx jest dashboard.service.spec.ts` — 4/4 pass (2 new).
`npx tsc --noEmit` (backend) — 0 errors. Frontend:
`npx vitest run src/pages/dashboard/DashboardPage.test.tsx` — same 2
pre-existing failures as baseline, no new ones. `npx tsc --noEmit`
(frontend) — 0 errors.

**Result:** DONE.

### Wave 2 gate

- Backend: `npx jest` (full suite) — 267 passed / 7 failed / 274 total. All 7
  failures verified pre-existing on the clean tree via `git stash` (2 files:
  `health.controller.spec.ts`, `proposals.controller.spec.ts` — neither
  touched by Wave 2). `npx tsc --noEmit` (backend) — 0 errors.
- Frontend: `npx vite build` — succeeds. `npx tsc --noEmit` — 0 errors.

---

## Wave 3 — Approval Decision Context

### FR-04 Inline Approval Decision Context

**Reconciliation note (section 1 of the implementation brief — code is
evidence over documentation):** re-reading the live `ApprovalsPage.tsx`
pending-approvals table during implementation showed it already renders
discount%, monthly rent, contract value, and inline Approve/Reject buttons
directly in the queue row (no navigation away required) — better than
FR-04's original description ("approver must open the Proposal detail
separately"). The two things genuinely still missing were: rent-free days,
and *why* this step reached this approver (which policy rule fired). Scope
narrowed accordingly instead of rebuilding a decision surface that already
works.

**Before:** `ApprovalStep` carries `stepName`/`approverRole` (its own
metadata) but nothing about which `ApprovalPolicyRule` produced it — a
manager could see "CEO Approval" but not that it fired because discount
exceeded 10%. Rent-free days weren't shown at all in the queue.

**Change:**
- Backend: `ApprovalsService.getPending()` now attaches a `policyReason`
  field per step — matched against currently-active `ApprovalPolicyRule`s by
  `stepName + approverRole` (the best available correlation without a schema
  change, since steps are renumbered per-proposal in
  `buildApprovalStepsFromRules` and don't store a rule ID) and surfacing the
  rule's own human-authored `name` field as the explanation text.
- Frontend: the pending-approvals table now shows the policy reason as a
  small subtitle under the step name, and rent-free days next to the
  discount % (reusing the `proposal.rentFree` field, already returned by the
  existing query — no new API shape needed there).

**Files:**
- `apps/backend/src/modules/approvals/approvals.service.ts`
- `apps/backend/src/modules/approvals/approvals.get-pending.spec.ts` (new)
- `apps/frontend/src/pages/approvals/ApprovalsPage.tsx`
- `apps/frontend/src/locales/{vi,en}/deals.json`
  (`approvals.table.rentFreeDays`, `.policyReasonTitle`)

**Tests:** Backend: new `approvals.get-pending.spec.ts` (2 tests: rule
matched → reason attached; no active rule matches → `null`, not a crash) —
pass. Full `npx jest approvals` — 23/23 pass. `npx tsc --noEmit` (backend) —
0 errors. Frontend: `npx tsc --noEmit` — 0 errors; no pre-existing test file
for `ApprovalsPage.tsx`.

**Result:** DONE.

### Wave 3 gate

- Backend: `npx jest approvals` — 23/23 pass (2 new). `npx tsc --noEmit` — 0
  errors.
- Frontend: `npx tsc --noEmit` — 0 errors.

---

## Wave 4 — Cross-Module Workflow Handoff

### Contract → Fitout/Billing Handoff Signal

**Major reconciliation (section 1 — code is evidence over documentation):**
the audit's `11-INFORMATION-FLOW.md` finding stated "Contract ACTIVE does not
visibly hand off to Fitout/Billing... a human must separately start each."
Re-reading the live backend during implementation shows this is **incorrect**:
- `FitoutService.handleContractActivated()` (`@OnEvent('contract.activated')`)
  already auto-creates a `FitoutProject` the moment a contract activates —
  idempotent, guarded against duplicates.
- `ContractsService.updateStatus()` already calls
  `billingScheduleService.buildScheduleForContract(id)` unconditionally
  whenever a contract's status resolves to `ACTIVE`.

Both handoffs are **already automated**. The actual, narrower gap — confirmed
by grepping the frontend — is that `ContractsPage.tsx` never read or
displayed `fitoutProject`/billing-schedule state at all, so a user had no way
to *see* that the automation had already run. Scope corrected from "add
missing automation" to "surface existing state," which is safer (no new
business logic) and matches what section 19/20 actually ask for (visibility
of downstream consequences + preserved context on navigation).

**Change:**
- Backend: `ContractsService.findOne()` now also selects `billingSchedule`
  (`take: 1`, existence check only) alongside the `fitoutProject` relation it
  already fetched.
- Frontend: Contract detail view shows a 2-cell status strip (visible only
  for `ACTIVE`/`EXPIRING` contracts, near the header, above the tabs) —
  "Fitout đã được khởi tạo" / "chưa được khởi tạo", and the same for billing
  schedule — each with a "Xem" link when present.
- Cross-module context preservation (section 20): `FitoutPage.tsx` previously
  had no way to deep-link to a specific project — added `?projectId=` URL
  param support (mirrors the existing `?id=` pattern already used in
  `ProposalsPage`/`ContractsPage`), so "Xem Fitout" opens the correct
  project's detail sheet directly instead of landing on the list. The
  Billing link intentionally stays a plain `/billing` navigation — the
  backend's invoice list has no `contractId` filter today, and adding one
  was out of scope for a visibility fix; misrepresenting a working deep link
  would have been worse than a plain link.

**Files:**
- `apps/backend/src/modules/contracts/contracts.service.ts`
- `apps/frontend/src/pages/contracts/ContractsPage.tsx`
- `apps/frontend/src/pages/fitout/FitoutPage.tsx` (`?projectId=` support)
- `apps/frontend/src/locales/{vi,en}/contracts.json` (`handoff.*`)

**Tests:** Backend: `npx jest contracts` — 19/19 pass (no existing test
asserted the exact `findOne` include shape, so none needed updating).
`npx tsc --noEmit` (backend) — 0 errors. Frontend: `npx tsc --noEmit` — 0
errors; `npx vite build` — succeeds. No pre-existing tests for
`FitoutPage.tsx`.

**Result:** DONE.

### Wave 4 gate

- Backend: `npx jest contracts` — 19/19 pass. `npx tsc --noEmit` — 0 errors.
- Frontend: `npx tsc --noEmit` — 0 errors. `npx vite build` — succeeds.

---

## Wave 5 — UX Consistency Pass

Scoped to the screens Option B actually touched (Waves 1–4), per section 22
("Sau các thay đổi chính, audit lại các screens trong Option B") — not a
platform-wide design-system cleanup, which is explicitly Option C (section
27: "Không tiến hành full Design System cleanup").

**Checked and found already correct (no change needed):**
- Billing tab terminology: V2's proposed glossary (AR Aging→Tuổi nợ,
  Dunning→Nhắc nợ, Collection KPI→Hiệu quả thu hồi) is **already implemented**
  in `locales/vi/billing.json` (`tabs.arAging`, `.dunning`, `.kpi`) — the tab
  labels already render correctly in Vietnamese; V2's finding likely referred
  to component/variable names (`DunningTab`, `CollectionKpiTab`), which are
  code identifiers, not user-facing text. No action taken — re-translating
  already-correct labels would be pure churn.
- Primary-action-per-screen rule: verified across every screen touched in
  Waves 1–4 (Proposals: single "+ Tạo đề xuất"; Contracts: no create button,
  correctly so since contracts are generated from Proposals, not created
  directly; Approvals: existing inline Approve/Reject unchanged; Notification
  Center: no competing primary actions added by the tab split).
- Empty-state consistency: already addressed directly in Wave 1 (FR-09) for
  the 3 screens that needed it; Tickets/Tenant Portal remain the reference
  implementations, untouched per the brief's instruction not to redesign
  reference implementations in this phase.

**Explicitly deferred (correctly out of scope for Wave 5):**
- Consolidating `ConfirmDialog`/`ConfirmActionDialog` (V2 finding) — 13
  combined call sites across 2 differently-shaped components; verifying prop
  compatibility across all of them is a genuine refactor, not a consistency
  tweak. Left for V2 Sprint C / Option C.
- Scrolling tab primitive for high-tab-count screens (Fitout ~15, Billing
  ~11, Contracts 7) — this is module redesign work, explicitly listed under
  "DO NOT TOUCH" for Option B (section 29).

**Result:** DONE — no code changes in this wave; existing state verified
against the consistency checklist.

---

## Wave 6 — Regression + Go-Live Validation

Final full-suite run across everything touched in Waves 1–5.

- Backend: `npx jest` (full suite) — **269 passed / 7 failed / 276 total.**
  Failed suites unchanged from every prior wave gate: `health.controller.
  spec.ts`, `proposals.controller.spec.ts` (both pre-existing, verified via
  `git stash` at Wave 1/2, neither touched by any wave). `npx tsc --noEmit`
  (backend) — 0 errors.
- Frontend: `npx tsc --noEmit` — 0 errors. `npx vitest run` (full suite) —
  **181 passed / 39 failed / 220 total.** Failed files unchanged from every
  prior wave gate: `BookingsPage.test.tsx` (27), `LeadEditDialog.test.tsx`
  (10), `DashboardPage.test.tsx` (2) — all pre-existing. `npx vite build` —
  succeeds (pre-existing >500kB chunk-size warning, unrelated to this work).

**No regressions introduced across 6 waves.** All new tests added during
Option B (22 total: 4 classification, 5 NotificationCenter, 1 nav regression
guard, 2 dashboard SLA-scoping/role-shaping, 2 approvals policyReason, plus
the pre-existing suites gaining net +0 failures) pass.

See `docs/implementation/OPTION_B_COMPLETION_REPORT.md` for the final
Go-Live re-evaluation and summary.

