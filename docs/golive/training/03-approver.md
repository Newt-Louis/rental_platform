# Quick Guide — Approver / Manager

**Note on format:** text-only, no screenshots — see `01-sales-crm.md`'s note.

## What do I use this for?

Reviewing and deciding on Proposals (and, for Fitout, Submittals) that
have been routed to you for approval, based on configured policy rules
(discount thresholds, rent-free days, price deviation, AR debt, etc.).

## What do I need to do daily?

- Check your Approvals queue (`/approvals`) — items are only shown to you
  if you're the configured approver role for that specific step, or
  specifically assigned.
- Decide: Approve or Reject, with a comment where useful. Steps run in
  order — you can't approve a step out of sequence, and the system won't
  show it to you until earlier steps are done.

## Critical workflow

```text
Proposal (or Fitout Submittal) submitted
  → Approval steps generated automatically from policy rules
  → Each step's assigned role/person sees it in their queue, in order
  → You approve or reject your step
  → If you're the last step and approve → the whole workflow completes
     → for a Proposal, this auto-creates a Contract (if a tenant is
        already linked)
  → If you reject at any step → the whole workflow stops there; for a
     Proposal, it goes back to REJECTED status (a new Proposal is needed,
     this one can't be resubmitted)
```

## Common errors

- **You don't see an item you expected** — either an earlier step hasn't
  approved yet, or you're not the configured approver for that step
  (check with Admin if you believe you should be).
- **"Forbidden" trying to approve** — the step is assigned to a specific
  person (not just a role), and it isn't you.

## Where to get support

See `docs/golive/SUPPORT_MODEL.md`.
