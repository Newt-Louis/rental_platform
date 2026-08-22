# System Truth — Platform Dependency Matrix

`R` = reads that module's data, `W` = writes to it, `E` = receives an event from it, `RW` = both. Blank = no dependency found this pass (absence is not proof of absence beyond the 5 research streams' scope).

| ↓ writes into / reads from → | crm | booking | proposals | contracts | billing | parking | service-contracts | sales | slots | spaces(unit) | fitout |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **crm** | — | | | | | | | | | | |
| **booking** | RW | — | | | | | | | | R | |
| **proposals** | RW | R | — | | | | | | | | |
| **approvals** | | | E(read-only) | | | | | | | | |
| **contracts** | | | RW | — | | | | | | | |
| **billing** | | | R | RW | — | RW | RW | R | R | | |
| **parking** | | | | | (written by billing) | — | | | | | |
| **service-contracts** | | | | | (written by billing) | | — | | | | |
| **sales** | | | | R | R(consumed by) | | | — | | R | |
| **slots** | | | | | R(consumed by) | | | | — | R | |
| **spaces (Unit)** | | W(status) | W(status) | W(status) | | | | | | — | W(status) |
| **fitout** | | | | E | | | | | | RW(status) | — |
| **tickets** | | | | | | | | | | | |
| **patrol** | | | | | | | | | | | |
| **work-orders** | | | | | | | | | | | |
| **dashboard/reports/analytics/ai** | R | R | | R | R | | | R | | R | |
| **sap** | R | | | | R | | | | | | |

## Second table — Space/Tenant Ops (separate for readability)

| ↓ / → | tickets | patrol | work-orders | inventory | tenants |
|---|---|---|---|---|---|
| tickets | — | | | | R(tenantId) |
| patrol | | — | W(create) | | |
| work-orders | | (created by patrol) | — | | |
| inventory | | | | — | |
| tenants | | | | | — |

## How to use this when writing a CR

For a change in module X, read row X for what X depends on (UPSTREAM IMPACT); read column X for what depends on X (DOWNSTREAM IMPACT). The Billing row/column is the densest in the platform — any Billing change has the widest blast radius of any single module. See `BLAST_RADIUS_MATRIX.md` for the full per-module ranked detail.
