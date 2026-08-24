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
