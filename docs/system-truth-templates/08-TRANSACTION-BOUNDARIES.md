# System Truth — 08 — Transaction Boundaries

> **TEMPLATE — NOT YET POPULATED.** Document what is/isn't atomic today,
> for every multi-step write that should logically succeed or fail
> together.

## Per-operation record

### Operation: [name, e.g. "Contract → Billing schedule generation"]
- **Steps involved:**
- **Currently wrapped in a DB transaction?** yes/no
- **File:line of the transaction boundary (if any):**
- **What happens on partial failure today (verified, not assumed):**
- **Should be atomic? (business judgment — if unclear, raise BC-xxx)**
- **Risk if not atomic:** P0/P1/P2/P3

## Known multi-step operations to check first

- Booking creation → Slot allocation
- Contract creation → Billing schedule generation
- Invoice generation → Notification dispatch
- Proposal → Contract conversion (`ProposalContractConversion`)
- Fitout phase transition → Handover trigger
- Payment recording → Invoice status update → Outstanding recalculation

## Findings register

| Operation | Atomic? | Evidence | Risk |
|---|---|---|---|
