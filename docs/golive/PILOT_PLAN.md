# Pilot Plan (proposal — not yet started)

**Date:** 2026-08-19. This is a plan to execute once
`docs/golive/GO_LIVE_BLOCKERS.md`'s pilot-entry criteria are met — it is
not itself evidence that a pilot has run.

## Scope

| | |
|---|---|
| Mall | One real Mall — this environment's seed only has one ("THISO Mall Sala"); a real pilot should use an actual operating Mall, decided by the business, not necessarily this one |
| Users | Small group, real staff, one person per critical role (Leasing, Manager/Approver, Finance, Fitout/Operations, Admin) plus 2-3 real tenant-portal users |
| Data scope | Real business data for the pilot Mall — not synthetic/demo data, per this workstream's own rule against "fake demo data as pilot" |
| Duration | Long enough to observe at least one full cycle of: a new Lead through Booking/Proposal/Approval/Contract, one Billing cycle (schedule → invoice → payment), and — if fitout is active for any pilot unit — at least one stage advance. Exact duration depends on the pilot Mall's actual transaction cadence, not fixed here |

## Start criteria (references `GO_LIVE_BLOCKERS.md` — not repeated in full here)

Pilot may begin only when GL-01 (credentials), GL-02 (off-site DB
backup), GL-04 (git history) are `DONE`, GL-03 (upload backup) is either
`DONE` or has an explicitly approved pilot-scope mitigation, and GL-05/
GL-06 (UAT, cross-Mall) are `DONE` for the pilot Mall's scope at minimum.

## Support team (pilot-specific)

Per `docs/golive/SUPPORT_MODEL.md` — for the pilot specifically, L2/L3
(this program's engineering team) should be **directly reachable**, not
just on a standard queue, given the small blast radius and high value of
fast feedback during a pilot window.

## Monitoring (pilot-specific)

Automated alerting is not expected to be mature by pilot start (see
`GO_LIVE_BLOCKERS.md` GL-07). For the pilot's duration specifically:
- A named person checks `GET /api/health/ready` and `GET /api/operations/jobs`
  on a defined schedule (e.g. twice daily) — who, and how often, is a
  decision for whoever runs the pilot, not fixed here.
- `scripts/backbone-reconciliation.mjs` run daily during the pilot (see
  "Reconciliation during pilot" below).
- This manual-watch substitute is explicitly **not** sufficient for full
  production per this program's own rule — it is a pilot-only bridge.

## Reconciliation during pilot

Run `node scripts/backbone-reconciliation.mjs` daily. Any check moving
from `CLEAN` to `FOUND` is investigated immediately, not auto-repaired —
same rule as every other use of this script throughout this program.

## Daily pilot check (what to look at each day)

```text
System availability (health endpoints)
New errors (backend logs, operations/metrics serverErrors)
Job failures (operations/jobs consecutiveFailures)
Booking conflicts (reconciliation script)
Proposal/Contract/Billing/Fitout failures (support tickets + logs)
Support requests raised
```

## Exit criteria

```text
No P0
No unresolved Critical P1
No data-integrity violation (reconciliation stays clean throughout)
No tenant-isolation violation
Critical scheduled jobs stable (0 consecutive failures at pilot end)
Pilot users completed their critical workflows without developer
  intervention
Support model actually got exercised and worked (at least one real
  support request handled through it)
```

## Rollback

If the pilot needs to stop: per `docs/OPERATIONS_RUNBOOK.md` §9's
rollback procedure — application-only rollback is safe if no migration
was introduced during the pilot window; if RC2+ shipped a migration
during the pilot (see `docs/golive/GO_LIVE_BOARD.md`'s change-control
rule), follow the migration-aware rollback decision tree in that same
section rather than assuming a simple container swap suffices.

## After the pilot

```text
PILOT RESULT
↓
FINAL REVIEW (against this plan's exit criteria)
↓
GO / CONDITIONAL GO / NO-GO for full production
```

Not performed as part of this workstream — the pilot itself has not
started.
