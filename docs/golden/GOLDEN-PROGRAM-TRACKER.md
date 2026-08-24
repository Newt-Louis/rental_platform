# Golden ERP Program Tracker

Status: PROGRAM ASSESSMENT COMPLETE — PRODUCTION NOT READY

Baseline: `HUNG` at `a6a6bad25b907922b61934fdf0888bccbf7d6bc5`

## Protected working-tree manifest

The following pre-existing paths are excluded from program staging unless their owning phase explicitly authorizes them:

- `apps/frontend/src/pages/dashboard/DashboardPage.tsx`
- `apps/frontend/src/lib/currency.test.ts`
- `apps/frontend/src/locales/{en,vi}/deals.json`
- `apps/frontend/src/pages/approvals/ApprovalsPage.tsx`
- `apps/frontend/src/pages/proposals/*` current modified/untracked presentation files
- `docs/changes/CR-PROPOSAL-APPROVAL-CORRECTNESS-BACKLOG.md`
- `docs/ux/CR-GOLDEN-PROPOSAL-APPROVAL-*.md`

## Wave status

| Wave | Scope | Status |
|---|---|---|
| Baseline and canonical truth | Repository and governance reconstruction | COMPLETE |
| 1 | Golden Fitout presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 2 | CRM / Customer / Tenant presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 3 | Unit / Space Inventory presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 4 | Operations / Ticket / Maintenance presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 5 | Reporting / Statistics presentation | IMPLEMENTED — AUTHORIZATION + HUMAN REVIEW PENDING |
| 6 | Admin / Settings / Users / Permissions | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 7 | Golden Dashboard | AUDITED — PROTECTED CONCURRENT POLISH; RENDERED REVIEW PENDING |
| Platform verification | correctness, security, reconciliation, E2E, build | COMPLETE — 17/17 invariants and builds pass; full UAT/security/operations gates remain open |
| 8 | Supporting presentation consistency | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 9 | Golden/reference localization safety sweep | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 10 | Frontend baseline test remediation | COMPLETE — test assertions only; frontend 262/262 PASS |

## Wave 10 Change Request and Impact Map

Change ID: `CR-GOLDEN-W10-TEST-BASELINE`

Business reason: restore a truthful green frontend suite after confirmed UI
architecture and localized-copy changes made existing tests ambiguous or
obsolete. This wave changes test selectors/assertions only; production code is
not modified.

| Dimension | Impact |
|---|---|
| Primary domains | Frontend navigation test coverage and Golden Booking list test coverage |
| Runtime/business behavior | None; assertions are aligned to the currently approved rendered structure and locale copy |
| Data/state/workflow | No status, transition, action or source-of-truth change |
| Financial/currency | No amount, formatter, formula, precision or currency change |
| Mall/Tenant/authorization | Existing permissions remain unchanged; the test still proves every route module is reachable from navigation and every path is unique |
| API/backend/schema/database | No change |
| Tests | Replace ambiguous global text lookups with row/dialog-scoped queries; recognize two distinct AI navigation paths sharing one permission module |
| Golden scenarios | Preserve the approved Booking cancel/delete interactions and current navigation coverage |
| Rollback | Revert the test-only checkpoint; no runtime or persisted data affected |
| Open questions | None |

## Wave 10 technical gate — 2026-08-24

Checkpoint: `a310df4 test(frontend): close Golden ERP baseline failures`

- `permissions.test.ts` now verifies every permission module is represented and
  every navigation path is unique, while correctly allowing `/ai` and
  `/ai/codebase` to share the same authoritative permission module.
- `BookingsPage.test.tsx` now scopes repeated labels to their row/dialog,
  follows the existing mandatory cancellation-reason flow, and asserts the
  current localized delete action. Production Booking code was not changed.
- Focused frontend: PASS, 2 files / 46 tests.
- Frontend full: PASS, 44 files / 262 tests. The previously classified ten
  baseline failures are closed with no skipped/disabled tests.
- Frontend TypeScript and production build: PASS. `git diff --check`: PASS.
- Backend, Docker and database behavior are unchanged from the passing Wave 9
  gate; no rebuild or data mutation was required for this test-only wave.
