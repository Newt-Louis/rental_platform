# Golden ERP Module Inventory

Status: CANONICAL WORKING INVENTORY

The repository currently contains 31 backend module directories and 31 frontend page directories. This inventory groups them by business responsibility rather than treating them as isolated applications.

| Group | Primary domains | Golden state |
|---|---|---|
| Executive | Dashboard, Reports, Analytics | Dashboard protected audit complete; Reporting/Analytics presentation implemented; Compliance authorization and rendered human review pending |
| Commercial acquisition | Leads/Customers, Deals, Booking, Proposals, Approvals | Booking closed; Booking reference-state localization standardized; Proposal/Approval protected active work |
| Contracting | Contracts, Templates, Documents | Contract closed |
| Financial | Billing, Invoices, Payments, Penalties/Dunning, Sales | Billing closed; reference invoice/schedule labels standardized; correctness backlog retained |
| Space operations | Malls, Units/Spaces, Fitout, Parking | Fitout and Unit/Space presentation implemented; human visual review pending |
| Operational execution | Tickets, scheduled Maintenance, Work Orders, Patrol | Presentation implemented; staff-role presentation standardized; human visual review pending |
| Supporting operations | Service contracts, Parking, SAP, Audit/Profile, Announcements, Notifications, Files, AI, Settings/Admin | Admin plus Waves 8–9 presentation consistency implemented; human visual review pending; remaining internal tools audited but not Golden Closed |

Every implementation wave must record exact files and routes in `GOLDEN-PROGRAM-TRACKER.md`; this document stays at domain-inventory level.
