# 09 — Rollout Plan (NOT executed)

Per the program's instructions, this is a plan only. No module outside the 3
Golden UI pages was touched.

## Wave A — Core Leasing

CRM, Bookings (already done — Golden), Proposals, Approvals, Contracts,
Billing (already done — Golden). Remaining in this wave: CRM, Proposals,
Approvals, Contracts. Highest priority — same business process the Golden
pages already cover, so the new `ERPStatCard`/`ERPStatusBadge`/`ERPToolbar`/
`ERPAmount`/`ERPSection` components apply directly with minimal new pattern
work.

## Wave B — Operations

Spaces, Fitout, Work Orders, Tickets, Patrol, Inventory. Note: per
`docs/audit/10-DESIGN-SYSTEM-AUDIT.md`, **Tickets is already the platform's
best-executed screen** and should be used as an additional reference
alongside the Golden pages when this wave starts, not redesigned from
scratch.

## Wave C — Finance / Tenant

Service Contracts, Parking, Sales, Tenant Portal, Tenants.

## Wave D — Reporting / Platform

Dashboard (done — Golden), Reports, Analytics, SAP, Admin, AI.

## Per-wave process (recommended, not started)

1. Apply the token/component swaps mechanically first (surface tokens,
   `PageHeader`, `AsyncState`, status badges, KPI tiles) — this is the
   majority of the diff and the lowest risk.
2. Run that module's existing test suite before/after via `git stash` diff,
   the same verification method used for the Golden pages
   (`07-GOLDEN-UI-SELECTION.md`) and the prior Option B implementation.
3. Only then consider structural changes (e.g. adopting `ERPDataTable`-style
   primitives for a genuinely new table) — don't bundle restyling with
   restructuring in the same change.

## Explicitly still open after Golden UI (carried over, not solved here)

- Mobile card-fallback for wide tables (`ERP_UX_STANDARD.md`'s mobile rule,
  flagged as unverified in `docs/audit/10-DESIGN-SYSTEM-AUDIT.md`).
- Two confirm-dialog components (`ConfirmDialog` vs `ConfirmActionDialog`) —
  consolidation was already recommended pre-this-program; still pending.
- A scrolling tab primitive for Fitout (~15 tabs)/Billing (11)/Contracts (7).
- Sort/column-visibility for tables — no page has this today; not fabricated
  for Golden UI, tracked as real future work if a page actually needs it.