- Business logic/API/backend/schema/database/financial/currency changes: NO.

## Wave 9 Change Request and Impact Map

Change ID: `CR-GOLDEN-W9-LOCALIZATION-SAFETY`

Business reason: close remaining confirmed cases where otherwise-approved
Booking/Billing/reference surfaces expose backend role or workflow codes to
operators, without reopening their architecture or changing business behavior.

Current behavior: development login accounts, Ticket staff selection and Sales
audit show raw role codes; Booking detail shows raw Lead/Proposal/activity
values; Billing schedule/service-contract rows show raw status/type values.

Expected behavior: each known enum uses the existing authoritative locale map
or the shared enum-presentation mapper, with the raw code retained only in a
`title` attribute for traceability and a neutral fallback for future values.

| Dimension | Impact |
|---|---|
| Primary domains | Authentication presentation, Booking, Billing, Ticket and Sales presentation |
| Journeys | GS-01, GS-03, GS-06, GS-07 and staff support/audit reads |
| Upstream/downstream | Existing API enums remain inputs; no payload, persistence, navigation or downstream output changes |
| Data/state/workflow | No status comparison, transition or source-of-truth change |
| Financial/currency | No amount, formatter, formula, precision or currency change |
| Mall/Tenant/authorization | No route, permission, role capability, query scope or action visibility change |
| Transaction/event/job/document | N/A — presentation reads only |
| API/schema/database/migration | No change; backward compatible |
| Tests | Extend pure enum-mapping coverage and run Booking/Billing/Ticket focused plus full frontend/backend/build gates |
| Golden scenarios | Preserve GS-01, GS-03, GS-06, GS-07 and GS-09 through GS-15 |
| Reconciliation | No value changes; rerun the 17 read-only platform invariants |
| Rollback | Revert the Wave 9 presentation commit; no persisted data affected |
| Open questions | None; unknown future values receive no invented business label |

Approval boundary: this is the P3 localization cleanup explicitly allowed by
the master program. Golden architecture and all Tier 0/Tier 1 semantics remain
closed to change.

## Wave 9 technical gate — 2026-08-24

Checkpoint: `ad576bb fix(i18n): localize remaining ERP workflow codes`

- Login development accounts, Ticket staff selection and Sales audit now use
  the shared localized role mapper; unknown future roles receive the neutral
  localized fallback.
- Booking detail localizes Lead and linked-Proposal states plus all eight
  existing activity types. Billing localizes schedule-entry states and invoice
  types using existing authoritative locale namespaces. Raw codes remain only
  in traceability `title` attributes.
- Frontend focused: PASS, 6 files / 62 tests. Frontend TypeScript and production
  build: PASS.
- Frontend full: 252/262; the same ten pre-program failures remain (one
  permission navigation invariant plus nine legacy Booking assertions). No
  Wave 9 regression was identified.
- Backend full: PASS, 91 suites / 598 tests. Backend production build: PASS.
- Database invariants: PASS, 17/17 clean. Backup/restore safety guards: PASS,
  4/4. `git diff --check`: PASS.
- Docker rebuild: PASS; current frontend/backend images rebuilt, all four
  services healthy, and localhost frontend/backend returned HTTP 200.
  Pre-existing UAT orphan containers were reported and deliberately retained.
- Automated rendered verification: UNAVAILABLE. Browser discovery returned no
  available instance after the required troubleshooting check; responsive or
  visual PASS is not claimed.
- Business logic/API/backend/schema/database/financial/currency changes: NO.

## Wave 8 Change Request and Impact Map

Change ID: `CR-GOLDEN-W8-SUPPORTING-PRESENTATION`

Business reason: complete the presentation audit on reachable supporting
surfaces that still expose raw backend enums or a decorative integration hero,
so operators receive consistent ERP terminology without changing the facts or
actions owned by those modules.

Current behavior: Profile/Audit display raw role codes; SAP reconciliation,
Reports invoice breakdown and Service Contract type controls expose raw enum
values; Parking has a raw status fallback; SAP uses a marketing-style gradient
hero inconsistent with the approved ERP shell.

