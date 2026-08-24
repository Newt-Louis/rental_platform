# Quick Guide — Sales / CRM

**Note on format:** text-only, no screenshots — this environment has no
tooling to capture live-UI screenshots. Add screenshots in a follow-up
pass once someone with UI access reviews this guide against the actual
running app.

## What do I use this for?

Managing Leads from first contact through to a Booking — the CRM module
(`/crm`) is where a prospective tenant's information lives before they
have a formal reservation on a unit.

## What do I need to do daily?

- Check your assigned Leads and their current stage (New → Contacted →
  Qualified → Proposal → Negotiation → Won/Lost).
- Follow up on Leads that are due — use the CRM's follow-up view rather
  than tracking this yourself in a spreadsheet.
- Move a Lead's stage forward as the real conversation progresses — the
  system doesn't do this automatically except when a Booking is created
  for the Lead (which auto-advances it to "Proposal" stage).

## Critical workflow

```text
Create/update a Lead
  → record contact details, category, mall
→ Create a Booking for the Lead (from the Bookings screen, or linked
   from the Lead) once they want to hold a specific unit
  → the unit becomes reserved for them (or queued, if someone already
     holds it)
```

You don't create a Proposal directly from CRM — that happens from the
Booking once it's confirmed. See the Leasing guide.

## Common errors

- **"Mặt bằng đang bị khoá" (unit is locked)** when creating a Booking —
  the unit is already under negotiation, contracted, or otherwise
  unavailable. Check the unit's current status on the Spaces screen
  before trying again.
- **A Booking shows as "PENDING" not "ACTIVE"** — someone else already
  holds priority 1 on that unit. You're in the queue; you'll be promoted
  automatically if they cancel or their hold expires.

## Where to get support

See `docs/golive/SUPPORT_MODEL.md`. For anything that looks like a system
error (not just "I don't know how"), include the Reference ID shown with
the error message.
