# 07 — ERP Financial Model

## Governed metrics

Every metric below must have a single documented definition, owner, and
implementation. Where the current codebase implements a metric in more
than one place, that is an `ARCHITECTURE_CONTRADICTIONS.md` finding to
raise during System Truth reconstruction, not something to silently
accept.

```text
Contract Value
Billing Amount
Invoice Total
Paid
Outstanding
Overdue
Revenue
Deposit
Service Fee
Tax
Discount
Revenue Share
```

## Required profile per metric

```text
MEANING         — one-sentence business definition
FORMULA         — the actual computation, in precise terms (not "sum of
                   line items" if there's rounding/tax/discount order
                   sensitivity — spell out the order of operations)
OWNER           — module whose code is the canonical implementation
DATE BASIS      — which date(s) the calculation is anchored to (invoice
                   date, due date, payment date, period-end)
CURRENCY BASIS  — single-currency only, or cross-currency consolidated
                   (and if so, how — see
                   docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md)
SCOPE           — per-contract, per-tenant, per-mall, per-company
CONSUMER        — every module/report that displays or uses this value
```

## Known risk areas (from prior audit history)

Prior work in `docs/audit/` and `docs/program/04-BILLING-*` already
identified billing/finance as a historically fragile area (concurrency
issues, domain-map gaps, failure-matrix gaps). Any change to a metric
above must:

1. Check whether `docs/program/04-BILLING-DOMAIN-MAP.md`,
   `04-BILLING-CONCURRENCY.md`, and `04-BILLING-FAILURE-MATRIX.md`
   already document relevant constraints.
2. Not reintroduce a previously-fixed class of bug (cross-reference
   `docs/ai-erp-team/12-RISK-REGISTER.md` once populated).

## Filling this in

This document intentionally does NOT contain filled-in formulas — doing
so without verifying against actual code would itself violate the
"no business guessing" rule. Populate `FINANCIAL SEMANTICS` findings via
`docs/system-truth-templates/12-FINANCIAL-SEMANTICS.md`, then link the
verified definitions back into this file as the governing reference.