Expected behavior: known authoritative enum values are mapped to localized
labels, unknown values retain a neutral explicit fallback for traceability, and
SAP uses the existing shared `PageHeader`/`ERPToolbar` presentation pattern.

| Dimension | Impact |
|---|---|
| Primary domains | Administration/Audit, Integration, Reporting, Service Contracts and Parking presentation only |
| Affected journeys | Supporting reads around GS-06 through GS-10; no primary handoff or write changes |
| Upstream/downstream | Existing API responses remain the only input; no output data, export, event or downstream consumer changes |
| Data ownership | Read-only presentation mapping; no entity write changes |
| State machine | Existing role, invoice, reconciliation, contract and parking enum values remain unchanged |
| Financial/currency | No amount, formula, precision, aggregation or currency formatter change |
| Mall/Tenant/authorization | No route, role, query or action visibility change; backend remains authoritative |
| Reporting | Invoice-type labels only; report formula and VND-only scope unchanged |
| Transaction/event/job/document | N/A — no mutation path or artifact payload changes |
| API/schema/database/migration | No change; backward compatible |
| Golden scenarios | Preserve GS-06 through GS-10 and GS-11 through GS-15; focused presentation tests plus full frontend/build gate |
| Reconciliation | No duplicated values changed; rerun the 17 read-only platform invariants after implementation |
| Rollback | Revert the Wave 8 presentation commit; persisted data is unaffected |
| Open business questions | None introduced. Unknown future enum values are not assigned invented semantics |

Approval boundary: the master program authorizes presentation standardization.
No Tier 0/Tier 1 behavior, authorization or financial semantics are included.

## Wave 8 technical gate — 2026-08-24

- Profile and Audit role codes, SAP sync/reconciliation states, Reports invoice
  types and Service Contract types now use one shared locale-key mapper with a
  neutral unknown-value fallback; backend enum values remain visible only as
  traceability titles.
- SAP now uses the shared ERP `PageHeader` and `ERPToolbar`, with a compact
  divided attention strip instead of the decorative gradient/card hero.
- Frontend focused: PASS, 3 files / 7 tests.
- Frontend full: 251/261; the same ten pre-program failures remain (one
  permission navigation invariant plus nine legacy Booking assertions). No
  Wave 8 regression was identified.
- Backend full: PASS, 91 suites / 598 tests. Frontend TypeScript/production
  build and backend production build: PASS.
- Database invariants: PASS, 17/17 clean. Backup/restore safety guards: PASS,
  4/4.
- Docker rebuild: PASS; current frontend/backend images rebuilt, four services
  running and localhost frontend/backend returned HTTP 200. Pre-existing UAT
  orphan containers were reported and deliberately retained.
- Automated rendered verification: UNAVAILABLE. Browser discovery returned no
  available instances after the required troubleshooting check; responsive or
  visual PASS is not claimed.
- Business logic/API/backend/schema/database/currency changes: NO.

## Wave 1 Change Request and Impact Map

Business objective: turn the existing Fitout surface into a dense, localized ERP operational workspace while preserving the implemented Fitout pipeline and all business behavior.

In scope:

- Fitout frontend page composition, density, responsive behavior and localized presentation.
- Existing-route navigation and existing-action hierarchy.
- Presentation-only mapping of raw status/workflow enums.
- Focused frontend tests and locale updates.

Out of scope:

- Backend controllers/services, API contracts, Prisma schema/migrations and database.
- Stage definitions, transition/gate rules, override roles, checklist semantics, Unit synchronization, financial calculations and authorization.
- Dashboard, Booking, Billing, Contract and active Proposal/Approval changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Contract activation creates Fitout Project; unchanged |
| Downstream | `OPENED` synchronizes Unit occupancy in backend; unchanged |
| Financial/currency | Change/risk money semantics are not altered; provenance remains UNKNOWN |
| Mall/Tenant | Existing API/query scope unchanged; UI role visibility remains presentation only |
| Events/jobs | No event or job change |
| Concurrency/idempotency | Existing backend transition transaction and idempotency unchanged |
| API/schema/database | No change |
| Protected modules | Explicitly excluded by manifest above |

