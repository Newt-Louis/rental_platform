# Job Reliability — Distributed Scheduler Locks

**Status:** RESOLVED (code + DI-verified live) · 2026-08-19 · Sprint:
Production Hardening A

## Inventory

Grepped every file with `@Cron(...)` (20 files) against existing
`SchedulerLockService`/`schedulerLock` usage to find the actual gap, rather
than assuming the Gate Review's "6 jobs" list without checking. Result:
**14 of 20 files already had lock coverage** via the existing
`SchedulerLockService.runExclusive()` (Redis-backed, TTL + safe release,
single-instance fallback if Redis is down — already the right shape for
section 22/23's requirements, reused as-is). The gap was exactly 6 files —
matching the Gate Review's count once the one confirmed-dead entry is
accounted for:

| File | Cron jobs | Had lock? | Action |
|---|---|---|---|
| `modules/analytics/contract-expiry.scheduler.ts` | 1 | No | **Confirmed dead code** — see below, not wrapped |
| `modules/parking/parking.service.ts` | 1 (`generateDueStatements`) | No | Wrapped |
| `modules/patrol/patrol.service.ts` | 2 (`markOverdueShifts`, `generateScheduledShifts`) | No | Both wrapped |
| `modules/service-contracts/service-contract-reminder.scheduler.ts` | 1 (`run`) | No | Wrapped |
| `modules/tickets/tickets.service.ts` | 1 (`sendMaintenanceReminders`) | No | Wrapped |
| `modules/work-orders/work-orders.service.ts` | 2 (`generateScheduledWorkOrders`, `sendOverdueReminders`) | No | Both wrapped |

**7 real jobs across 5 files fixed.**

## Dead code found, deliberately not touched

`analytics/contract-expiry.scheduler.ts` exports a `ContractExpiryScheduler`
class with the same name as `notifications/contract-expiry.scheduler.ts` —
but only the `notifications/` one is registered as a provider anywhere
(`notifications.module.ts`). Confirmed via `grep -rn "ContractExpiryScheduler"`
across `src/`: the `analytics/` version is never imported into any module's
`providers` array, so NestJS never instantiates it and its `@Cron()` never
registers with the scheduler. It cannot run, so it needs no lock.

**Not deleted in this pass**, despite being confirmed dead: its spec file
(`analytics/contract-expiry.scheduler.spec.ts`) is the *only* test coverage
of the 180/90/60/30-day contract-expiry-threshold logic in the codebase —
the real, running `notifications/contract-expiry.scheduler.ts` has no tests
of its own. Deleting the dead file would silently drop that coverage.
Properly resolving this (port the tests to target the real scheduler, then
delete the duplicate) is a real but separate cleanup task, out of scope for
"add missing locks" — flagged here as a follow-up, not executed.

## Pattern applied (matches the codebase's own existing convention)

Every fix follows the exact shape already used in `ar-dunning.service.ts`
and `fitout-sla.service.ts`: the `@Cron`-decorated method becomes a thin
wrapper that calls `schedulerLock.runExclusive(name, ttlMs, () =>
this.xxxUnlocked())`; the actual logic moves to a private `xxxUnlocked()`
method, unchanged. `SchedulerLockService` is injected via each class's
constructor — it's provided by the `@Global()` `CommonModule`, so no module
wiring was needed beyond the constructor parameter itself.

TTLs chosen to comfortably exceed each job's own expected runtime while
still releasing well before the next scheduled run: 14,400,000 ms (4h,
matching the existing convention for daily jobs) for
`parking-contract-billing`, `maintenance-due-reminders`,
`work-order-template-generator`, `work-order-overdue-reminders`,
`service-contract-reminders`; shorter TTLs for the two frequent patrol jobs
so a stuck lock can't block many subsequent runs — 600,000 ms (10 min) for
the `*/15 * * * *` overdue monitor, 1,200,000 ms (20 min) for the
`*/30 * * * *` schedule generator.

## Files

- `apps/backend/src/modules/parking/parking.service.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/patrol/patrol.service.ts`
- `apps/backend/src/modules/service-contracts/service-contract-reminder.scheduler.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/tickets/tickets.service.ts` (+ `maintenance-workflow.spec.ts` constructor fix)
- `apps/backend/src/modules/work-orders/work-orders.service.ts`

## Tests

- New: lock-wrapping tests for `parking.service.spec.ts` (2 new — job runs
  under the lock with the right name/TTL; job body doesn't execute when the
  lock reports `executed: false`) and
  `service-contract-reminder.scheduler.spec.ts` (2 new, same shape).
- Fixed constructor call sites broken by the new required
  `schedulerLock` parameter: `maintenance-workflow.spec.ts` (`TicketsService`).
  `patrol`/`work-orders` had no existing spec files to fix.
- Full backend suite: 302 passed / 7 failed (same 2 pre-existing failing
  suites as every prior gate, unrelated). `npx tsc --noEmit` — 0 errors.
- **Live-verified**: rebuilt the Docker backend image with all 5 changed
  constructors; container starts healthy and `/api/health` returns 200 — a
  DI wiring mistake in any of the 5 modified constructors would have failed
  NestJS's dependency resolution at boot, not silently passed.

## Not done in this pass

- No job ledger yet (see `docs/reliability/` — separate section of this
  sprint, not yet reached at time of writing).
- The dead `analytics/contract-expiry.scheduler.ts` cleanup described above.
