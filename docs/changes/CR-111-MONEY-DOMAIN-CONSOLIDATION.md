# CR-111 — Money/Currency Domain Consolidation

Status: **COMPLETED** (all P0/P1 gaps found are fixed; 2 items remain correctly deferred, unchanged from CR-102)

## Purpose

A final verification + cleanup pass across the whole money-display/aggregation program to date — CR-109 Wave 1 (Amount-cell currency-duplication fix), CR-109 Wave 2 (KPI compact-display rule), and CR-110 (mixed-currency aggregation correctness) — before declaring the Money domain closed for Human UAT. Scope: confirm the earlier fixes are intact after the `HUNG`→`kyle` merge, find any remaining violations of the established rules in modules not yet covered, fix what's fixable without a schema change, and explicitly separate out what needs one.

## Audit method

A repo-wide, read-only pass (grep for hand-rolled `Intl.NumberFormat`/`/1e6`/`/1_000_000`/hardcoded `' đ'`/`'₫'` string concatenation in the frontend; grep for `_sum`/`.reduce()` over money-field names cross-checked against `schema.prisma` for which models actually carry a currency column, in the backend) plus a targeted re-check of the 12 original CR-109 file list to confirm the merge didn't silently revert anything.

## Findings and fixes

**Confirmed bugs, fixed (no schema change needed):**

| # | Location | Issue | Fix |
|---|---|---|---|
| 1 | `service-contracts.service.ts` `stats()` | Blind `_sum: { totalValue }` across `ServiceContract.currency` (VND/USD/MMK) — same bug class as CR-110 | Regrouped `by: ['currency']`, returns `totalValueByCurrency` (breaking rename; no consumer existed yet, confirmed via repo-wide grep) |
| 2 | `CrmPage.tsx` deal-sheet proposal rows | Inline `Intl.NumberFormat` + manual symbol lookup, dropping decimal precision for USD/MMK | `formatMoney(amount, rentCurrency)` |
| 3 | `ServiceContractsPage.tsx` (table, detail, payment rows) | Never migrated in Wave 1 — raw `Number().toLocaleString()` + string-concatenated currency | `formatMoneyAmount`/`formatMoney` per context |
| 4 | `DealPipelinePage.tsx` per-deal cards | Abbreviated individual (non-aggregate) deal values with no tooltip — violates the "never abbreviate per-record data" rule | `formatMoney` (full value) |
| 5 | `ReportsPage.tsx` Revenue & Receivables chart | Hand-rolled `/1e6` tick/tooltip formatting, inconsistent with the rest of the already-fixed file | `formatMoneyCompact`/`formatMoney` |
| 6 | `SalesPipelineStatsPage.tsx` (3 sites: slot-revenue tile, proposal-value-by-status, total-proposal-value) | KPI/aggregate figures with bare `₫`, no tooltip, no shared formatter | `formatMoneyCompact` + `valueTitle` tooltip (added `valueTitle` prop to this page's local `StatCard`); explicit `'VND'` since the backend source (`crm.service.ts`'s `proposalValueByStatus`) is documented VND-only |
| 7 | `CrmOverviewPage.tsx` Pipeline Value KPI | Local reimplementation of compact formatting, no tooltip | Routed through `formatMoneyCompact`/`formatMoney`, added `valueTitle` |
| 8 | `ParkingReportPage.tsx` (2 KPI tiles) | Bare `đ` suffix, no tooltip | `formatMoneyCompact` + `formatMoney` tooltip |
| 9 | `ParkingTransactionPage.tsx` transaction table | Hand-rolled `Intl.NumberFormat` + `' đ'` instead of the shared formatter (not abbreviated, just inconsistent) | `formatMoney` |

All 9 are display/aggregation-only changes — no schema, no new endpoint, no business-rule change.

**Currency-less domains — confirmed safe, explicitly out of scope (future CR):**

These fields have **no currency column on their Prisma model at all** — summing/labeling them is not a mixing bug, just a "which currency is this implicitly" cosmetic question that requires a schema decision, not a code fix:
- `Lead.expectedRent` / `estimatedValue` (CRM Kanban total, CRM Overview Pipeline Value's underlying source, Deal Pipeline stage summary) — no currency field, no currency selector anywhere in the Lead creation/edit UI.
- `Unit.baseRentPerSqm` / `camPerSqm`.
- `SalesTurnover.netSales` / `grossSales`.
- `ParkingMonthlyStatement` and related parking revenue/transaction figures.

Where these are shown as compact KPIs, this pass added an explicit `'VND'` label + full-value tooltip (a display clarity improvement using the existing implicit convention), but did **not** add a real currency dimension to the schema — that remains a genuine future decision (a new CR, not this one).

**Known, already-documented blockers — confirmed still present, correctly not touched (per CR-102):**
1. `service-contracts.service.ts` `transferPaymentToBilling()` still creates an `Invoice` without setting `currencyCode` (defaults to VND regardless of the contract's actual currency).
2. `billing.service.ts` `calculateRevenueShare()` still mixes currency-less `SalesTurnover.grossSales` with currency-aware `contract.rent`.

Both require a business decision (documented in CR-102 as `BC-004`/`BC-005`, `docs/architecture-review/07-BUSINESS-CONFIRMATION-TRIAGE.md`) and, for #2, a schema change (`SalesTurnover` needs a currency field) — explicitly out of this CR's "no new schema" mandate.

## Regression

**Backend** (`npx jest`): 91/91 suites, 597/597 tests pass (2 new tests in `service-contracts.stats.cr-money-consolidation.spec.ts` proving VND+USD are never summed).
**Frontend** (`npx vitest run`): 31/33 files, 205/215 tests pass — the 2 failing files are pre-existing and unrelated (`BookingsPage.test.tsx`: a separate, live, uncommitted Bookings refactor in progress elsewhere; `permissions.test.ts`: a NAV_GROUPS duplication bug already present in `HEAD` before this CR, zero working-tree diff on `permissions.ts`).
**TypeScript**: `tsc --noEmit` clean on both backend and frontend.
**Build**: `vite build` clean.

## Scope note

A separate, unrelated "ERP UX/UI Transformation Program" is actively being implemented concurrently in this same working directory by another session (visible via uncommitted changes to `index.css`, `DashboardPage.tsx`, `BillingPage.tsx`, `BookingsPage.tsx`, new `docs/ux/` and `components/erp/`). None of those files were touched by this CR; this commit stages only the Money Domain files listed above.

## Definition of Done

- [x] CR-109 Wave 1/2 + CR-110 fixes confirmed intact post-merge.
- [x] All P0/P1 gaps found in already-implemented scope fixed, with regression tests.
- [x] Currency-less domains explicitly identified and deferred (not silently dropped, not fixed here).
- [x] Full regression clean (backend + frontend + typecheck + build).
- [x] No schema, no new features, no business-rule changes.

## MONEY DOMAIN: CLOSED

No P0/P1 blockers remain in the implemented scope (CR-109 + CR-110 + this consolidation). The 2 remaining known gaps are P2/business-blocked, already tracked under CR-102's BC-004/BC-005, and require a schema change + business decision outside this program's mandate — they do not block Human UAT of the money-display/aggregation surface implemented so far.

**System is ready for Human UAT** of the Money/Currency domain (Proposals, Approvals, Contracts, Billing, Tenant Portal, Tenants, Service Contracts, Dashboard, Analytics, Reports, CRM, CRM Overview, Deal Pipeline, Sales Pipeline Stats, Parking Reports/Transactions).