Golden scenarios to preserve: GS05, GS08, GS09, GS10 and cross-Mall GS11-GS15.

Unknowns: Fitout change-order currency provenance; any business desire to make checklist/issues stage gates. Both are quarantined and cannot be inferred in Wave 1.

Visual verification: `AUTOMATED VISUAL VERIFICATION: UNAVAILABLE`. The configured browser runtime reported no available browser instances on 2026-08-24. Responsive PASS is not claimed; human rendered review remains required.

Approval boundary: the user's master execution authorization permits this presentation wave. Tier 0/Tier 1 behavior remains non-self-approved and will be reported or quarantined.

## Wave 1 technical gate — 2026-08-24

- Frontend Fitout + currency focused: PASS, 8 tests.
- Backend Fitout focused: PASS, 5 suites / 44 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript + production build: PASS.
- `git diff --check`: PASS.
- Docker build: PASS; localhost frontend and backend health endpoints returned HTTP 200.
- Frontend full: BASELINE FAILURES outside Fitout — `permissions.test.ts` navigation duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. Fitout focused tests passed within the same run; protected Booking/navigation work was not modified.
- Automated rendered viewport review: UNAVAILABLE (no browser instance). Human visual gate remains open, so Wave 1 is not yet declared Golden.
- Business logic/API contract/backend/schema/database changes: NO. The frontend adapter now preserves an already-existing `FitoutChangeOrder.currency` response field and passes the optional existing DTO field on create; no endpoint shape changed.

## Wave 2 Change Request and Impact Map

Business objective: make CRM, Customer/Tenant master data and the Tenant Portal read as one dense ERP handoff from prospect to operating tenant, while preserving the approved Booking/Proposal/Contract chain and all authoritative state transitions.

In scope:

- CRM, CRM overview, Tenant master and Tenant Portal frontend information hierarchy, density, responsive behavior and localized presentation.
- Presentation-only mapping of existing statuses, priorities, lease-term types and workflow labels.
- Exact-money presentation through the existing shared currency formatter where an authoritative currency is available.
- Focused frontend presentation tests and locale updates.

Out of scope:

- Lead, Customer or Tenant lifecycle/business rules; Booking/Proposal/Contract handoff semantics.
- Backend controllers/services, API contracts, Prisma schema/migrations and database.
- Resolving global Customer ownership or adding Mall scope to `Customer`.
- Inventing currency provenance for Lead estimates, FX, aggregation across currencies, or changing financial calculations.
- Dashboard and protected Booking/Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Lead is the entry point; existing import/manual-create and mall association remain unchanged |
| Downstream | Booking/Proposal reference Lead/Customer and Proposal snapshots commercial terms; unchanged |
| Financial/currency | `Lead.expectedRent`/`estimatedValue` have no currency field; current backend documents them as VND while BC-001 remains open. No mixed-currency inference or formula change is authorized |
| Mall/Tenant | Lead routes are Mall-scoped. `Customer` has no `mallId` and global ownership is an open business decision (BC-016); no UI-only security fiction will be introduced. Tenant Portal continues to rely on server-forced `currentUser.tenantId` |
| Events/jobs | CRM follow-up reminder job and notifications are unchanged |
| Concurrency/idempotency | Existing Lead/Customer synchronization and Booking/Proposal transaction behavior remain unchanged |
| API/schema/database | No change |
| Protected modules | Dashboard, Booking and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-01, GS-03, GS-09, GS-10 and GS-11 through GS-15.

