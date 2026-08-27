# System Truth — 12 — Financial Semantics

## Outstanding/Paid Balance (Billing)

- **Meaning**: amount owed on an Invoice after adjustments and payments.
- **6 independent implementations found**, all currently consistent in shape (`max(0,total+adjustment) - max(0,grossPaid-refunded)`) but maintained separately:
  1. `billing.service.ts` private `financials()` helper (lines 77-82)
  2. Inline in `recomputeInvoiceStatusFromPayments` (1110-1113)
  3. Inline in `syncSourceReceivable` (1139)
  4. `ar-dunning.service.ts:69-71`
  5. `penalty-interest.service.ts:41-43`
  6. `collection-kpi.service.ts:35-36,92-93` — this is actually a **7th distinct variant** in formula terms (uses `adjustmentAmount`+`refundedAmount` directly, doesn't call `financials()`)
- **Owner**: Billing (nominal), but no single implementation is actually shared.
- **Risk**: not yet observed to have diverged, but any future change to the formula (e.g. adding write-offs) requires touching 6+ call sites correctly to stay consistent. Flagged as maintenance risk, not yet a live bug.
- **Confidence**: HIGH.

## AR Aging (Billing)
- **Owner**: `BillingService.getArAging()` — correctly currency-bucketed (`tenantId:currencyCode` keys).
- **Consumer discipline**: Reports' `arAgingReport()` correctly **delegates** to this (with an explicit code comment acknowledging reuse) — the platform's one positive example of formula-ownership discipline being followed.
- **Confidence**: HIGH.

## Collection KPIs (DSO, collection rate) (Billing)
- **Owner**: `CollectionKpiService.getKpis()` — VND-scoped explicitly.
- **Confidence**: HIGH.

## Invoice Summary Total (Billing) — RESOLVED by CR-102 (2026-08-21)

**Correction record, not a silent edit.** Original finding (preserved below) was CONFIRMED BUG, P1. Fixed and tested under `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md`: `findAllInvoices()`'s summary now buckets by `currencyCode` (`summary.byCurrency`), with the top-level `summary.*` fields VND-only (backward compatible), never blending currencies. 10 new tests (T01-T10) verify every VND/USD/MMK combination. **Known limitation** (found during CR-102's adversarial review, not fixed by CR-102): the fix correctly buckets by whatever `currencyCode` is *stored*, but cannot detect that a stored value is itself wrong — see the still-open `ServiceContracts.transferPaymentToBilling()` gap below and in `ARCHITECTURE_CONTRADICTIONS.md` CONTRA-010, confirmed live-reachable via `ServiceContractsPage.tsx`'s USD/MMK currency selector.

Original finding text (historical record):
- `findAllInvoices()` summary block (`billing.service.ts:708-730`) sums `balance`/`totalAmount` across **all currencies with no filter**, unlike every sibling formula in the same module (`getPendingReceivables`, `getArAging`, `collection-kpi.service.ts`, `dashboard.service.ts` all explicitly VND-filter or currency-bucket).
- **Severity**: P1. A single non-VND invoice in the filtered result set silently blends into the summary total.
- **Confidence**: HIGH (directly verified, contradicts the documented completion of `docs/program/MULTI_CURRENCY_AUDIT.md` §6).

