# 04 — Business Process Catalog

These are starting hypotheses for the platform's major end-to-end
business processes, used to scope Change Requests' "AFFECTED JOURNEYS"
section and to anchor Golden E2E Scenarios
(`docs/ai-governance/05-E2E-QUALITY-GATES.md`). **System Truth must
verify these against actual code** — see
`docs/system-truth-templates/01-END-TO-END-BUSINESS-PROCESS.md`.

```text
BP-001  Lead-to-Lease              CRM → Booking → Proposal → Approvals → Contract
BP-002  Contract-to-Cash           Contract → Billing → Invoice → Payment
BP-003  Contract-to-Fitout-to-Handover   Contract → Fitout phases → Handover
BP-004  Tenant-to-Ticket-to-Resolution   Tenant Portal → Tickets → Work Orders
BP-005  Parking-to-Cash            Parking → Billing/Payment
BP-006  Service-Contract-to-Cash   Service Contracts → Billing → Invoice
BP-007  Sales-to-Revenue-Share     Sales → revenue-share calculation → Reports
BP-008  Short-Term Slot Booking    Slots → Booking (hourly/daily/monthly)
BP-009  Work-Order Operations      Work Orders → Patrol/Inventory
BP-010  SAP Integration            Platform ↔ SAP data exchange
BP-011  Management Reporting       Contracts/Billing/Sales → Dashboard/Reports/Analytics
BP-012  Tenant Self-Service        Tenant Portal (billing view, tickets, documents)
BP-013  Multi-Mall Operations      Cross-Mall visibility/aggregation for Company-level roles
```

## Status

These are hypotheses, not verified fact. In particular:

- BP-001 through BP-004 map closely to existing prior work
  (`docs/program/02-E2E-WORKFLOW.md`, `07-CRM-BOOKING-*`,
  `03-CONTRACT-*`, `05-FITOUT-*`) and should be reconciled with those,
  not re-derived blind.
- BP-013's actual scope (which roles get cross-Mall visibility, and for
  what) is likely an open Business Confirmation item — do not assume.
- New processes may be discovered during System Truth reconstruction
  (e.g. Inventory's role may turn out to be its own process rather than
  purely a Work Orders sub-flow). Add `BP-01x` entries as needed; do not
  force new findings into the list above if they don't fit.

Each BP, once verified, should be detailed using
`docs/system-truth-templates/01-END-TO-END-BUSINESS-PROCESS.md` and have
at least one corresponding Golden Scenario in
`docs/ai-governance/05-E2E-QUALITY-GATES.md`.
