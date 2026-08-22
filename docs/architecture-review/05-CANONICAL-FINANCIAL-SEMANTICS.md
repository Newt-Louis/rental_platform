# 05 — Canonical Financial Semantics Review

Comparison matrix for the three metrics found duplicated across the platform (`docs/system-truth/13-REPORTING-DEFINITIONS.md`). This document does not refactor anything — it establishes which implementations are IDENTICAL, SEMANTICALLY EQUIVALENT, INTENTIONALLY DIFFERENT, CONTRADICTORY, or UNKNOWN, and recommends an authoritative owner for each metric.

**Correction record (2026-08-21, during CR-102's Step 6 bypass search — not a silent edit, individual rows below are marked inline).** This document originally claimed `reports.service.ts`'s two revenue reports and `analytics/{compliance,occupancy-analytics}.service.ts`'s aggregates were "not currency-filtered." Fresh reads during CR-102 found all four **already carry explicit `currencyCode: 'VND'` filters** with code comments referencing the multi-currency architecture — the original claim was inaccurate. This does **not** change the CONTRADICTORY classification below (which is about disagreement on what "collected revenue" *means* — face-value vs. payments-received vs. raw subtotal — a separate question from currency-safety), only the currency-behavior column for the affected rows.

## Outstanding / Collected Revenue

| Module | Function | Formula | Date basis | Status filter | Mall filter | Tenant filter | Currency behavior | Consumer |
|---|---|---|---|---|---|---|---|---|
| Billing | `financials()` (private helper) | `max(0,total+adjustment) - max(0,grossPaid-refunded)` | Invoice-level, no date range | N/A (per-invoice) | Via caller's `mallIds` | Via caller's `tenantId` | Per-invoice currency, correct in isolation | Multiple internal call sites |
| Billing | `recomputeInvoiceStatusFromPayments` (inline) | Same shape as above | Same | N/A | Same | Same | Same | Invoice status transitions |
| Billing | `syncSourceReceivable` (inline) | Same shape | Same | N/A | Same | Same | Same | Parking/ServiceContracts write-back |
| Billing | `ar-dunning.service.ts` | Same shape, independently coded | Same | Overdue only | Via caller | Via caller | Same | Dunning notices |
| Billing | `penalty-interest.service.ts` | Same shape, independently coded | Same | Overdue only | Via caller | Via caller | **Confirmed gap** — new invoice created with no `currencyCode` set | Penalty invoice creation |
| Billing | `collection-kpi.service.ts` | `adjustmentAmount + refundedAmount` used directly (not via `financials()`) | Period-scoped | All statuses in period | VND-filtered explicitly | N/A (aggregate) | VND-only (explicit filter) | Collection KPI dashboard widget |
| Dashboard | `buildDashboard()` | Own `invoice.findMany` + reduce, `Math.min(100,...)` clamp | Current period | PAID/PARTIALLY_PAID | Enforced (correctly) | N/A (aggregate) | VND-scoped | Main dashboard |
| Dashboard | `getCrossMallDashboard()` | **Different from `buildDashboard()`** — counts face-value `totalAmount` of PAID/PARTIALLY_PAID, not payments-received sum | Current period | PAID/PARTIALLY_PAID | N/A (cross-mall by design) | N/A | VND-scoped | Cross-Mall dashboard |
| Reports | `revenueReport()` | Own reduce, status `'PAID'` face-value | Monthly | PAID only | Not re-verified this session | N/A | **Correction (2026-08-21, CR-102 bypass search): `currencyCode: 'VND'` explicitly filtered** (`reports.service.ts:134`), contradicting this row's original "not verified" placeholder | Revenue report |
| Reports | `revenueReceivablesReport()` | Own `collected()` helper — payments minus reversed | Period-scoped | All | Not re-verified this session | N/A | **Correction (2026-08-21): `currencyCode: 'VND'` explicitly filtered** (`reports.service.ts:202`) | AR/receivables report |
| Analytics | `ComplianceService.getMultiMallComparison()` | `invoice.aggregate({_sum:{subtotal}})` | Monthly | Not filtered by status | N/A (cross-mall) | N/A | **Correction (2026-08-21, CR-102 bypass search): `currencyCode: 'VND'` explicitly filtered** (`compliance.service.ts:207`) — original "Not currency-filtered" claim was wrong | Multi-mall KPI comparison |
| Analytics | `OccupancyAnalyticsService.takeMonthlySnapshot()` | Same `_sum:{subtotal}` pattern, independently coded | Monthly | Not filtered | Per-mall | N/A | **Correction (2026-08-21): `currencyCode: 'VND'` explicitly filtered** (`occupancy-analytics.service.ts:280`) — original claim was wrong | Persisted occupancy snapshots |
| AI | `buildContext()` | Own `invoice.aggregate`/reduce | Ad hoc (chat-triggered) | Overdue only (for the overdue-sum context) | **Not scoped at all (Mall)** | N/A | **Correction (2026-08-21): `currencyCode: 'VND'` explicitly filtered** (`ai.service.ts:187-188`) — currency is fine, the real gap here is Mall-scoping only (tracked under `AUTH-01`, not `CUR-01`) | Chat assistant context |

**Classification: CONTRADICTORY.** These are not merely different implementations of the same idea (which would be SEMANTICALLY EQUIVALENT if they agreed on inputs) — they disagree on **what "collected revenue" means**: face-value of PAID-status invoices (Dashboard's cross-mall view, Reports' `revenueReport`) versus actual payments-received-minus-reversed (Dashboard's main view, Reports' `revenueReceivablesReport`) versus raw pre-tax `subtotal` regardless of payment status (Compliance, Occupancy-snapshot). These three definitions can and will produce materially different numbers for the same period/mall, not just cosmetically different rounding.

**Recommended authoritative owner**: `BillingService` should own a single `getCollectedRevenue(scope)` method implementing the "actual payments received, minus reversed" definition (the most financially correct one — it reflects real cash, not invoiced-but-possibly-unpaid amounts), currency-bucketed per the architectural principle in `04-FINANCIAL-CURRENCY-ARCHITECTURE.md`. All 7 reimplementing consumers should call it. This mirrors the one already-correct pattern in the codebase: Reports' `arAgingReport()` calling `billingService.getArAging()`.

## Occupancy Rate

| Module | Function | Formula | Date basis | Mall filter | Currency dependency | Consumer |
|---|---|---|---|---|---|---|
| Dashboard | `buildDashboard()` | `occupiedArea/totalArea × 100`, own `unit.findMany` + reduce | Current snapshot | Enforced | None (area-based, not money) | Main dashboard |
| Reports | (via `occupancyByLeaseTerm`) | Same shape, independently coded | Current snapshot | Not verified this session | None | Occupancy report |
| Analytics | `OccupancyAnalyticsService.getOccupancyV2()` | Most complete: includes `effectiveOccupancy`, `totalMonthlyBillingRevenue`, per-floor `avgRentPerSqm` | Current snapshot + historical via `OccupancySnapshot` | Enforced | Revenue sub-metric only | **Never called by the other 4** |
| Analytics | `ComplianceService.getMultiMallComparison()` | Same base shape, independently coded | Current snapshot | N/A (cross-mall) | None | Multi-mall comparison |
| AI | `buildContext()` | Same base shape, independently coded | Current snapshot | **Not scoped** | None | Chat context |

**Classification: SEMANTICALLY EQUIVALENT for the base `occupiedArea/totalArea` calculation** (all 5 appear to agree on what counts as "occupied" — not independently re-verified status-list-by-status-list this session, flagged as an assumption) **but ARCHITECTURALLY CONTRADICTORY in ownership** — `getOccupancyV2()` is demonstrably the most complete implementation (the only one with effective-occupancy and revenue-per-sqm breakdowns) yet is not consumed by any of the other 4, meaning any future refinement to the "correct" occupancy definition (e.g., excluding units under a specific hold status) must be manually propagated to 5 places instead of 1.

**Recommended authoritative owner**: `OccupancyAnalyticsService.getOccupancyV2()` — it already exists and is already the most complete; the fix is migrating the 4 other consumers to call it, not building something new.

## Assessment

Neither metric cluster is IDENTICAL or merely INTENTIONALLY DIFFERENT (no design record anywhere defends the divergence as deliberate) — both are effectively CONTRADICTORY in the sense that matters: a user comparing two screens (e.g. main Dashboard vs. Cross-Mall Dashboard, or Analytics vs. AI chat) for the "same" number can legitimately see different figures with no visible explanation. This is the direct, now-doubly-confirmed instance of the platform's named risk.
