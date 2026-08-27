# Redesign Spec — CRM & Bookings

**Purpose:** Split two of the platform's largest monolith screens (CRM ~2,500
lines, Bookings ~2,200 lines/17 dialogs per V2) into task-oriented workspaces,
and make the Lead→Booking→Proposal bridge visible instead of implicit.
**Persona:** Leasing Executive (primary), Leasing Manager.
**User goal:** Move a lead to a priced proposal without losing track of state.

## Current problems

- FR-02: Proposal creation is hidden inside Bookings.
- V2: CRM and Bookings are the two highest-complexity screens in the codebase by
  line count and dialog count.
- 03-USER-JOURNEYS Journey A: Booking is a mandatory but undiscoverable bridge
  between Lead and Proposal.

## Information hierarchy (CRM split)

- **Lead Workspace** — pipeline Kanban (New→Won/Lost), the primary daily view for
  a Leasing Executive.
- **Customer 360** — converted/qualified customer records, contact history,
  linked bookings/proposals/contracts in one place (addresses V2's
  "no visible conversion history" gap).

## Information hierarchy (Bookings split)

- **Reservation Queue** — active holds needing action (expiring soon, ready to
  convert) — this becomes the natural home for a visible "Chuyển thành đề xuất"
  action per row, closing the FR-02 gap at the source rather than only adding an
  entry point on the Proposals page.
- **Unit Availability** — calendar/grid view of what's held vs. free (existing
  long-term/short-term distinction preserved).
- **Pricing** — scenario/rate reference, split out of the 17-dialog monolith.

## Components

- Reuse existing `CreateBookingDialog`, `ConvertToProposalDialog`,
  `UnifiedAddDialog` — this is a page-structure split, not a rebuild of the
  underlying forms (which research found are already reasonably designed:
  strong prefill, appropriately-sized field counts).

## States

- Reservation Queue empty state should explicitly explain the Lead→Booking
  prerequisite for a Proposal, closing FR-02 from the discovery side.

## Permissions

Unchanged — `LEASING_EXECUTIVE` gets Lead Workspace + Reservation Queue; broader
roles (`MALL_DIRECTOR`, `LEASING_MANAGER`) get Customer 360 + Pricing too, per
existing `ROUTE_PERMISSIONS.crm`/`.bookings`.

## Acceptance criteria

- A Leasing Executive can complete Lead→Booking→Proposal without opening more than
  2 top-level screens.
- No existing dialog/form is removed — only regrouped into a clearer page
  structure (per the audit rule against deleting functionality).

## Note on sequencing

This is a **P1, high-effort** item — sequence after the P0 fixes (Epic 1/5) and
the navigation restructure (Epic 4) land, per
[15-IMPLEMENTATION-BACKLOG](../audit/15-IMPLEMENTATION-BACKLOG.md) Epic 7.
