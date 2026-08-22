# 04 — Financial / Currency Architecture Review

## BC-004 investigation

### What is the authoritative transaction currency?

`Contract.currencyCode` (enum `CurrencyCode`: VND/USD/MMK) is the authoritative currency for the core leasing chain — set once at Contract creation (inherited from the linked Proposal's `rentCurrency`, itself inherited from the originating Booking's `currencyCode`), re-confirmed correct end-to-end in the prior System Truth pass and not contradicted by this session's fresh reads. `Invoice.currencyCode` correctly inherits from its source Contract for the LEASE_CONTRACT source type.

### Can SalesTurnover records contain multiple currencies?

**No, and this is itself the defect** — re-confirmed this session by direct schema read: `model SalesTurnover` has fields `grossSales Float` and `netSales Float` with **no currency field of any kind**. It cannot "contain multiple currencies" because it structurally cannot represent currency at all — every `SalesTurnover` record is a bare number with an implicit, undeclared unit.

### Does Revenue Share inherit currency?

**No — this is the core defect, re-confirmed this session.** `calculateRevenueShare` (`billing.service.ts:1355-1431`) computes `shareAmount = sale.grossSales * pct% - contract.rent` using `sale.grossSales` as a raw, currency-less number, then labels the *resulting* invoice with `contract.currencyCode` (line 1408) — the currency is applied to the output, never to the input `grossSales` figure used in the subtraction. There is no conversion step; there is no validation step; there is no field to convert *from* even if a conversion were added, without a schema change.

### Can mixed currencies currently enter one calculation?

**Yes, confirmed this session, with no structural prevention.** `revenueSharePercent` (Proposal DTO field, `create-proposal.dto.ts:74`) has no currency-conditional validation anywhere in `proposals.service.ts`. A USD- or MMK-denominated Contract can freely have a nonzero `revenueSharePercent`, making the mixed-currency calculation path reachable with no code-level barrier. Whether it is reached *in practice* is a business question (BC-004, category A — see `07-`), but whether it is *possible* is now answered definitively: yes.

### Can Billing invoice summary aggregate multiple currencies?

**Yes, confirmed this session** — `findAllInvoices()`'s summary block (`billing.service.ts:708-730`) has no `currencyCode` dimension in its `where` clause, query params, or aggregation loop. See `01-P0-VERIFICATION.md` P0-001 for full detail.

### Does ServiceContracts→Billing preserve currency correctly?

**Inconsistently — one of two paths does, one doesn't**, re-confirmed structurally consistent with the prior System Truth finding (not re-read line-by-line this session, but the underlying files were not touched by any other change in this repository during this review, so the finding stands): `BillingService.createInvoiceFromPending()`'s SERVICE_CONTRACT branch correctly sets `currencyCode` from the payment's stored `.currency` string; `ServiceContractsService.transferPaymentToBilling()` (the alternate, independently-implemented path reachable from the Service Contracts UI) omits `currencyCode` entirely, silently defaulting to the Prisma schema's VND default.

### Do reports group by currency?

**No, confirmed** — `Dashboard`, `CollectionKpiService`, and `getPendingReceivables`/`getArAging` correctly *filter or bucket* by currency (mostly VND-only filtering, which avoids mixing by excluding non-VND rather than by properly multi-currency-aware grouping) — this avoids the mixing bug but at the cost of **silently excluding non-VND revenue from headline KPIs**, a different but related gap (undercounting, not miscounting). Reports'/Analytics' own independently-reimplemented revenue/occupancy formulas (see `05-CANONICAL-FINANCIAL-SEMANTICS.md`) were not re-verified for currency-awareness this session; the prior pass found no currency dimension in most of them (they aggregate `subtotal`/`totalAmount` directly via `invoice.aggregate` with no currency filter or grouping).

### Do exports retain currency context?

**No, confirmed by the prior pass and not contradicted this session** — Billing's Excel export has no currency column. Not independently re-verified further this session (lower priority than the P0s).

### Does SAP integration receive currency explicitly?

**Not independently re-verified this session.** The prior pass did not find explicit evidence either way for SAP's payload schema regarding currency; flagged as UNKNOWN, carried forward unchanged.

## Architectural principle (per this review's mandate — reaffirmed, not newly invented)

**VND + USD + MMK ≠ one monetary total, until an explicit FX engine exists.** No FX conversion mechanism was found anywhere in this codebase during either research pass. Until one is deliberately designed and built (a Tier 0 decision requiring an ADR, not an incidental fix), the only correct behavior for any cross-currency aggregation point is to **either exclude non-matching currencies explicitly (with the exclusion visible to the user) or report per-currency subtotals separately** — never to sum. This review does not propose building an FX engine; it proposes that every confirmed mixing point be fixed to filter/bucket by currency, consistent with the pattern already correctly used elsewhere in the same codebase (`getArAging`, `CollectionKpiService`).

## Summary of confirmed currency defects (for cross-reference into `10-CHANGE-PROGRAM.md`)

| Defect | Location | Confirmed this session? |
|---|---|---|
| Invoice-summary currency mixing | `billing.service.ts:findAllInvoices` | Yes, fresh read |
| Revenue-share cross-currency formula | `billing.service.ts:calculateRevenueShare` | Yes, fresh read |
| No currency validation gating `revenueSharePercent` | `proposals.service.ts`, `create-proposal.dto.ts` | Yes, fresh read |
| ServiceContracts transfer-path missing `currencyCode` | `service-contracts.service.ts:transferPaymentToBilling` | Carried forward, not re-read this session |
| No currency field on `SalesTurnover`, `ParkingMonthlyStatement`/`.Line`/`.DebtPayment`, `UnitSlot`/`SlotBooking` | Respective schema models | `SalesTurnover` fresh-confirmed this session; Parking/Slots carried forward |