Unknowns: BC-001 (whether Lead estimates can ever be non-VND) and BC-016 (whether Customer is intentionally global) remain `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. They are tracked, not guessed or silently fixed in Wave 2.

Approval boundary: the user's master execution authorization permits this presentation wave. Tier 0 currency semantics and Tier 1 authorization/data-ownership changes remain non-self-approved and are excluded.

## Wave 2 technical gate — 2026-08-24

- Frontend CRM / Tenant Portal / currency focused: PASS, 3 files / 9 tests.
- Backend CRM / Customer / Tenant focused: PASS, 4 suites / 16 tests.
- TypeScript + production build: PASS.
- `git diff --check`: PASS.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. CRM focused, Tenant Portal presentation and currency tests passed in the same full run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive PASS is not claimed.
- Reconciliation: CRM Lead values remain exact documented VND; Tenant Portal pending invoice totals are separated by persisted ISO currency with no mixed-currency sum or FX.
- Authorization: Lead and Tenant controller paths verified; CRM unified deals remains a confirmed Tier 1 gap and Customer Mall ownership remains BC-016. Neither was silently changed.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 4 Change Request and Impact Map

Business objective: consolidate Ticket, scheduled Maintenance, Work Order and Patrol into dense ERP operations worklists whose priorities, authoritative statuses and allowed actions are immediately legible, without changing any operational workflow or system-of-record behavior.

In scope:

- Presentation hierarchy, density, responsive composition and localization for Ticket, the Ticket Maintenance tab, Work Order and Patrol frontend surfaces.
- Presentation-only mapping of existing Ticket, Work Order, Patrol Shift and Patrol Check enums.
- Reuse of the existing ERP page header and toolbar components; preserve the established Ticket worklist/detail architecture.
- Focused frontend presentation tests and locale resources.

Out of scope:

- Ticket, Maintenance, Work Order or Patrol transition rules, SLA calculations, scheduling/execution semantics, QR/geofence validation and abnormal-check automation.
- Backend controllers/services, API contracts, authorization policy, Prisma schema/migrations and database.
- Known Ticket tenant-isolation gaps on escalation/rating/SLA-policy paths; these remain a Tier 1 correctness quarantine.
- Service Contract currency/invoice-transfer correctness, Announcements, Inventory, Parking, Dashboard and protected Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Tenant/staff creates Ticket; operations schedules Maintenance, Work Orders and Patrol Shifts through existing routes; unchanged |
| Downstream | Ticket SLA escalation remains job-driven. An abnormal Patrol Check may create one Security Work Order through the existing backend path; unchanged |
| Financial/currency | No money or currency field is displayed or calculated by the in-scope operational worklists |
| Mall/Tenant | Main Ticket, Work Order and Patrol paths remain Mall-scoped. Confirmed Ticket isolation gaps on three secondary paths are not hidden or treated as UI-secured |
| Events/jobs | Ticket SLA cron, Maintenance reminder/execution jobs and Patrol-to-Work-Order automation are unchanged |
| Concurrency/idempotency | Existing Patrol abnormal-check idempotency and separate Work Order status/audit writes are preserved; no new client-side transition semantics |
| API/schema/database | No change |
| Protected modules | Dashboard, Booking and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-09 (cross-Mall access), GS-10 (Tenant isolation) and GS-15 (retry/idempotency), subject to the already-recorded Ticket secondary-endpoint gap.

Unknowns: BC-020 (authoritative ownership for Ticket escalation/rating/SLA-policy reads) remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. XMOD-007 (transaction boundary for an abnormal Patrol Check and its generated Work Order) remains unverified and quarantined. Neither is inferred in Wave 4.

Approval boundary: the user's master execution authorization permits presentation work. Workflow, authorization, operational automation and transaction-boundary changes are Tier 1 boundaries and remain unchanged.

## Wave 3 Change Request and Impact Map

Business objective: turn the existing Space surface into a dense inventory cockpit where availability, physical hierarchy, authoritative Unit status and current commercial context are immediately legible, without altering the Unit lifecycle or leasing eligibility.

In scope:

- Space inventory header, view controls, filter density, Unit grid/detail hierarchy and localized presentation.
- Presentation-only localization of Unit, Booking, Proposal and Contract statuses already returned by existing APIs.
- Exact display of the existing Unit VND rate-card fields; no abbreviations or symbol-only ambiguity.
- Focused frontend presentation tests and locale updates.

Out of scope:

- `UnitStatusService`, transition matrix, Booking eligibility/queue rules, Contract/Fitout side effects and merge/split behavior.
- Slot allocation, SlotBooking concurrency, slot-pricing currency design or any short-term pricing formula.
- Backend controllers/services, API contracts, Prisma schema/migrations and database.
- Dashboard, Booking and protected Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Mall → Floor/Zone defines Unit ownership and physical hierarchy; unchanged |
| Downstream | Booking locks Unit; Proposal/Contract commit Unit; Fitout advances Unit to `UNDER_FITOUT`/`OCCUPIED`; unchanged |
| Financial/currency | Unit base rent/CAM fields have no currency field and existing UI/backend treat the rate card as VND. Wave 3 only makes VND explicit and exact; it does not propagate Unit rates as authoritative contract currency |
| Mall/Tenant | Current Unit list/detail/mutation routes enforce Mall access after CR-101; frontend visibility remains non-authoritative |
| Events/jobs | Contract/Fitout/Booking status side effects and occupancy readers are unchanged |
| Concurrency/idempotency | Shared status transitions remain centralized; merge/split bypass and slot concurrency findings are not modified |
| API/schema/database | No change |
| Protected modules | Dashboard, Booking and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-01, GS-02, GS-04, GS-05, GS-07, GS-08 and GS-09 through GS-15.

Unknowns: BC-010 (whether `MERGED` was deliberately excluded from the shared transition matrix) remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. Unit-slot currency provenance and slot allocation concurrency remain separately quarantined.

Approval boundary: the user's master execution authorization permits presentation work. Unit lifecycle, eligibility, financial semantics and authorization behavior are Tier 0/Tier 1 boundaries and remain unchanged.

## Wave 3 technical gate — 2026-08-24

- Frontend Unit/Space presentation and form-safety focused: PASS, 2 files / 8 tests.
- Backend Unit status, authorization, CRUD, hierarchy, map and merge/split focused: PASS, 8 suites / 77 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript, frontend production build and backend production build: PASS.
- Docker/runtime: PASS; rebuilt current compose frontend/backend dependency chain, all four services healthy, `http://localhost:8080/` and `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. Space focused tests passed in the same run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Reconciliation: Unit rate-card fields remain existing implicit-VND data and are now presented exact with explicit `VND`; Proposal/Contract values continue using their persisted currency. Slot pricing remains unclassified and is not combined or relabeled.
- Authorization: current Unit/Floor/Zone/map paths remain backend-scoped and focused authorization tests pass; no frontend role check is treated as security.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 4 technical gate — 2026-08-24

