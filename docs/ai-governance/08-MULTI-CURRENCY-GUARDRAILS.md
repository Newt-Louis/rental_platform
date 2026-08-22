# 08 — Multi-Currency Guardrails

This is the highest-risk area in the current change stream: the repo's
git history (`c61fdb9 feat(currency): multi-currency foundation for
VND/USD/MMK`, `38cadba`, `fdb6796`) shows multi-currency work actively in
progress across Booking, Contracts, Billing, Service Contracts, and
related UI. Treat everything in this document as binding for any change
that touches money.

## Core principle

> **Multi-currency is a Platform Change, not a per-module feature.**

Adding a currency enum, a currency picker, or a currency column to one
module's table does not make that domain "multi-currency ready." It makes
one surface of it currency-aware. Never claim full-platform USD/MMK
support merely because an enum exists somewhere in the schema or a
dropdown exists somewhere in the UI.

## The nine surfaces that must each be verified per domain

A domain is multi-currency-ready only when ALL of the following are
verified true for it, not assumed:

```text
CREATE          — new records correctly capture the transaction's currency
READ            — existing records are read back with their original currency, never coerced
UPDATE          — edits preserve currency correctness (can't silently change currency of an existing money value by editing amount)
DISPLAY         — UI shows the correct currency symbol/code alongside every amount, per-record
CALCULATION     — formulas (totals, aging, revenue share) operate within one currency, or explicitly convert
REPORTING       — Dashboard/Reports/Analytics don't silently sum across currencies
EXPORT          — CSV/PDF/Excel exports carry currency, not just amount
NOTIFICATION    — emails/tenant-portal messages show correct currency
RECONCILIATION  — cross-module totals for the same entity agree in currency, not just amount
```

For each domain, record verification status for each surface in
`docs/system-truth-templates/16-MULTI-CURRENCY-SEMANTICS.md` (HIGH /
MEDIUM / LOW confidence per `docs/ai-erp-team/09-ERP-QUALITY-MODEL.md`,
never a bare "done").

## Hard rules

- **No mixed-currency SUM without FX.** Never add amounts from records
  with different currencies. If a cross-currency total is genuinely
  needed (e.g. a Company-level dashboard spanning VND and USD malls), it
  requires an explicit, documented FX/consolidation design — this is a
  Tier 0 decision, not something an implementation agent decides
  in-line.
- **Historical currency cannot be inferred from current Mall setting.** A
  Mall's currency configuration can change over time; a Contract/Invoice
  signed under VND does not become a USD record if the Mall is later
  reconfigured. Currency is captured at transaction time and is
  immutable for that record.
- **Locale != currency.** Vietnamese locale formatting (`vi`) does not
  imply VND; a USD amount can be displayed with Vietnamese number
  formatting. Never derive currency from `i18next` locale.
- **No mass VND replacement.** Do not blindly replace hardcoded `"VND"`,
  `₫`, or VND-specific formatting logic across the codebase. Each
  occurrence must be classified per `04-CODING-GUARDRAILS.md`'s
  SEARCH → CLASSIFY → ... method: some are genuinely VND-only by design
  (see "legacy VND-only domains" below), others need to become
  currency-aware, and the two must not be conflated.
- **Currency capability must be declared per domain.** Don't assume a
  domain supports multi-currency just because a sibling domain does.
  Check `16-MULTI-CURRENCY-SEMANTICS.md` for that specific domain.
- **Legacy VND-only domains are allowed**, explicitly and by design, as
  an interim state — provided this is a documented decision (an ADR or a
  clear note in that domain's System Truth entry), not silent omission
  discovered later. A domain that hasn't been evaluated yet is UNKNOWN,
  not "legacy VND-only by design."
- **Float/Decimal precision requires separate analysis.** Multi-currency
  work must not silently introduce floating-point rounding errors when
  amounts are converted between representations (e.g. VND integer minor
  units vs. USD/MMK with decimal subunits). Precision behavior per
  currency is its own review item, not assumed identical to VND's.

## Required evidence for any currency-touching Change Request

- Which of the 9 surfaces above are affected, per domain touched.
- Confirmation that no new mixed-currency SUM was introduced.
- Confirmation that currency is captured/read from the transaction
  record, not derived from Mall config or locale.
- Golden Scenarios GS-11 (VND), GS-12 (USD), GS-13 (MMK), and GS-14
  (mixed-currency reporting) results, per `05-E2E-QUALITY-GATES.md`.

## Existing evidence to consult, not duplicate

`docs/program/MULTI_CURRENCY_ARCHITECTURE.md`,
`MULTI_CURRENCY_AUDIT.md`, `MULTI_CURRENCY_COMPLETION.md`,
`MULTI_CURRENCY_MIGRATION.md`, and `MULTI_CURRENCY_TEST_MATRIX.md`
already contain in-progress findings for this effort. Any new
currency-touching change must read these first and reconcile with them
rather than re-deriving currency architecture decisions independently.
