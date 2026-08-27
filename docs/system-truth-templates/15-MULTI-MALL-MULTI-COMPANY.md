# System Truth — 15 — Multi-Mall / Multi-Company

> **TEMPLATE — NOT YET POPULATED.** Actual isolation boundaries as
> enforced in code. Directly informs
> `docs/ai-erp-team/08-ERP-SECURITY-MODEL.md` and Gate 9
> (`docs/ai-governance/05-E2E-QUALITY-GATES.md`).

## Isolation model as implemented

- **Company → Mall relationship (verified):**
- **Is Mall scoping enforced at the query layer (e.g. a global
  interceptor/guard) or per-endpoint (higher risk of gaps)?**
- **`MallAccessGuard` (or equivalent) — where applied, where NOT applied
  (explicit list of unguarded endpoints, if any):**

## Cross-Mall capability

- **Which roles, if any, can legitimately see across Malls?**
- **Which reports/dashboards aggregate across Malls, and do they
  correctly avoid mixing incompatible data (e.g. different currencies —
  cross-ref `16-MULTI-CURRENCY-SEMANTICS.md`)?**
- **BP-013 (Multi-Mall Operations) verified scope:** (this is likely a
  `BC-xxx` item — record it here if unresolved)

## Per-module Mall-scoping verification

| Module | Mall-scoped writes enforced? | Mall-scoped reads enforced? | Evidence | Gaps found |
|---|---|---|---|---|

## Known prior incident

Project history records a prior root-caused cross-Mall data leak tied to
`MallAccessGuard` gaps, since fixed in specific instances. This document
must confirm current state module-by-module, not assume the historical
fix was complete platform-wide.
