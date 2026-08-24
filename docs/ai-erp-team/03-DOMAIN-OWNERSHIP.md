# 03 — Domain Ownership

## Important caveat

> **Agent ownership is not necessarily business data ownership.**

The mapping below assigns each module to the Functional Consultant *role*
responsible for its business correctness review. It is a starting
hypothesis for routing review, not a statement of which module's
database tables/entities are canonically written by which service.
**Actual data ownership must come from System Truth**
(`docs/system-truth-templates/03-DATA-OWNERSHIP.md`), which verifies, per
entity, which module's code path actually performs writes — this can
differ from the "obvious" functional owner (e.g. a Contract entity might
have fields legitimately written by both Contracts and Billing).

## Initial ownership mapping

| Module | Functional Owner (review role) |
|---|---|
| CRM | Leasing Functional Consultant |
| Bookings (`booking`) | Leasing Functional Consultant |
| Proposals | Leasing Functional Consultant |
| Approvals | Leasing Functional Consultant |
| Contracts | Leasing Functional Consultant |
| Billing | Finance Functional Consultant |
| Spaces | Mall Operations Consultant |
| Slots | Mall Operations Consultant |
| Fitout | Fitout Functional Consultant |
| Work Orders | Mall Operations Consultant |
| Tickets | Tenant Experience Consultant |
| Patrol | Mall Operations Consultant |
| Inventory | Mall Operations Consultant |
| Service Contracts | Service Contract Consultant |
| Parking / Parking Dashboard | Parking Consultant |
| Sales | Sales/Revenue Share Consultant |
| SAP | SAP/Integration Architect |
| Tenants | Tenant Experience Consultant |
| Tenant Portal | Tenant Experience Consultant |
| Dashboard | Reporting Architect |
| Reports | Reporting Architect |
| Analytics | Reporting Architect |
| Pipeline Stats | Reporting Architect |
| Auth | Security Architect |
| Users | Security Architect |
| Categories | Master Data Architect |
| Branding | ERP UX Architect |
| Announcements | Tenant Experience Consultant |
| Audit Log | Security Architect |
| Notifications | Reliability Architect |
| AI | Chief ERP Architect (novel/cross-cutting; assign per feature) |
| Telemetry | Reliability Architect |

## Cross-cutting overlays (apply regardless of module)

- Any money field/formula in any module → also reviewed by Financial
  Data Architect.
- Any currency-touching change in any module → also reviewed by
  Multi-Currency Architect per
  `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`.
- Any Mall/Company scoping in any module → also reviewed by
  Multi-Company/Multi-Mall Architect.
- Any state-machine change in any module → also reviewed by Workflow
  Architect.
- Any new/changed endpoint in any module → also reviewed by Security
  Architect for authorization correctness.

## Verification required

Treat this table as unverified until `docs/system-truth-templates/
02-DOMAIN-OWNERSHIP.md` and `03-DATA-OWNERSHIP.md` are populated by
System Truth reconstruction. Update this file once actual data ownership
findings contradict or refine it.