**Additional correction (discovered during CR-102's Step 6 bypass search, 2026-08-21)**: this document's implicit reliance on the original research stream's characterization of `dashboard.service.ts` as the only correctly-guarded sibling was itself incomplete — fresh reads during CR-102 confirmed `reports.service.ts` (`revenueReport()`, `revenueReceivablesReport()`), `analytics/compliance.service.ts` (`getMultiMallComparison()`), and `analytics/occupancy-analytics.service.ts` (`takeMonthlySnapshot()`) **already carry explicit `currencyCode: 'VND'` filters** with code comments referencing the multi-currency architecture — this contradicts `docs/architecture-review/05-CANONICAL-FINANCIAL-SEMANTICS.md`'s claim that these "are not currency-filtered." See that document's own correction note.

## Revenue Share (Billing, reading Sales) — STILL OPEN, CR-102 Defect B, blocked

**CR-102 investigated this and did not fix it** — see `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md` "Blocker" section. VND-only business semantics for `SalesTurnover` could not be proven from any available evidence (schema, code, docs, UI, tests). Returned `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` rather than guessing. Original finding below remains accurate and current:
- **Formula**: `shareAmount = max(0, sale.grossSales * pct% - contract.rent)` (`billing.service.ts:1384`).
- **Bug**: `SalesTurnover.grossSales` has no currency field (implicitly VND); `contract.rent` is denominated in `contract.currencyCode` (can be non-VND). The subtraction mixes units if the contract is non-VND; the invoiced result is denominated in `contract.currencyCode` regardless.
- **Severity**: P0 if revenue-share contracts are ever non-VND in practice (open `BC` item — see `BUSINESS_CONFIRMATION_REQUIRED.md`); otherwise dormant.
- **Confidence**: MEDIUM (formula bug confirmed in code; real-world currency mix of revenue-share contracts unconfirmed).

## Penalty Interest (Billing)
- **Bug**: penalty invoices created via `penalty-interest.service.ts:68-99` never set `currencyCode`, defaulting to the Prisma schema's VND default regardless of the source invoice's actual currency.
- **Severity**: P1.
- **Confidence**: HIGH.

## Service Contract → Invoice transfer — CONFIRMED DUAL-IMPLEMENTATION BUG
- Two independent code paths turn a `ServiceContractPayment` into an `Invoice`: `ServiceContractsService.transferPaymentToBilling()` (misses `currencyCode` entirely) and `BillingService.createInvoiceFromPending()`'s SERVICE_CONTRACT branch (correctly sets it via `toCurrencyCode(payment.currency)`). Same business operation, two implementations, only one is correct.
- **Severity**: P1.
- **Confidence**: HIGH.

## Parking Financial Model
- FIXED_QUOTA: `baseAmount = registeredQuantity * unitPrice`; `excessAmount = max(0, actual-registered) * excessUnitPrice`; `totalAmount = baseAmount + excessAmount`.
- PRINCIPLE_ACTUAL: `baseAmount = actual * unitPrice`, no excess.
- Statement total: `subtotal + adjustment`.
- **Currency**: statement/line/payment level has no currency field at all — an undocumented gap beyond what `MULTI_CURRENCY_AUDIT.md` covers (that audit only documents the contract-level field as out-of-scope-by-design).
- **Confidence**: HIGH.

## Sales Financial Model
- No derived formulas — `grossSales`/`netSales` are tenant-entered raw numbers; `salesPerSqm = netSales / unit.areaNLA`.
- **Currency**: no field at all, not even mentioned in `MULTI_CURRENCY_AUDIT.md`'s scanned model list — meaning it wasn't considered in scope for that audit at all.
- **Open question**: is retail sales turnover always VND regardless of the tenant's contract currency (a defensible business rule for "gross retail sales" as a local-currency metric), or should it follow contract currency? See `BUSINESS_CONFIRMATION_REQUIRED.md`.
- **Confidence**: HIGH (model verified; business intent unconfirmed).

## Slots Financial Model
- DAILY: `baseAmount = pricePerDaySqm * area * days`, weekend split, PEAK_SEASON multiplier, largest-satisfied VOLUME_DISCOUNT rule.
- HOURLY: `baseAmount = pricePerHour * hours` (ceil-rounded).
- MONTHLY: `baseAmount = pricePerSqmMonth * area * months`, where `months = ceil(diffMs / 30-day-flat)` — **not calendar-aware**, a modeling simplification worth Finance confirmation.
- `totalAmount = baseAmount * (1 - discountPct/100)`.
- **Currency**: no field at all on `UnitSlot`/`SlotBooking` — documented defensively only at the Billing boundary (`billing.service.ts:277` explicit comment), the source-model gap itself is undocumented.
- **Confidence**: HIGH.

## Occupancy Rate — reimplemented independently in 5 places
`occupancyRate = occupiedArea/totalArea × 100`, computed independently by Dashboard, Reports (via `occupancyByLeaseTerm`), `OccupancyAnalyticsService.getOccupancyV2()` (the most complete implementation — includes `effectiveOccupancy`, `totalMonthlyBillingRevenue`, per-floor `avgRentPerSqm` — but never called by the other four), `ComplianceService`, `AiService`. No shared "occupancy service" is actually consumed by the other four despite `getOccupancyV2()` looking designed to be canonical.

## Collected Revenue — reimplemented independently in up to 7 places
Dashboard's main dashboard (`invoice.reduce`), Dashboard's cross-mall view (a **subtly different 3rd variant** — counts face-value `totalAmount` of PAID/PARTIALLY_PAID invoices, not actual payments-received sum like the main dashboard), Reports' `revenueReport()` (face-value PAID status), Reports' `revenueReceivablesReport()` (its own `collected()` helper, payments-minus-reversed — a 4th variant), `ComplianceService.getMultiMallComparison()` (raw `invoice.aggregate({_sum:{subtotal}})`, a 5th/6th variant, subtotal not totalAmount, no payments concept at all), `OccupancyAnalyticsService.takeMonthlySnapshot()` (same aggregate pattern, independently duplicated), `AiService.buildContext()` (own `invoice.aggregate`/reduce, unscoped by mall).

## Formula-ownership assessment

No single "Revenue/Collection" or "Occupancy" service exists that Dashboard/Reports/Analytics/AI are required to call. The one confirmed positive counter-example is Reports' AR-aging endpoint correctly delegating to Billing's `getArAging()`, with an explicit code comment showing the team is aware of the risk — but this discipline was not applied to revenue/collection/occupancy. See `13-REPORTING-DEFINITIONS.md` and `ARCHITECTURE_CONTRADICTIONS.md` for the consolidated severity ranking.
