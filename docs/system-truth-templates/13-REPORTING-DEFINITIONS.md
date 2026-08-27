# System Truth — 13 — Reporting Definitions

> **TEMPLATE — NOT YET POPULATED.** What Dashboard, Reports, Analytics,
> and Pipeline Stats actually compute — verified against
> `12-FINANCIAL-SEMANTICS.md`'s canonical definitions, not assumed to
> match.

## Per-report/metric record

### Report/Widget: [name, module]
- **What it displays:**
- **Formula used (as implemented in this report's own code):**
- **Matches canonical `12-FINANCIAL-SEMANTICS.md` definition?**
  YES / NO — DUPLICATE IMPLEMENTATION / NO CANONICAL DEFINITION EXISTS
- **Data source (direct query vs. calling the owning module's service):**
- **Currency handling (does it correctly avoid mixed-currency sums?):**
- **Refresh/caching behavior (stale-data risk):**
- **Confidence:** HIGH / MEDIUM / LOW

## Reports inventory

| Report/Widget | Module | Formula matches canonical? | Currency-safe? |
|---|---|---|---|

## Mismatches found

(Every report whose displayed number could disagree with the owning
module's own display of the same concept — this is the direct check for
the "duplicated financial formulas between Billing, Dashboard, and
Reports" failure class named in `AGENTS.md`.)
