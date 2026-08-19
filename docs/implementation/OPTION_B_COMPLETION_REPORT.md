# Option B — UX Restructure — Completion Report

**Scope:** P0 critical fixes + navigation restructure + dashboard action
coverage + approval decision context + cross-module handoff visibility +
consistency pass. Option C (full module redesigns of CRM/Bookings/Contracts/
Billing/Fitout, global search, reporting consolidation, full design-system
cleanup) was explicitly out of scope and untouched.

**Full step-by-step change record:** `docs/implementation/UX_RESTRUCTURE_LOG.md`
**Architecture/UX decisions made along the way:** `docs/implementation/UX_DECISIONS.md`

---

## Waves completed

| Wave | Scope | Status |
|---|---|---|
| 1 | Critical P0: RBAC drift, Proposal entry point, Task/Notification split, empty states | ✅ Complete |
| 2 | Navigation regroup (task clusters) + Dashboard action coverage (fitout SLA) | ✅ Complete |
| 3 | Approval decision context (policy reason + rent-free days inline) | ✅ Complete |
| 4 | Contract → Fitout/Billing handoff visibility | ✅ Complete |
| 5 | UX consistency pass (scoped to touched screens) | ✅ Complete (no code changes — verified already-correct) |
| 6 | Regression + Go-Live validation | ✅ Complete |

## Critical issues

**Before: 3** (FR-01 live RBAC drift for Tenants, FR-02 no Proposal creation
entry point, FR-07 no Task/Notification split)
**After: 0**

All three confirmed fixed and verified:
- FR-01: `permissions.ts` no longer grants `TENANT` the `fitout` route;
  regression-guarded by an updated `permissions.test.ts` assertion, and a
  platform-wide grep confirmed no other frontend/backend RBAC drift exists.
- FR-02: "+ Tạo đề xuất" is now a visible primary action on `/proposals`,
  backed by a booking picker; empty state explains the Lead→Booking
  prerequisite when no eligible booking exists.
- FR-07: Notification Center now has separate "Việc cần làm"/"Thông báo"
  tabs, classified from the existing `Notification.type` field with no new
  backend model.

## High issues — resolved / mitigated / deferred

| ID | Issue | Outcome |
|---|---|---|
| FR-03 | Parking split across two nav groups | **Resolved** — merged into one "An ninh & Bãi đỗ xe" cluster |
| FR-04 | Approval decisions require a screen switch | **Resolved** (scope narrowed after re-reading live code — the queue already had inline Approve/Reject; added the two genuinely missing pieces: rent-free days and policy-reason context) |
| FR-06 | Proposal→Contract conversion has no preview before a multi-entity fan-out | **Deferred** — P2/strategic, not in Option B's P0–P1 wave scope |
| FR-09 | 3 flagship screens had no empty-state CTA | **Resolved** — Proposals, Contracts, Billing Invoices brought up to the Tickets reference pattern |
| FR-10 | One `OPERATION` role covers 7 unrelated jobs | **Mitigated** — nav regroup into 3 task clusters reduces scanning cost; full sub-role RBAC explicitly deferred (needs new permission granularity, out of scope) |
| FR-11 | 6 overlapping reporting surfaces | **Deferred** — Option C (reporting consolidation) |
| FR-12 | Inconsistent sidebar grouping principle | **Resolved** — every group is now task-clustered, matching the pre-existing `salesProcess` pattern |
| FR-14 | High-tab-count screens (Fitout ~15, Billing 11, Contracts 7) | **Deferred** — Option C (module redesigns) |

**4 of 8 resolved, 1 mitigated, 3 correctly deferred to Option C.**

## Files changed

**Backend (4 files + 1 new test):**
`dashboard.service.ts`, `dashboard.service.spec.ts`, `approvals.service.ts`,
`contracts.service.ts`, new `approvals.get-pending.spec.ts`

**Frontend (12 files + 4 new):**
`permissions.ts`, `permissions.test.ts`, `NotificationCenter.tsx`,
`ProposalsPage.tsx`, `ContractsPage.tsx`, `BillingPage.tsx`,
`DashboardPage.tsx`, `ApprovalsPage.tsx`, `FitoutPage.tsx`, plus 12 locale
JSON files (`vi`/`en` × admin/billing/contracts/dashboard/deals/nav); new:
`CreateProposalDialog.tsx`, `notification-classification.ts` (+ test),
`NotificationCenter.test.tsx`

**Docs:** `docs/audit/` (17 files, from the prior Audit phase),
`docs/redesign/` (8 files, from the prior Audit phase),
`docs/implementation/` (this report + log + decisions, new)

