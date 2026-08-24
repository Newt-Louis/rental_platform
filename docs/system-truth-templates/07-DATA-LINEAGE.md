# System Truth — 07 — Data Lineage

> **TEMPLATE — NOT YET POPULATED.** For key financial/status fields,
> trace where the value originates and every place it is copied,
> derived, or re-displayed downstream.

## Per-field lineage record

### Field: [entity.field]
- **Origin (where first set):** (module, code path)
- **Copied to (snapshotted elsewhere — list each destination and
  whether it stays in sync or is frozen at copy time):**
- **Derived values computed from this field (formula, location):**
- **Display surfaces (UI pages/components that render it):**
- **Export surfaces (files/reports that include it):**
- **Can this field change after creation? If yes, do all downstream
  copies/derivations update, or drift?**

## Priority fields to trace first

- Contract value / currency
- Invoice total / paid / outstanding
- Booking/Slot price
- Contract status, Invoice status
- Mall/Company assignment on Contract and Tenant

## Drift risk register

(Any field found to be copied without a defined re-sync mechanism —
these are `ARCHITECTURE_CONTRADICTIONS.md` or risk-register candidates.)

| Field | Copies found | Sync mechanism | Drift risk |
|---|---|---|---|
