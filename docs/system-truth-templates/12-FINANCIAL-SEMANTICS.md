# System Truth — 12 — Financial Semantics

> **TEMPLATE — NOT YET POPULATED.** Verified implementation of every
> metric in `docs/ai-erp-team/07-ERP-FINANCIAL-MODEL.md`. This document
> is what feeds the "FORMULA" fields back into that governance file.

## Per-metric record (repeat for Contract Value, Billing Amount, Invoice
Total, Paid, Outstanding, Overdue, Revenue, Deposit, Service Fee, Tax,
Discount, Revenue Share, and any others found)

### Metric: [name]
- **Meaning (verified business definition):**
- **Formula (exact, with order of operations):**
- **Implementation location(s) (file:line — list ALL, flag if >1):**
- **Date basis:**
- **Currency basis:** single-currency / cross-currency-consolidated (if
  consolidated, how — cross-ref
  `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`)
- **Rounding/precision behavior:**
- **Scope:** per-contract / per-tenant / per-mall / per-company
- **Consumers (every display/report/export using this value):**
- **Duplicate implementations found?** If yes → log to
  `ARCHITECTURE_CONTRADICTIONS.md`.
- **Confidence:** HIGH / MEDIUM / LOW

## Duplicate-formula register

| Metric | Implementations found | Locations | Do they agree on identical inputs? |
|---|---|---|---|
