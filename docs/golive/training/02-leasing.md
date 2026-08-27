# Quick Guide — Leasing

**Note on format:** text-only, no screenshots — see `01-sales-crm.md`'s note.

## What do I use this for?

Turning a confirmed Booking into a formal Proposal, and tracking it
through approval into a signed Contract.

## What do I need to do daily?

- Check Bookings that are ready to convert to a Proposal (status ACTIVE,
  price approval not pending/rejected).
- Fill in full commercial terms on the Proposal (area, term, rent, CAM,
  deposit, escalation, etc.) — the Booking only carries the sales-side
  proposed numbers; the Proposal is where the real terms are recorded.
- Submit completed Proposals for approval, and track where they are in
  the approval chain.

## Critical workflow

```text
Booking (ACTIVE)
  → Convert to Proposal — fills in full commercial terms
  → Submit for approval — this locks the terms as of that moment; later
     edits to the Booking do NOT change the submitted Proposal
  → Approval workflow runs (see the Approver guide) — you'll be notified
     when it's approved, rejected, or needs a tenant assigned
  → Once approved AND a tenant is linked, a Contract is created
     automatically in DRAFT status
```

**A Proposal needs a tenant.** If the Booking's Lead doesn't already
have a linked Customer/Tenant, you'll need to assign one before the
Contract can be created — otherwise the approved Proposal will sit
waiting with a "needs tenant" notification.

## Common errors

- **"Approval policy is not configured"** on submit — this is a system
  configuration gap, not something you can fix; escalate to Admin.
- **"No approval step matched"** on submit — same as above, the approval
  rules don't cover this proposal's combination of discount/rent-free/
  price-deviation; escalate to Admin.
- **Can't activate a Contract** — check the "activation readiness" panel
  on the Contract detail screen; it lists exactly what's missing (dates,
  amounts, tenant/unit status).

## Where to get support

See `docs/golive/SUPPORT_MODEL.md`.
