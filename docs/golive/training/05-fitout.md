# Quick Guide — Fitout / Operations

**Note on format:** text-only, no screenshots — see `01-sales-crm.md`'s note.

## What do I use this for?

Managing a tenant's fitout process from contract signing through to
handover/opening — stage tracking, document submittals, SLA monitoring,
and issue/punch-list tracking.

## What do I need to do daily?

- Check your assigned Fitout projects' current stage and any pending
  submittals awaiting your review or approval.
- Watch for SLA warnings — the system emails/notifies you and your
  escalation contact if a stage is approaching or past its target date.
- Log/track defects and issues (punch list) as you find them during site
  visits.

## Critical workflow

```text
Contract activated
  → Fitout project auto-created at the first stage (Contract Signed)
  → Tenant/team submits required documents per stage (drawings, permits,
     certificates — the exact list depends on which stage you're trying
     to reach)
  → Documents go through an approval workflow (see Approver guide)
  → Once required documents for a stage are approved, you can advance
     the project to the next stage
  → Final stage is "Opened" — this marks the unit as Occupied
```

**You cannot skip a stage**, and **you cannot advance past a stage
that's missing required approved documents** unless you use the override
option with a documented reason (this is logged and auditable — don't use
it routinely).

## Common errors

- **"Gate requirements not met for target stage"** — one or more required
  documents for that stage aren't approved yet. The error tells you
  exactly which ones are missing.
- **"Cannot advance fitout stage: contract is ... not ACTIVE or
  EXPIRING"** — the contract behind this fitout project has been
  terminated or otherwise left an active state; this project shouldn't
  normally still be progressing — escalate as a P2.
- **A stage-advance says "status changed... please refresh"** — someone
  else (or an automated process) changed this project's stage moments
  before your request landed. Refresh the page and try again — this is
  the system correctly preventing a conflicting update, not a bug.

## Where to get support

See `docs/golive/SUPPORT_MODEL.md`.
