# System Truth — Journey / Module Matrix

Verified module sequences per journey (supersedes the hypothesis copy in the template).

| BP-xxx | Modules involved (verified order) |
|---|---|
| BP-001 Lead-to-Lease | CRM(Lead) → Booking → Proposals → Approvals → Contracts → (CRM Customer creation, best-effort side effect) |
| BP-002 Contract-to-Cash | Contracts → Billing (schedule) → Billing (Invoice) → Billing (Payment) → Billing (AR aging/dunning) |
| BP-003 Contract-to-Fitout-to-Handover | Contracts (`contract.activated` event) → Fitout (9-stage) → Spaces (`UnitStatusService`, stages 6 & 9) |
| BP-004 Tenant-to-Ticket-to-Resolution | Tenant Portal (frontend) → Tickets → Notifications (staff-created inspection tickets only) |
| BP-005 Parking-to-Cash | Parking → Billing (invoice create + write-back) |
| BP-006 Service-Contract-to-Cash | Service Contracts → Billing (invoice create, 2 independent paths + write-back) |
| BP-007 Sales-to-Revenue-Share | Sales → Billing (`calculateRevenueShare` read) |
| BP-008 Short-Term Slot Booking | Slots → Billing (invoice create + read pending receivables) |
| BP-009 Work-Order Operations | Patrol → Work Orders (one-way only; Inventory and Tickets NOT involved, corrected from hypothesis) |
| BP-010 SAP Integration | Billing/CRM/Tenants (source data, manually triggered) → SAP (push) → SAP (reconciliation, manual) |
| BP-011 Management Reporting | Contracts/Billing/Sales/Units (source data) → Dashboard, Reports, Analytics, AI (5-7 independent reimplementations, not a shared pipeline) |
| BP-012 Tenant Self-Service | Tenant Portal → Tickets, Billing (read), Sales (submit), Announcements (read) |
| BP-013 Multi-Mall Operations | Dashboard (correctly gated) + Analytics/Reports/AI (incorrectly ungated — same effective capability, wider role access) |

## Reverse lookup: module → journeys it participates in

| Module | Journeys (BP-xxx) |
|---|---|
| crm | BP-001 |
| booking | BP-001 |
| proposals | BP-001 |
| approvals | BP-001 |
| contracts | BP-001, BP-002, BP-003 |
| billing | BP-002, BP-005, BP-006, BP-007, BP-008, BP-010, BP-011, BP-012 |
| fitout | BP-003 |
| spaces | BP-003, BP-013 |
| tickets | BP-004, BP-009 (not — corrected, see BP-009), BP-012 |
| notifications | BP-004, BP-011 (indirectly, AI insights) |
| parking | BP-005 |
| parking-dashboard | (not part of any BP-xxx journey — separate external system) |
| service-contracts | BP-006 |
| sales | BP-007, BP-012 |
| slots | BP-008 |
| patrol | BP-009 |
| work-orders | BP-009 |
| inventory | (not part of BP-009 — corrected; independent) |
| sap | BP-010 |
| dashboard, reports, analytics, ai | BP-011, BP-013 |
| tenants | BP-004, BP-012 |
| auth, users | (cross-cutting, all journeys via authentication) |
| categories | BP-001 (pricing validation) |
| audit-log | (cross-cutting, records mutations across all journeys) |
| announcements | BP-012 |
| telemetry, branding | (not part of any business journey — pure platform utility) |

## Use when scoping a CR

If changing module X, cross-reference this table for which Golden Scenarios (`17-E2E-GOLDEN-SCENARIOS.md`) and which journeys (`BUSINESS_CONFIRMATION_REQUIRED.md`/`ARCHITECTURE_CONTRADICTIONS.md` entries tagged with that BP) must be re-verified.
