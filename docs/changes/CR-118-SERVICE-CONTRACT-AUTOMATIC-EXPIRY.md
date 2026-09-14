# CR-118 — Automatic Service Contract expiry lifecycle

## CHANGE ID
CR-118

## BUSINESS REASON
Service Contract users should not manually decide whether an effective contract is near or past its contractual end date. The system must derive those time-based states consistently and show the remaining/elapsed days in the contract workspace.

## CURRENT BEHAVIOR
The daily scheduler automatically transitions `ACTIVE/EXPIRING` records, but uses a 31-day expiring window and compares timestamps in a way that can mark a date-only contract expired during its end date. The frontend and status API still allow users to manually select `EXPIRING` and `EXPIRED`. The summary/filter uses a configurable 30-day window and the right-side workspace does not explicitly show days remaining. Existing records marked expiring under the old window are not returned to active.

## EXPECTED BEHAVIOR
Only effective contracts participate in automatic time states: `ACTIVE` becomes `EXPIRING` when its end date is between the current Ho Chi Minh calendar date and seven calendar days ahead, inclusive; `ACTIVE/EXPIRING` becomes `EXPIRED` only when the current calendar date is later than the end date. An `EXPIRING` record more than seven days away returns to `ACTIVE`. Users cannot submit `EXPIRING` or `EXPIRED` through the status endpoint or select those transitions in the UI. Summary/filter counts use the same seven-day window, and the detail workspace displays remaining or elapsed calendar days.

## PRIMARY DOMAIN
Service Contracts.

## AFFECTED JOURNEYS
BP-006 Service-Contract-to-Cash: active lifecycle monitoring, expiry alerts, renewal availability, and exclusion of expired contract payments from Billing candidate lists.

## UPSTREAM IMPACT
Depends on required `endDate` for new records from CR-117, persisted `ServiceContract.status`, and the distributed scheduler lock. Legacy records with null end dates cannot be time-classified and remain unchanged.

## DOWNSTREAM IMPACT
Service Contract list/detail/status filters, summaries, notifications, Excel export, renewal button, and Billing pending-receivable filtering consume `ACTIVE/EXPIRING/EXPIRED`. Billing already treats ACTIVE and EXPIRING identically, so narrowing the warning window does not change eligibility before expiry; EXPIRED remains excluded.

## DATA OWNERSHIP IMPACT
Only Service Contracts writes `ServiceContract.status` and its audit events. No cross-domain data writes are introduced.

## STATE MACHINE IMPACT
`EXPIRING` and `EXPIRED` become scheduler-only targets. Manual paths retain workflow transitions through `ACTIVE`, cancellation/termination, while time classification owns `ACTIVE ↔ EXPIRING → EXPIRED`. Pre-effective states (`DRAFT`, `PROPOSAL`, `UNDER_REVIEW`, `PENDING_SIGNATURE`) and terminal states (`TERMINATED`, `RENEWED`, `CANCELLED`) are never overwritten by the expiry scheduler.

## FINANCIAL IMPACT
No amounts, formulas, VAT, payment status, or invoice contents change. Billing already includes both ACTIVE and EXPIRING and excludes EXPIRED; the corrected calendar-day expiry boundary prevents premature same-day exclusion.

## CURRENCY IMPACT
N/A — no currency field, conversion, grouping, or historical currency behavior changes.

## MALL/COMPANY IMPACT
No visibility or scope change. The scheduler already operates globally under its distributed lock; user-facing queries remain Mall-scoped.

## TENANT IMPACT
No tenant access change.

## AUTHORIZATION IMPACT
No role or Mall access expansion. The existing protected status endpoint additionally rejects the two automatic-only targets for every caller.

## REPORTING IMPACT
Service Contract status counts and export rows will reflect the corrected seven-day threshold after scheduler reconciliation. No financial report formula changes.

## TRANSACTION IMPACT
Each automatic status change updates the contract and inserts its audit event in one Prisma transaction. The update is conditional on the status observed by the scheduler, so it cannot overwrite a concurrent user transition such as termination. Reconciliation from prematurely EXPIRING back to ACTIVE uses the same guarded atomic pattern.

## EVENT/JOB IMPACT
The existing `service-contract-reminders` job remains distributed-lock protected. Its contract-expiry window changes from 31 to 7 calendar days; the independent 31-day payment-reminder scan remains unchanged. Notification daily deduplication remains unchanged.

## DOCUMENT IMPACT
N/A — no file or generated document behavior changes.

## API IMPACT
`PATCH /api/service-contracts/:id/status` returns HTTP 400 for requested `EXPIRING` or `EXPIRED`. Existing list/summary shapes remain compatible. A seven-day expiry count replaces the former 30-day meaning.

## MIGRATION
No schema migration. The scheduler reconciles eligible persisted statuses. Current development data contains no dated ACTIVE/EXPIRING/EXPIRED record requiring backfill; one legacy ACTIVE record has null dates and cannot be inferred without business-provided dates.

## BACKWARD COMPATIBILITY
Legacy null-date records remain readable and unchanged. Pre-effective and terminal workflow states are preserved regardless of dates. Existing API clients attempting manual time-state transitions now receive an intentional validation error.

## GOLDEN E2E SCENARIOS
Gate 1: date-window unit tests cover exactly 7 days, 8 days, end date, and day after; scheduler tests cover ACTIVE→EXPIRING, ACTIVE/EXPIRING→EXPIRED, and EXPIRING→ACTIVE; service/UI tests prove manual time targets are absent/rejected; frontend tests cover countdown and renew visibility. Gate 4: authenticated user sees automatic status and renewal action after scheduler reconciliation.

## RECONCILIATION
The scheduler query boundaries, summary count, list EXPIRING filter, UI seven-day caption, and countdown use the same seven-calendar-day definition. Billing ACTIVE/EXPIRING eligibility is checked but unchanged.

## ROLLBACK
Restore the old 31-day scheduler/query horizon and manual transition entries. No schema rollback is required; status audit events preserve what was automatically changed.

## OPEN BUSINESS QUESTIONS
None for this change. Renewal currently pre-fills the new start date with the old contract's end date; whether contractual periods are inclusive and should instead begin the following day is not changed here.

---

## Severity classification
Priority: P1 — Tier: 1. This changes persisted lifecycle automation and its UI/API authority but stays inside Service Contracts; Billing consumption is checked but not changed.

## Gate results
- Backend focused tests: PASS — 3 suites, 29 tests (`service-contract-expiry`, reminder scheduler, Service Contracts service), including the concurrent-transition guard.
- Frontend focused tests: PASS — 2 files, 12 tests (expiry presentation and Service Contracts page).
- Backend production build: PASS (`nest build`).
- Frontend production build: PASS (`tsc && vite build`); Rollup emitted only existing third-party annotation/chunk-size warnings.
- Browser E2E and a live scheduler execution were not run in this environment.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Request owner | User | 2026-09-05 | Approved seven-day automatic EXPIRING/EXPIRED states and removal of manual choices |
| Implementation agent | Codex | 2026-09-05 | Implemented; focused tests and both production builds passed |
