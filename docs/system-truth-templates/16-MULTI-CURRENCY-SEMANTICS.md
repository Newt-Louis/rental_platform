# System Truth — 16 — Multi-Currency Semantics

> **TEMPLATE — NOT YET POPULATED.** Per-domain verification of the nine
> surfaces defined in
> `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`. This is the
> single highest-priority System Truth document given the in-flight
> multi-currency work already in the codebase (see git history:
> `c61fdb9`, `38cadba`, `fdb6796`).

## Per-domain record (repeat for every domain that handles money: CRM,
Bookings, Proposals, Contracts, Billing, Service Contracts, Parking,
Sales, Reports/Dashboard/Analytics)

### Domain: [name]
| Surface | Status | Evidence (file:line) | Notes |
|---|---|---|---|
| CREATE | VERIFIED / NOT VERIFIED / GAP FOUND | | |
| READ | | | |
| UPDATE | | | |
| DISPLAY | | | |
| CALCULATION | | | |
| REPORTING | | | |
| EXPORT | | | |
| NOTIFICATION | | | |
| RECONCILIATION | | | |

- **Overall domain currency-readiness:** VND-only (by design / not yet
  evaluated) / VND+USD / VND+USD+MMK / PARTIAL (list which surfaces gap)
- **Confidence:** HIGH / MEDIUM / LOW

## Cross-domain mixed-currency risk register

(Every place a cross-domain total/report could combine amounts of
different currencies — verify each does NOT sum without FX, per the hard
rule in `08-MULTI-CURRENCY-GUARDRAILS.md`.)

## Reconciliation with existing multi-currency docs

Cross-check every finding here against `docs/program/
MULTI_CURRENCY_ARCHITECTURE.md`, `MULTI_CURRENCY_AUDIT.md`,
`MULTI_CURRENCY_COMPLETION.md`, `MULTI_CURRENCY_MIGRATION.md`, and
`MULTI_CURRENCY_TEST_MATRIX.md` — note agreements and discrepancies
explicitly rather than silently overwriting prior findings.
