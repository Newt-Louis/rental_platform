# Golden ERP Program Tracker

Status: IN PROGRESS

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
| 4+ | Remaining modules in dependency order | PENDING |
| Platform verification | correctness, security, reconciliation, E2E, build | PENDING |

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
