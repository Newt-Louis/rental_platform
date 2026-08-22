# System Truth — Platform Dependency Graph

## Adjacency list (verified from direct service-layer/table reach-ins found this pass; not exhaustive for modules outside the 5 research streams' deep-dive)

```text
crm            → depends on → (none upstream; is reached into by booking, proposals, dashboard, reports, slots, spaces)
booking        → depends on → crm
proposals      → depends on → booking, crm, categories (pricing validation)
approvals      → depends on → proposals (via events only — clean boundary)
contracts      → depends on → proposals
billing        → depends on → contracts, service-contracts, parking, slots, sales
service-contracts → depends on → (billing writes back into it)
parking        → depends on → (billing writes back into it)
parking-dashboard → depends on → external MSSQL system only (isolated from the rest of the graph)
sales          → depends on → tenants, spaces (Unit.areaNLA)
slots          → depends on → spaces (Unit)
spaces         → depends on → (shared UnitStatusService is common/, not a module dependency)
fitout         → depends on → contracts (event), spaces (UnitStatusService)
work-orders    → depends on → patrol (as a trigger target)
tickets        → depends on → tenants (tenantId scoping)
patrol         → depends on → work-orders (creates WorkOrder on ABNORMAL)
inventory      → depends on → (isolated — no cross-module dependency found)
tenants        → depends on → crm (Customer.tenantId link)
dashboard      → depends on → contracts, billing, tickets, approvals, booking, units
reports        → depends on → billing (partial — only AR-aging delegates), contracts, units
analytics      → depends on → contracts, invoices, units, sales
ai             → depends on → invoices, units (read-only, own reimplementation)
sap            → depends on → billing, crm (push source data)
auth, users    → depended on by → every guarded module (not a dependency of any)
categories     → depended on by → booking, proposals, spaces, inventory
notifications  → depends on → contracts, crm
```

## Cycles found

None confirmed at the module-dependency level in this pass. The closest to a cycle is the **bidirectional Billing↔Parking / Billing↔ServiceContracts coupling** (Billing reads pending receivables from these modules, then writes status/sync fields back into their tables) — not a true cycle (no circular *service call* chain found, just bidirectional *table* access), but worth flagging as an architecture smell: Parking/ServiceContracts do not have exclusive write ownership of their own payment-status fields.

## Diagram

Full visual diagram not rendered in this pass (would require diagramming tooling); the adjacency list above and `PLATFORM_DEPENDENCY_MATRIX.md`'s table form are the authoritative representations until a visual pass is done.

## Highest-fan-in modules (de facto Tier 0/1 regardless of business-function grouping)

1. **Billing** — read/written-into-by Contracts, Parking, Service-Contracts, Sales, Slots, plus consumed by Dashboard/Reports/Analytics/SAP. The single highest-fan-in module in the platform.
2. **Contracts** — written-into-by Billing, Analytics, Dashboard, Sales, Tenants, Spaces, AI, Proposals; triggers Fitout.
3. **Auth/Users/UserMallAccess (common/)** — depended on by literally every guarded module; not itself a "module" in the business sense but structurally the highest-fan-in code in the platform.
4. **Spaces/UnitStatusService (common/)** — depended on by Booking, Proposals, Contracts, Fitout for the shared Unit lifecycle.
5. **CRM (Lead/Customer)** — reached into directly by Booking, Proposals, Dashboard, Reports, Slots, Spaces despite nominally being a leaf/upstream module.

These 5 should be treated as Tier 0 for change-severity purposes (`docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`) regardless of their business-function Tier classification in `01-PLATFORM-SCOPE.md`'s grouping.
