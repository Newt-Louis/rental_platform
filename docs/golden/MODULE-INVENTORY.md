# Golden ERP Module Inventory

Status: CANONICAL WORKING INVENTORY

The repository currently contains 31 backend module directories and 31 frontend page directories. This inventory groups them by business responsibility rather than treating them as isolated applications.

| Group | Primary domains | Golden state |
|---|---|---|
| Executive | Dashboard, Reports, Analytics | Dashboard protected; others pending |
| Commercial acquisition | Leads/Customers, Deals, Booking, Proposals, Approvals | Booking closed; Proposal/Approval protected active work |
| Contracting | Contracts, Templates, Documents | Contract closed |
| Financial | Billing, Invoices, Payments, Penalties/Dunning, Sales | Billing closed; correctness backlog retained |
| Space operations | Malls, Units/Spaces, Fitout, Parking | Fitout and Unit/Space presentation implemented; human visual review pending |
| Operational execution | Tickets, scheduled Maintenance, Work Orders, Patrol | Presentation implemented; human visual review pending |
| Supporting operations | Service contracts, Announcements, Notifications, Files, AI, Settings/Admin | Pending |

Every implementation wave must record exact files and routes in `GOLDEN-PROGRAM-TRACKER.md`; this document stays at domain-inventory level.