- Frontend Work Order behavior and Operations presentation focused: PASS, 2 files / 6 tests.
- Backend Ticket/Maintenance and Work Order role-scope focused: PASS, 2 suites / 18 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript, frontend production build and backend production build: PASS.
- Docker/runtime: PASS; rebuilt the current compose dependency chain, all four services are healthy, and `http://localhost:8080/` plus `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. All Wave 4 focused tests passed in the same full run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Reconciliation: Ticket, Maintenance, Work Order and Patrol surfaces contain no financial fields. Existing status/action transitions and Patrol-to-Work-Order automation remain backend-authoritative and unchanged.
- Authorization: core paths remain server-scoped; the known Ticket secondary-endpoint Tenant gap remains explicitly quarantined and is not presented as secured by UI.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 5 Change Request and Impact Map

Business objective: make Reports and Analytics a dense, decision-oriented management workspace with explicit financial units, exact monetary detail and localized analytical labels, while preserving every current formula and refusing to represent the remaining unscoped Compliance-export paths as Golden-secure.

In scope:

- Reports and Analytics frontend hierarchy, density, responsive composition and localized presentation.
- Exact financial display with ISO currency; chart axes may use a declared scale while tooltips remain exact.
- Presentation-only status/risk/lease-term labels and visibility alignment for the existing CEO/ADMIN cross-Mall capability.
- Focused frontend presentation and currency tests.

Out of scope:

- Revenue, collection, occupancy, risk, compliance or AR-aging formula changes and formula consolidation.
- Compliance export/list/generate/manual-monthly authorization remediation; the remaining exposure is Tier 1 and requires the governance review chain before implementation.
- Backend controllers/services, API contracts, schema/migrations, database, jobs and persisted analytics snapshots.
- Dashboard, Sales, Billing and protected Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Reports/Analytics read CRM, Proposal, Contract, Invoice/Payment, Unit and audit data directly; no source writes are introduced |
| Downstream | CSV/compliance exports and management decisions consume these views; export payloads and formulas remain unchanged |
| Financial/currency | Revenue/receivables endpoints are explicitly VND-scoped and silently exclude non-VND records. Pipeline and renewal-risk values are already separated by persisted currency. Wave 5 will disclose these semantics and never combine currencies |
| Mall/Tenant | CR-101 Phase 3G now scopes core Reports and Analytics reads through `MallAccessService` and accessible Mall ID sets. Analytics Compliance export list/request/generate/manual-monthly paths still do not resolve or validate Mall ownership; this narrower Tier 1 gap prevents full closure |
| Events/jobs | Occupancy snapshot, renewal-risk and compliance scheduler behavior is unchanged; the dead duplicate analytics expiry scheduler remains unregistered |
| Concurrency/idempotency | Read-side presentation only; existing SchedulerLock/job-ledger behavior and per-item failure gaps are unchanged |
| API/schema/database | No change |
| Protected modules | Dashboard and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-09 (cross-Mall authorization), GS-10 (Tenant isolation), GS-11 through GS-14 (currency), and GS-15 (retry/idempotency). GS-09 passes for the focused core Report/Analytics reads and remains blocked for the Compliance-export sub-surface.

Unknowns: authoritative ownership/role policy for Compliance exports remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`; UI presentation will not be treated as authorization. Metric formula ownership also remains unresolved and no formula is selected as canonical in Wave 5.

