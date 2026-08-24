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
| 2+ | Remaining modules in dependency order | PENDING |
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
