# System Truth — 18 — System Integrity Checks

> **TEMPLATE — NOT YET POPULATED.** Executable or manual checks that
> verify the invariants and reconciliation points found elsewhere in
> System Truth actually hold in real/current data — the operational
> counterpart to `06-BUSINESS-INVARIANTS.md`.

## Per-check record

### Check: [name]
- **What it verifies (references INV-xxx or a reconciliation point):**
- **How to run it (script/query location, or "not yet implemented"):**
- **Frequency (continuous / scheduled / manual / not yet run):**
- **Last run result (if ever run):**
- **Owner (role responsible for acting on failures):**

## Candidate checks to establish

- Sum of Invoice outstanding == Sum of Contract billed − Sum of
  payments recorded, per Contract.
- Every Invoice's currency == its Contract's currency.
- No two active Contracts reference the same Unit for overlapping
  periods.
- Every Booking's Slot allocation has no time overlap with another
  Booking for the same Slot.
- Dashboard/Reports totals reconcile against Billing module's own
  totals for the same period/scope.
- Every Tenant Portal-visible Invoice belongs to that Tenant.

## Status

This document is a design surface, not an implemented monitoring system.
Whether any of these checks exist as running code (vs. this being the
first time they're specified) must be verified against
`01-PLATFORM-SCOPE.md`'s "Reconciliation" cross-cutting capability
finding in `00-SYSTEM-OVERVIEW.md`.