Approval boundary: the user's master authorization permits presentation work. Mall-scope remediation and shared financial-formula ownership cross Tier 0/Tier 1 boundaries and are not self-approved.

## Wave 5 technical gate — 2026-08-24

- Frontend Reporting presentation and currency focused: PASS, 2 files / 5 tests.
- Backend Reports/Analytics scope, currency and breakdown focused: PASS, 6 suites / 29 tests.
- Backend full: PASS, 91 suites / 598 tests (same backend working tree; no Wave 5 backend changes).
- TypeScript and frontend production build: PASS.
- Docker/runtime: PASS; rebuilt the current frontend/backend dependency chain, all four services are healthy, and `http://localhost:8080/` plus `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. Reporting/currency focused tests passed.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Financial reconciliation: VND-only revenue/receivables scope is disclosed; chart axes declare `Tỷ VND`; tooltips, KPI values and per-currency pipeline/risk values are exact and use ISO currency. No FX, mixed-currency sum or formula change was introduced.
- Authorization: core Reports/Analytics Mall scope is verified under CR-101 Phase 3G. Analytics Compliance export list/request/generate/manual-monthly remains a Tier 1 quarantine, so Wave 5 is not Golden Closed.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 6 Change Request and Impact Map

Business objective: standardize Admin, Settings, Users and Permissions as a dense ERP control workspace where account state, role and authoritative Mall scope are immediately legible, without changing any authorization policy or access-control behavior.

In scope:

- Admin workspace header/navigation hierarchy, account worklist density, compact account summary and Mall-access presentation.
- Presentation-only localization of the existing role and account-access values returned by current APIs.
- Reuse of the established ERP page header/toolbar and existing UI components; focused presentation tests and locale resources.
- Read-only verification that frontend actions correspond to existing ADMIN-restricted backend routes.

Out of scope:

- Role definitions, `ROUTE_PERMISSIONS`, backend `@Roles` metadata, `MallAccessGuard`, UserMallAccess grant rules or any authorization-policy change.
- User/account lifecycle semantics, password policy, approval-policy behavior, Mall/space master-data behavior and system-health semantics.
- Backend controllers/services, API contracts, Prisma schema/migrations, database, jobs and audit behavior.
- The known concurrent `permissions.test.ts` change and all protected Dashboard/Proposal/Approval worktree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Users, roles, Malls and UserMallAccess grants are read from existing Users/Spaces/MallAccess APIs; unchanged |
| Downstream | Route navigation and backend guards consume the role/access model. The presentation will not write or duplicate a new permission model |
| Financial/currency | No financial amount, currency field, calculation or export is in scope |
| Mall/Tenant | UserMallAccess is the authoritative staff-to-Mall scope. ADMIN/CEO/TENANT bypass semantics and Tenant service-layer isolation remain unchanged and will not be represented as a frontend security guarantee |
| Authorization | Users CRUD and grant/revoke endpoints are ADMIN-only. The matrix remains read-only and sourced from current frontend route configuration; backend remains authoritative |
| State machine | Existing active/locked account state and approval-policy behavior are unchanged |
| Events/jobs | No event, queue, cron, health polling contract or audit-log behavior changes |
| Concurrency/idempotency | Existing grant upsert/revoke and account-write behavior remain unchanged; no new writes are introduced |
| API/schema/database | No change |
| Protected modules | Dashboard and active Proposal/Approval paths, plus the concurrent permissions test, remain excluded |

Golden scenarios to preserve: GS-09 (cross-Mall denial), GS-10 (Tenant isolation) and the role-specific entry points exercised by the permanent GS-01 through GS-08 journey baseline. No financial reconciliation is required because Wave 6 displays no money.

Unknowns: the documented CEO capability contradictions and any future editable permission-policy model remain `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. Wave 6 will neither normalize nor expand those capabilities.

