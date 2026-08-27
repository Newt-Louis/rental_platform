# System Truth — 19 — Change Impact Protocol (Verified Reference Data)

Quick-reference per module, for filling out a CR's Impact Map (`docs/change-templates/CR-TEMPLATE.md`) without re-deriving from scratch. See `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md` for what the protocol requires.

| Module | Upstream deps | Downstream consumers | Financial surface? | Currency-ready? | Auth-sensitive gaps? | Typical Tier |
|---|---|---|---|---|---|---|
| crm | — | booking, proposals, dashboard, reports | No (estimatedValue display only) | No currency field on Lead/Customer | Yes — Customers/getUnifiedDeals unscoped | 1 |
| booking | crm | proposals | Yes (proposedRentPerSqm) | Yes | No | 1 |
| proposals | booking, crm | contracts, approvals, billing (schedule read) | Yes (calcFinancials) | Yes | No | 1 |
| approvals | proposals (via events) | proposals | No | N/A | No — cleanest module | 1 |
| contracts | proposals | billing, fitout, analytics, dashboard, sales, tenants, spaces | Yes | Yes (propagation verified correct) | No, except termination transaction gap | 0/1 |
| billing | contracts, service-contracts, parking, slots, sales | dashboard, reports, collection-kpi, sap | Yes — core | Partial (see `16-`) | No | 0 |
| service-contracts | — | billing | Yes | Gap (dual-path bug) | No | 1/2 |
| parking | — | billing | Yes | Gap (no currency field) | Yes — parking-dashboard is separate and ungated | 2 |
| parking-dashboard | external MSSQL | (standalone reporting) | Yes (external) | N/A (VND-only external system) | Yes — no mall check | 2 |
| sales | — | billing (revenue-share read) | Yes | Gap (no currency field) | Yes — no mall filtering | 1/2 |
| slots | — | billing | Yes | Gap (no currency field) | No, but concurrency bug (double-booking) | 2 |
| spaces | — | booking, proposals, contracts, fitout, tickets, work-orders | No | N/A | **Yes — confirmed P0 gap on units** | 0 (elevated due to gap) |
| fitout | contracts (event) | (Unit status) | No | N/A | Yes — controls/gantt/daily-report-photos ungated | 1/2 (elevated) |
| work-orders | patrol (trigger) | — | No | N/A | No | 2 |
| tickets | — | notifications | No | N/A | Yes — 3 endpoints bypass tenant check | 2 (elevated) |
| patrol | — | work-orders | No | N/A | No | 2 |
| inventory | — | — | No | N/A | No | 2 |
| tenants | — | contracts, invoices, tickets, sales, customers | No | N/A | No | 1 |
| dashboard | contracts, billing, tickets, approvals, booking | — | Yes (reimplemented) | Partial | No — positive example | 3 (but financial-data-sensitive) |
| reports | billing (partial), contracts, units | — | Yes (reimplemented) | Partial | **Yes — no mall scoping at all** | 3 (elevated) |
| analytics | contracts, invoices, units, sales | — | Yes (reimplemented) | Partial | **Yes — no mall scoping; multi-mall endpoint gap** | 3 (elevated) |
| ai | invoices, units | — | Yes (reimplemented, read-only) | N/A | **Yes — no mall scoping** | 3 (elevated) |
| auth | — | every guarded module | No | N/A | Core security infra | 0 |
| users | — | every module (UserMallAccess) | No | N/A | Core security infra | 0 |
| categories | — | booking, proposals, spaces, inventory | No (pricing rules VND-only) | N/A | No | 1 |
| audit-log | (reads all mutations) | — | No | N/A | No (appropriately ADMIN/CEO-scoped) | 3 |
| notifications | contracts, crm | email delivery | No | N/A | Not deeply audited | 2 |
| sap | billing, crm | external SAP | Yes (push) | N/A | No | 2 |
| telemetry, branding, announcements | — | — | No | N/A | Announcements is a positive scoping example | 3 |

## How to use this table
Cross-check any CR's stated DOWNSTREAM IMPACT against this table's "Downstream consumers" column — if narrower, either the CR is under-scoped or this table needs correcting (verify which). "Auth-sensitive gaps" flags modules where a CR should include an explicit Mall/Tenant-scoping review even for changes that don't look security-related on their face.
