# Money and Currency Audit

Status: ACTIVE CONTINUOUS AUDIT

## Approved rules

- Financial tables: amount and ISO currency are separate, exact fields.
- Detail views: exact amount plus authoritative persisted currency.
- No K/M/B/tr/triệu/tỷ abbreviations for transaction values.
- Never aggregate mixed currencies without an approved FX/consolidation design.
- Never infer a historical document's currency from current Mall configuration.
- Export uses raw numeric amount plus currency and discloses caps/truncation.

## Verified Golden areas

- Dashboard chart convention: explicit axis unit, exact tooltip.
- Booking: no financial behavior changed by Golden work.
- Billing: Amount/Currency separation and backend-authoritative balance retained.
- Contract: persisted currency presentation retained.

## Open items

- Penalty/dunning currency correctness: separate correctness CR; not a UI fix.
- Payment remaining formula mismatch: backend `balance` remains authoritative.
- Revenue-share currency semantics for non-VND scenarios: business confirmation required.
- Fitout change-order display: persisted `FitoutChangeOrder.currency` is now preserved by the frontend adapter and totals are grouped per currency; no mixed-currency sum is shown.
- Fitout change-order creation: backend currently defaults omitted currency to VND while Fitout detail does not expose Contract currency. Whether creation must inherit Contract currency is `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` and remains quarantined.
- CRM Lead expected/estimated values have no currency field. Current backend semantics describe them as VND, while BC-001 asks whether non-VND entry can occur. Wave 2 now shows exact VND values without compact notation but does not close BC-001.
- Tenant Portal pending invoices are grouped and displayed separately by persisted `Invoice.currencyCode`; VND, USD and MMK are never summed together and no FX is performed.
- Wave 3 Unit/Space rate cards (`baseRentPerSqm`, `camPerSqm` and analytics derived from them) have no persisted currency field. Existing backend/UI semantics treat them as VND; presentation now uses exact unscaled values with explicit `VND`, including grid, compare, map and analytics. This does not make Unit rates authoritative for Proposal/Contract currency.
- Slot pricing still has no currency provenance. It remains quarantined and was not relabeled or combined with Unit/Contract money in Wave 3.
- Wave 5 Reports/Analytics financial charts declare `Tỷ VND` on the axis and show exact values plus ISO currency in tooltips. KPI and pipeline values no longer use compact notation. VND-only revenue/receivables metrics explicitly disclose that USD/MMK records are excluded; no FX or mixed-currency sum is introduced.
- Wave 7 Dashboard audit confirms exact `VND` KPI/worklist values, explicit `Tỷ VND` chart scale and exact ISO-currency tooltips. Backend headline queries remain VND-scoped, so USD/MMK exclusion is preserved rather than hidden behind FX or mixed-currency aggregation.
