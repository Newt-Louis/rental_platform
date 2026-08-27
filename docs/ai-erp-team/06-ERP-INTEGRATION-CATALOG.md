# 06 — ERP Integration Catalog

## Format

Every integration (internal cross-module or external, e.g. SAP) gets an
`INT-xxx` entry with this profile:

```text
INT-xxx

SOURCE            — originating system/module
DESTINATION       — receiving system/module
PURPOSE           — business reason for the integration
TRIGGER           — what initiates a transfer (event, schedule, manual)
PROTOCOL          — HTTP/REST, message queue, direct DB, file, etc.
PAYLOAD           — shape/schema of data exchanged
MAPPING           — field-level mapping between source and destination
AUTHENTICATION    — how the integration authenticates
IDEMPOTENCY       — how duplicate delivery is handled
RETRY             — retry policy on failure
FAILURE           — what happens on unrecoverable failure (dead-letter,
                    alert, silent drop — silent drop is never acceptable)
RECONCILIATION    — how consistency between source and destination is
                    verified over time
MONITORING        — what observability exists for this integration
OWNER             — responsible Architect role
```

## Known integrations to catalog (starting list, unverified)

- `INT-001` — SAP module ↔ external SAP system (owner: SAP/Integration
  Architect).
- `INT-002` — Contract → Billing (internal; billing schedule generation
  from contract terms).
- `INT-003` — Booking → Proposal → Contract conversion chain (internal;
  see existing `apps/frontend/src/pages/bookings/proposal-prefill.ts`
  and `ConvertToProposalDialog.tsx` as current implementation entry
  points).
- `INT-004` — Contract → Fitout kickoff (internal).
- `INT-005` — Billing → Notifications (payment reminders, overdue
  notices).
- `INT-006` — Tenant Portal ↔ core platform (Tickets, Billing view,
  Documents — internal but crosses the tenant-facing trust boundary,
  treat with Security Architect review).
- `INT-007` — Platform → Reports/Analytics/Dashboard (internal,
  read-heavy aggregation).

## Status

This is an initial hypothesis list, not a verified catalog. System Truth
reconstruction (`docs/system-truth-templates/05-CROSS-MODULE-CONTRACTS.md`
and `09-EVENT-CATALOG.md`) must enumerate the actual integrations —
including ones not anticipated here — from the outbox/event/job code and
actual API call graph, and fill in each `INT-xxx` profile with verified
detail, not assumptions.
