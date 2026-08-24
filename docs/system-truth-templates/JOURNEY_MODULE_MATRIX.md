# System Truth — Journey / Module Matrix

> **TEMPLATE — NOT YET POPULATED.** Which modules participate in each
> business journey (`BP-xxx` / `GS-xx`) — used to scope a CR's AFFECTED
> JOURNEYS section quickly and to know which Golden Scenarios must be
> re-run for a given module change.

## Matrix

| BP-xxx / GS-xx | Modules involved (in order) |
|---|---|
| BP-001 Lead-to-Lease | CRM → Booking → Proposals → Approvals → Contracts |
| BP-002 Contract-to-Cash | Contracts → Billing |
| BP-003 Contract-to-Fitout-to-Handover | Contracts → Fitout |
| BP-004 Tenant-to-Ticket-to-Resolution | Tenant Portal → Tickets → Work Orders |
| BP-005 Parking-to-Cash | Parking → Billing |
| BP-006 Service-Contract-to-Cash | Service Contracts → Billing |
| BP-007 Sales-to-Revenue-Share | Sales → Reports |
| BP-008 Short-Term Slot Booking | Slots → Booking |
| BP-009 Work-Order Operations | Work Orders → Patrol/Inventory |
| BP-010 SAP Integration | SAP ↔ (multiple) |
| BP-011 Management Reporting | Contracts/Billing/Sales → Dashboard/Reports/Analytics |
| BP-012 Tenant Self-Service | Tenant Portal |
| BP-013 Multi-Mall Operations | (cross-cutting) |

(Above is copied from the `04-BUSINESS-PROCESS-CATALOG.md` hypothesis as
a starting point — replace with verified module sequences once
`01-END-TO-END-BUSINESS-PROCESS.md` is populated. Add GS-xx rows once
`17-E2E-GOLDEN-SCENARIOS.md` is populated.)

## Reverse lookup: module → journeys it participates in

| Module | Journeys (BP-xxx / GS-xx) it appears in |
|---|---|

Use this reverse lookup when scoping a CR: "if I change module X, which
Golden Scenarios must I re-verify?"
