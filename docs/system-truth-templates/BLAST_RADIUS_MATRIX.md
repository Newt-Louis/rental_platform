# System Truth — Blast Radius Matrix

> **TEMPLATE — NOT YET POPULATED.** For each module, what breaks if it
> changes — the single most directly useful reference when filling a
> CR's Impact Map under time pressure.

## Per-module blast radius

### Module: [name]
- **Direct consumers (from `PLATFORM_DEPENDENCY_MATRIX.md` column):**
- **Financial formulas affected if this module's data changes shape
  (cross-ref `12-FINANCIAL-SEMANTICS.md`):**
- **Golden Scenarios that exercise this module (cross-ref
  `JOURNEY_MODULE_MATRIX.md`):**
- **Reports/dashboards that would show stale/wrong data if this module's
  output changed silently:**
- **Worst plausible failure if this module breaks entirely:**
- **Severity tier if broken (per
  `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`):**

## Summary table

| Module | Direct consumers (count) | Financial surface? | Golden Scenarios affected | Worst-case severity |
|---|---|---|---|---|

## How to use this when writing a CR

Before finalizing a CR's DOWNSTREAM IMPACT section, check this module's
row here — if the CR's stated downstream impact is narrower than what
this matrix shows, either the CR is missing scope or this matrix needs
correcting (verify which, don't just pick one).