Approval boundary: the user authorized presentation standardization. Authorization and role semantics are Tier 0; no Tier 0 implementation is self-approved or included in this wave.

## Wave 6 technical gate — 2026-08-24

- Frontend Admin presentation, Mall-access display, System health and Approval-policy focused: PASS, 5 files / 20 tests.
- Backend Users/UserMallAccess focused: PASS, 2 suites / 17 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript and frontend production build: PASS.
- Docker/runtime: PASS; rebuilt the current frontend/backend dependency chain and verified `http://localhost:8080/` plus `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. All Wave 6 focused tests passed in the same run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Authorization: Users CRUD remains ADMIN-only; UserMallAccess service validation and grantable-role restrictions remain unchanged. The permission matrix is explicitly read-only and frontend presentation is not treated as security.
- Reconciliation: no financial or currency values are present in the Wave 6 surface. Account role/state and Mall scope are presented from their existing authoritative fields without new semantics.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 7 protected Dashboard audit — 2026-08-24

Decision: Dashboard is an existing Golden surface with an active, pre-existing minor-polish diff. Wave 7 is therefore read-only: no Dashboard application, locale or test file is modified or staged by this program checkpoint.

Audit findings:

- Financial strip values remain exact and explicitly labeled `VND`; no compact financial transaction value is used.
- Financial chart axes declare their scale (`Đơn vị: Tỷ VND`) while exact tooltips use ISO currency.
- Action Center derives counts and overdue amount from the existing Dashboard payload and navigates only to existing routes.
- `healthScore` provenance is confirmed as the private, role-dependent `DashboardService.healthScoreForRole()` composite. It has no approved business-KPI definition and is correctly presented only as a secondary reference composite indicator with methodology/disclaimer—not authoritative portfolio health.
- Main Dashboard reads resolve requested or accessible Mall scope inside `DashboardService`; the dedicated cross-Mall endpoint remains restricted to `MODULE_ROLES.crossMall` (`ADMIN`, `CEO`).
- Dashboard financial data remains explicitly VND-scoped. This avoids mixed-currency arithmetic but excludes USD/MMK rather than converting them; that platform limitation remains disclosed and unchanged.
- Revenue/collection and occupancy formulas remain duplicated across Dashboard/Reports/Analytics/AI. No formula was selected or rewritten under this presentation program.

Technical evidence:

- Frontend Dashboard focused: PASS, 1 file / 3 tests.
- Backend Dashboard focused: PASS, 1 suite / 4 tests.
- Backend full, TypeScript, production build, Docker and localhost results are shared with the immediately preceding Wave 6 gate and remain PASS on the same working tree.
- Frontend full retains the same 10 unrelated baseline failures; Dashboard focused tests pass in that run.
- `git diff --check`: PASS.
- Automated rendered viewport review: UNAVAILABLE. The protected minor-polish diff is not staged and responsive/visual PASS is not claimed.

Business logic/API contract/backend/schema/database changes by Wave 7: NO.
