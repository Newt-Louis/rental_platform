# System Truth — 07 — Data Lineage

## Priority field: Contract currency/value

- **Origin**: Booking creation (`dto.currencyCode ?? 'VND'`) or direct Contract creation (`dto.currencyCode ?? 'VND'`).
- **Copied to**: Proposal.rentCurrency (inherits Booking's), Contract.currencyCode (inherits Proposal's when linked, server-overrides client value), BillingScheduleEntry.currencyCode (derived at schedule-build time), Invoice.currencyCode (LEASE_CONTRACT source, correctly inherited).
- **Can change after creation?** Contract's core financial terms are amendment-only post-ACTIVE (locked field set); currency itself is not found to be independently editable post-link. Verified consistent, no drift risk found.
- **Confidence**: HIGH.

## Priority field: Invoice outstanding/paid balance

- **Origin**: computed, not stored directly — derived from `Invoice.totalAmount + adjustmentAmount - (payments - refunds)`.
- **Copied to**: 6+ independent re-derivations within Billing (see `12-FINANCIAL-SEMANTICS.md`); further re-derived (not copied) by Dashboard/Reports/Analytics with 5+ additional independent formulas for the related "collected revenue" concept.
- **Drift risk**: HIGH by structure (many independent implementations) though not yet observed to have produced different numbers on identical inputs in this pass — the risk is latent, not yet confirmed as a live discrepancy beyond the two currency-filtering bugs already confirmed.

## Priority field: Contract/Booking/Proposal/Unit status

- **Origin**: each entity's own service layer.
- **Copied to**: nowhere directly (status isn't duplicated as data), but read/branched-on by many consumers (Dashboard counts, Reports, Analytics) — the risk here is inconsistent *interpretation* of status combinations across consumers, not data copying. Not independently deep-audited this pass beyond the specific findings in `04-STATE-MACHINES.md`/`SYSTEM_STATUS_MAP.md`.

## Priority field: Mall assignment on Contract/Tenant/Unit

- **Origin**: set at creation (Unit's Mall via Floor/Zone hierarchy; Contract/Tenant inherit from the Unit).
- **Can change after creation?** Not independently verified this pass (e.g. does a Unit ever move between Malls via merge/split across mall boundaries — unlikely but not confirmed excluded).
- **Confidence**: MEDIUM — not deeply traced.

## Display/export surfaces that cannot be traced to a currency-correct entry point (concrete drift-risk findings)

| Field | Display/Export | Traceable to a correct entry point? |
|---|---|---|
| ServiceContractPayment currency, via `transferPaymentToBilling` path | Invoice created downstream | **No** — currency is lost at this specific write, not merely displayed incorrectly |
| SalesTurnover.grossSales | Revenue-share Invoice | **No** — no currency field exists upstream at all to trace from |
| Billing Excel export | Any currency amount | **No** — export has no currency column, so even correctly-stored currency data is lost on export |

## Status

This document reflects the depth achievable from the five research streams' findings; a full field-by-field lineage trace (as the template envisions) was not performed for every entity. Fields not mentioned above are **NOT YET VERIFIED** rather than assumed clean. Recommended as a P4 (Cross-Module Contracts) follow-up per `docs/ai-erp-team/13-PROGRAM-BOARD.md`.
