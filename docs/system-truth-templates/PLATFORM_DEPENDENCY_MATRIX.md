# System Truth — Platform Dependency Matrix

> **TEMPLATE — NOT YET POPULATED.** The tabular counterpart to
> `PLATFORM_DEPENDENCY_GRAPH.md` — used directly when filling a CR's
> UPSTREAM IMPACT / DOWNSTREAM IMPACT sections
> (`docs/change-templates/CR-TEMPLATE.md`).

## Matrix

Rows = module making the change. Columns = modules potentially affected.
Mark: `—` no dependency, `R` reads that module's data/API, `W` writes to
it, `E` receives an event from it, `RW` both.

| Module ↓ / Module → | CRM | Booking | Proposals | Contracts | Billing | Spaces | Slots | Fitout | Tickets | ... |
|---|---|---|---|---|---|---|---|---|---|---|
| CRM | | | | | | | | | | |
| Booking | | | | | | | | | | |
| Proposals | | | | | | | | | | |
| Contracts | | | | | | | | | | |
| Billing | | | | | | | | | | |

(Extend rows/columns to the full verified module list from
`MODULE_INVENTORY.md`.)

## How to use this when writing a CR

For a change in module X: read row X for what X depends on (informs
UPSTREAM IMPACT); read column X for what depends on X (informs DOWNSTREAM
IMPACT). Do not rely on memory or assumption — this matrix exists
specifically so that step isn't skipped under time pressure.