No backend API contracts broken, no database migrations, no routes removed.
Two additive backend fields (`openFitoutSlaBreaches` on the dashboard
payload, `billingSchedule`/`policyReason` on two existing endpoints).

## Tests

| Suite | Result |
|---|---|
| Backend `npx jest` (full) | 269 passed / 7 failed / 276 total — all 7 failures pre-existing (verified via `git stash`), unrelated to this work |
| Backend `npx tsc --noEmit` | 0 errors |
| Frontend `npx vitest run` (full) | 181 passed / 39 failed / 220 total — all 39 failures pre-existing, unrelated |
| Frontend `npx tsc --noEmit` | 0 errors |
| Frontend `npx vite build` | Succeeds |

**22 new tests added, all passing. Zero regressions across 6 waves.**

## Build

**PASS** (backend and frontend, typecheck + production build)

## Regression

**None detected.** Every pre-existing test failure was individually verified
against the clean tree (`git stash` before/after comparison) at the wave
where the adjacent code was touched, confirming none were introduced by this
work.

## UX Score

**Before: ~55/100** (qualitative estimate from the Executive Audit)
**After: ~68/100** — estimate, not a formal re-audit; grounded per-dimension:

| Dimension | Before | After | Evidence |
|---|---|---|---|
| Navigation clarity | Partially ready | **Ready** | Every sidebar group now task-clustered, consistent principle throughout |
| Core journey completeness | Partially ready | **Ready** | Proposal creation discoverable from `/proposals` |
| Approval decision clarity | Partially ready | **Ready** | Policy reason + rent-free days inline in the queue |
| Task/notification separation | Not ready | **Ready** | Implemented per the audit brief's explicit ask |
| RBAC correctness | Not ready | **Ready** | Confirmed drift fixed, cross-checked platform-wide |
| Empty-state guidance | Not ready | **Ready** | 3 screens fixed, matching the Tickets reference pattern |
| Cross-module handoff visibility | Not assessed | **Ready** | Contract detail now shows Fitout/Billing state |
| Reporting surface clarity | Not ready | Not ready | Unchanged — Option C |
| Module/screen complexity (Fitout/Billing/CRM/Bookings) | Not ready | Not ready | Unchanged — Option C |
| Global search | Absent | Absent | Unchanged — Option C |
| Onboarding | Not ready | Not ready | Unchanged — Option C |

Score not inflated: dimensions with no code change are marked unchanged, not
credited.

## Go-Live Readiness

**Before:** CONDITIONAL GO (blocked on 3 Critical issues + empty-state gap)
**After:** **GO for internal staff use on the UX/workflow dimension.** All
items the original readiness assessment named as blocking are resolved.

Full production Go-Live still depends on items outside this option's scope
(unchanged from the original assessment, not re-verified here):
- V2 Sprint A reliability items (atomic billing generation, distributed
  scheduler lock) — engineering track, not a UX concern, but sits on the
  same critical path.
- Security review, performance testing, UAT with real mall staff — not
  performed as part of this audit or Option B.

## Deferred to Option C

- Full module redesigns: CRM (Lead/Customer workspace split), Bookings
  (reservation queue split), Contracts (summary-first tab reorg), Billing
  (action-needed vs. reference tab grouping), Fitout (5-workspace regroup)
- Ctrl+K global search
- Reporting surface consolidation (Dashboard/Reports/Analytics/Cross-Mall/
  Pipeline Stats/Deal Pipeline → 3 named-purpose surfaces)
- Design-system consolidation (ConfirmDialog/ConfirmActionDialog merge,
  scrolling tab primitive, PageHeader adoption platform-wide)
- Operation role sub-scoping (FR-10 full fix)
- Onboarding/first-login tour

---

## Two audit-finding corrections discovered during implementation

Per the brief's own rule ("code runtime behavior is evidence over
documentation"), two audit findings were checked against live code and found
inaccurate before being acted on — both are logged in full in
`UX_DECISIONS.md` (DECISION-001, DECISION-004):

1. **FR-01** was framed as a "live reachable dead link" — in fact no in-app
   path (nav, process guide, or notification) ever pointed a tenant at
   `/fitout`; the real risk was a partial-403 experience if a tenant navigated
   there directly. Fix scope was correct either way, but the severity
   framing was corrected.
2. **11-INFORMATION-FLOW's** "Contract active but no Fitout/Billing started"
   gap was found to already be fully automated in the backend
   (`FitoutService.handleContractActivated`, `ContractsService.updateStatus`
   → `buildScheduleForContract`). The real gap was that this automation was
   invisible on the Contract detail screen — Wave 4 fixed the visibility
   problem instead of building redundant automation.

Both corrections avoided unnecessary or duplicate engineering work.
