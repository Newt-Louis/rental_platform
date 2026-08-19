# Quick Guide — Administrator

**Note on format:** text-only, no screenshots — see `01-sales-crm.md`'s note.

## What do I use this for?

User management, permissions/mall access, system configuration
(approval policy rules, fitout stage config, SLA policies, billing
config), and monitoring system health.

## What do I need to do daily / regularly?

- Check `GET /api/operations/jobs` (or the equivalent admin screen if
  one exists) for any scheduled job showing `FAILED` status or
  `consecutiveFailures >= 2` — this is the authoritative way to know a
  background process (invoice generation, dunning, SLA checks, booking
  expiry, email delivery) actually ran successfully, not just that the
  container is up.
- Check `GET /api/operations/metrics` periodically for error-rate trends.
- Review new user requests and mall-access assignments.

## Critical workflow — user & access management

```text
Create user → assign Role → assign Mall access (UserMallAccess)
```

**A user with a role but no mall access may not see mall-scoped data
correctly** — most modules filter by accessible malls; a role alone
isn't the same as being granted a specific mall.

## Critical workflow — basic recovery

- **A scheduled job failed once** — usually safe to just wait for the
  next scheduled run (most jobs are idempotent/self-healing on retry).
- **A scheduled job has failed repeatedly (`consecutiveFailures >= 2`)** —
  check the backend logs around the failure's `lastStartedAt` timestamp
  for the actual error; do not manually re-trigger a job's underlying
  service method unless you've confirmed it's safe to run twice for that
  specific job.
- **A user reports they can't log in** — check whether `JWT_SECRET` was
  recently rotated (this invalidates all existing sessions, which is
  expected) and whether Redis is reachable (affects the revoked-token
  check).

## Common errors

- **"Approval policy is not configured"** appearing for leasing staff —
  you need to create at least one active `ApprovalPolicyRule` before
  Proposals can be submitted.
- **Reconciliation script reports a finding** — see
  `scripts/backbone-reconciliation.mjs`; investigate, do not blindly
  "fix" data by hand.

## Where to get support

You're likely the escalation point for L1/L2 (`docs/golive/SUPPORT_MODEL.md`)
— for anything beyond the recovery steps above, this is a P1/P2 that goes
to the engineering team (L3).
