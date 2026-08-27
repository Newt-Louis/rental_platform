# System Truth — 16 — Multi-Currency Semantics

Per-domain verification against the nine surfaces in `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`.

## Contracts / Booking / Proposals (core leasing chain)

| Surface | Status | Notes |
|---|---|---|
| CREATE | VERIFIED | Currency correctly resolved at each hop: Booking `dto.currencyCode ?? 'VND'` → Proposal `rentCurrency` (inherited or set) → Contract `currencyCode` (server-overrides client value when a `proposalId` link exists) |
| READ | VERIFIED | No coercion found |
| UPDATE | VERIFIED for Contract (amendment-only fields locked post-ACTIVE, currency not client-editable post-link) | |
| DISPLAY | GAP (minor) | `booking.service.ts:496,525` activity-log notes hardcode "VND/m²" text regardless of actual `currencyCode` |
| CALCULATION | GAP | `ProposalsService.calcFinancials()` vs. `BookingService.convertToProposal()`'s inline calc diverge on discount/rent-free handling — not a currency bug per se, but a duplicate-calculation-logic bug in the same chain |
| REPORTING | GAP | See `13-REPORTING-DEFINITIONS.md` — Dashboard/Reports pipeline-value widgets don't consistently account for currency |
| EXPORT | NOT VERIFIED | |
| NOTIFICATION | NOT VERIFIED for this chain specifically | |
| RECONCILIATION | NOT VERIFIED | |

**Overall**: VND+USD+MMK, core propagation chain verified correct end-to-end — the platform's best-executed multi-currency surface.

## Billing (Invoice/Payment)

| Surface | Status | Notes |
|---|---|---|
| CREATE | GAP | Correct for LEASE_CONTRACT source; **bug** for penalty-interest invoices (currencyCode never set) |
| READ | VERIFIED | |
| UPDATE | VERIFIED | Payment currency server-enforced equal to invoice's |
| DISPLAY | GAP | `BillingPage.tsx:1272` one hardcoded-VND totals row amid an otherwise currency-aware page |
| CALCULATION | GAP | `findAllInvoices()` summary sums across currencies unfiltered (confirmed bug); revenue-share formula mixes VND-implicit Sales figures with contract-currency Rent (confirmed bug) |
| REPORTING | VERIFIED for AR-aging/collection-KPI/dashboard (correctly currency-scoped); GAP for the invoice-summary case above | |
| EXPORT | GAP | Excel export has no currency column at all |
| NOTIFICATION | GAP | Dunning/issuance email templates hardcode "VNĐ" regardless of actual currency |
| RECONCILIATION | NOT VERIFIED | |

**Overall**: VND+USD+MMK supported at the model level, but multiple confirmed leaks at the aggregation/display/export/notification layers.

## Service Contracts

| Surface | Status | Notes |
|---|---|---|
| CREATE | GAP | `ServiceContract`/`ServiceContractPayment.currency` are free-text `String`, not the `CurrencyCode` enum — documented out-of-scope by `MULTI_CURRENCY_AUDIT.md` at the model level. **The consequence of leaving it untightened is a real bug**: `transferPaymentToBilling()` forgets to propagate it to the created Invoice at all |
| Others | Mostly GAP or NOT VERIFIED, consistent with the model-level currency being unvalidated free text | |

**Overall**: VND-only by design at the top-level architecture decision, but the design's stated risk ("their own billing paths... backlog") already materialized as a live bug in one of those paths.

## Parking

| Surface | Status | Notes |
|---|---|---|
| CREATE | GAP | Contract-level `.currency` field exists (free text, unread); statement/line/payment level has **no currency field at all** — undocumented gap, deeper than what `MULTI_CURRENCY_AUDIT.md` covers |
| Billing boundary | Documented (a) | `billing.service.ts:302` explicitly hardcodes VND with a comment citing the audit doc |

**Overall**: VND-only, confirmed and honestly reflected at the Billing boundary, but the root gap (no currency field on the money-bearing models) is undocumented.

## Sales

| Surface | Status | Notes |
|---|---|---|
| CREATE | GAP | `SalesTurnover` has no currency field at all, and — unlike Parking/Service-Contracts — this wasn't even mentioned in `MULTI_CURRENCY_AUDIT.md`'s scanned model list |
| CALCULATION | GAP | Feeds `calculateRevenueShare`'s cross-currency mixing bug |

**Overall**: VND-only, undocumented, with a downstream formula-correctness consequence. **Open business question**: is this intentional (sales turnover always tracked in local currency) or a gap? See `BUSINESS_CONFIRMATION_REQUIRED.md`.

## Slots

| Surface | Status | Notes |
|---|---|---|
| CREATE | GAP | `UnitSlot`/`SlotBooking` have no currency field at all |
| Billing boundary | Documented (a) | `billing.service.ts:277` explicit comment |

**Overall**: VND-only, same pattern as Parking — documented defensively downstream, undocumented at the source.

## Parking-Dashboard (external MSSQL system)

**Overall**: VND-only by design and appropriately so — this is a legacy external cash/card gate system with no multi-currency concept at all, distinct from Parking's tenant-contract subsystem.

## Cross-domain mixed-currency risk register

| Location | Risk |
|---|---|
| `billing.service.ts:findAllInvoices()` summary | Confirmed live mixing bug |
| `calculateRevenueShare` | Confirmed formula-unit-mismatch, severity depends on real-world revenue-share contract currency mix |
| Dashboard/Reports/Analytics revenue aggregates | Correctly VND-scoped in most places (positive), but this itself means non-VND revenue is **silently excluded** from headline KPIs rather than converted/labeled — a different kind of gap (undercounting, not mixing) worth separate confirmation |

## Reconciliation with `docs/program/MULTI_CURRENCY_*.md`

`MULTI_CURRENCY_AUDIT.md` §6's "unsafe SUM across currencies" fix is confirmed applied to Dashboard/CollectionKpi but **not** to `billing.service.ts:findAllInvoices()` — the audit's claimed completion doesn't match current code coverage. §9's "left untouched by design" characterization of Parking/Service-Contracts/Sales currency fields is accurate as a top-level decision, but undersells the concrete bugs that resulted in Service-Contracts' dual-path gap and doesn't cover Sales/Slots' complete absence of a currency field at all (not even flagged as "left untouched" — simply not in scope of that audit). See `ARCHITECTURE_CONTRADICTIONS.md` `CONTRA-005`/`CONTRA-009`.
