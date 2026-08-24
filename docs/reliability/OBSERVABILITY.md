# Observability — Job Ledger, Frontend Telemetry, Health, Alerts

**Status:** RESOLVED (code + test-verified) · 2026-08-19 · Sprint: Production
Hardening A

Before this pass, "is the platform healthy" required grepping container
logs. Nothing answered "when did job X last run, did it succeed, is it
failing repeatedly" without a log search, and unhandled frontend errors
went to the browser console only — invisible to anyone not looking at that
one user's DevTools at that exact moment. This closes both gaps.

## 1. Job Execution Ledger

Every job in the codebase that runs through `SchedulerLockService.
runExclusive()` (see [JOB_RELIABILITY_LOCKING.md](JOB_RELIABILITY_LOCKING.md) —
now all real, running jobs) now gets one `JobExecution` row per attempt.

**Why instrument `runExclusive()` and not each job individually:** every
scheduled job already routes through this one method for its distributed
lock. Instrumenting it once gives ledger coverage for all ~14 jobs for free,
with zero changes to the job files themselves.

Schema (`apps/backend/prisma/schema.prisma`, migration
`20260819100000_job_execution_ledger`):

```prisma
model JobExecution {
  id           String    @id @default(cuid())
  jobName      String
  instance     String    // hostname:pid - identifies which replica ran it
  status       String    // RUNNING | SUCCEEDED | FAILED | SKIPPED_LOCKED
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
  durationMs   Int?
  errorSummary String?   // truncated message only - never a full stack trace
  createdAt    DateTime  @default(now())

  @@index([jobName, startedAt])
  @@index([jobName, status, startedAt])
}
```

Deliberately does not store job payload or business data (e.g. "which
records were processed") — this is an execution ledger, not an audit trail
of what each job did. `errorSummary` is capped to 500 characters and holds
only `error.message`, never a stack trace.

**Behavior in `SchedulerLockService.runExclusive()`:**
- Lock acquired, task runs → `RUNNING` row written before the task starts,
  updated to `SUCCEEDED`/`FAILED` (with `finishedAt`, `durationMs`, and — on
  failure — a truncated `errorSummary`) when the task settles.
- Lock not acquired (another instance owns it) → a `SKIPPED_LOCKED` row is
  written immediately, so a job that never runs on a given tick is
  distinguishable from one that ran and succeeded quietly.
- Redis disabled (single-instance fallback) → still recorded, same as the
  locked path.

**Ledger writes are best-effort and never block or fail the job itself**:
every read/write to `JobExecution` is wrapped in its own try/catch that
only logs a warning on failure. A database hiccup recording history must
never be the reason a real scheduled job (billing, reminders, SLA checks)
fails to run.

### Query surface

`GET /api/operations/jobs` (ADMIN/CEO only, same `OperationalController`
that already serves `GET /api/operations/metrics`) answers exactly the
question the sprint brief posed: *when did this job last run, did it
succeed, how long did it take, is it failing repeatedly*:

```json
{
  "jobs": [
    {
      "jobName": "parking-contract-billing",
      "lastStatus": "SUCCEEDED",
      "lastStartedAt": "2026-08-19T02:00:00.000Z",
      "lastFinishedAt": "2026-08-19T02:00:04.000Z",
      "lastDurationMs": 4210,
      "lastErrorSummary": null,
      "consecutiveFailures": 0
    }
  ]
}
```

`consecutiveFailures` looks at the last 5 runs for that job and counts back
from the most recent until it hits a non-`FAILED` status — a job that has
failed its last 3 attempts in a row is immediately visible without manually
reading rows.

## 2. Frontend Telemetry

`apps/frontend/src/components/AppErrorBoundary.tsx` previously only did
`console.error(...)` — invisible outside that one browser session. Added
`apps/frontend/src/lib/telemetry.ts`, wired into three sources:

- **React render errors** — `AppErrorBoundary.componentDidCatch`.
- **Uncaught exceptions / unhandled promise rejections** — global
  `window.addEventListener('error' | 'unhandledrejection', ...)`,
  installed once in `main.tsx` via `installGlobalErrorReporting()`.
- **API failures that indicate a real backend/infra problem** — the shared
  axios response interceptor (`lib/axios.ts`) reports on a missing response
  (network failure) or any 5xx; expected 4xx validation errors are *not*
  reported, since those are normal user-input rejections, not bugs.

Reports POST to `POST /api/telemetry/client-errors`
(`apps/backend/src/modules/telemetry/`) — `message`, optional `stack`,
`source`, `route`, `appVersion`. No user identity, no request body, no
cookies. The endpoint is intentionally `@Public()` (an error can happen on
the login screen, before any JWT exists) and is not exempt from the
existing global `ThrottlerGuard` (100 req/min); nothing is persisted, the
backend only structured-logs it (`Logger.error(JSON.stringify(...))`,
same shape as `RequestObservabilityInterceptor`'s request logs), so there
is no write-amplification risk beyond log volume.

**Why `fetch`, not the shared `api` axios instance:** that instance
redirects to `/login` on 401 and has its own interceptors, which could
themselves throw — using it to report an error risks re-triggering the very
listener that's reporting. `lib/telemetry.ts` uses a bare `fetch(...)
.catch(() => {})` wrapped in try/catch, so a reporting failure can never
itself surface as a second error.

## 3. Health vs. Readiness (already existed, documenting the distinction)

`apps/backend/src/health/health.controller.ts`, both `@Public()`:

- **`GET /api/health/live`** — process liveness only. Returns `200` if the
  Node process is up and answering HTTP, regardless of DB/Redis state. Use
  for container orchestrator restart decisions (a live-but-DB-down process
  should *not* be restarted — restarting it won't fix a downstream DB
  outage).
- **`GET /api/health/ready`** — dependency readiness. Checks Postgres
  (`SELECT 1`), Redis (`ping`, only if configured), and MSSQL (`ping`, only
  if configured); returns `503` with a `components` breakdown if any
  required dependency is down. Use for load-balancer/ingress traffic
  routing decisions (don't send traffic to an instance that can't reach its
  database).
- **`GET /api/health`** — combined snapshot for humans/dashboards
  (`status`, `service`, `version`, plus which optional integrations —
  AI, email, SAP — are configured).

## 4. Minimum production alerts (target definitions)

There is no monitoring platform wired up in this environment, so these are
documented as the minimum alert set to configure once one exists (Datadog,
Grafana Alerting, CloudWatch, etc.) — not live alerts today. Each maps to a
signal this sprint already made queryable:

| Alert | Trigger | Source |
|---|---|---|
| App down | `GET /health/live` non-200 for > 1 min | Health endpoint |
| High 5xx rate | `serverErrors / requests` over a rolling window exceeds threshold (e.g. > 5% over 5 min) | `GET /operations/metrics` (`OperationalMetricsService`) |
| DB unreachable | `GET /health/ready` reports `components.database: "down"` | Health endpoint |
| Critical job failed or missed | `GET /operations/jobs` shows `consecutiveFailures >= 2` for a critical job (billing, reminders), or `lastStartedAt` older than its expected cadence | Job ledger |
| Disk/storage risk | Upload volume free space below threshold (not currently measured anywhere — see gap below) | N/A — not yet instrumented |
| Container restart loop | Orchestrator-level restart count for a container exceeds N within a window | Docker/orchestrator, not app-level |

**Known gap, not fixed in this pass:** disk/storage free-space is not
measured or exposed anywhere in the app. `OperationalMetricsService`
reports process memory only. Flagged as a follow-up, not blocking, since
the app itself has no way to see host disk usage from inside a container
without a bind-mounted `/proc` or an orchestrator-level check.

## Files

- `apps/backend/prisma/schema.prisma` (+`JobExecution` model)
- `apps/backend/prisma/migrations/20260819100000_job_execution_ledger/`
- `apps/backend/src/common/services/scheduler-lock.service.ts` (+`.spec.ts`)
- `apps/backend/src/common/operational.controller.ts` (+`.spec.ts`, new)
- `apps/backend/src/modules/telemetry/` (new: controller, module, DTO, spec)
- `apps/backend/src/app.module.ts` (registered `TelemetryModule`)
- `apps/frontend/src/lib/telemetry.ts` (new)
- `apps/frontend/src/main.tsx` (installs global listeners)
- `apps/frontend/src/components/AppErrorBoundary.tsx` (reports render errors)
- `apps/frontend/src/lib/axios.ts` (reports 5xx/network API failures)

## Tests

- Backend: `scheduler-lock.service.spec.ts` — 8 tests (4 pre-existing lock
  behaviors + 4 new ledger-write behaviors: `RUNNING`→`SUCCEEDED`,
  `RUNNING`→`FAILED` with `errorSummary`, `SKIPPED_LOCKED` on lock
  contention, and a ledger-write failure never fails the underlying task).
- Backend: `operational.controller.spec.ts` — 4 tests, new file (metrics
  passthrough + 3 shapes of `jobsSnapshot`: consecutive failures, healthy
  job, never-run job).
- Backend: `telemetry.controller.spec.ts` — 2 tests, new file.
- Full backend suite: 313/313 passed. `npx tsc --noEmit` — 0 errors.
- Full frontend suite: 212/221 passed — the 9 failures are the
  pre-existing, already-documented `BookingsPage.test.tsx` gap (see
  `TEST_BASELINE_REMEDIATION.md`), unrelated to and unaffected by this
  change; confirmed by diffing the failure list before/after.
- `npx tsc --noEmit` (frontend) — 0 errors.

## Not done in this pass

- No real monitoring platform configured — the alert table above is a
  target spec, not a live alert.
- Disk/storage free-space is not measured anywhere (see gap above).
- The job ledger table itself has no retention/cleanup job yet — it will
  grow unbounded. Low volume (~14 jobs, at most a few runs per hour each)
  makes this a non-issue for months, but flagged as a future cleanup-job
  candidate, not fixed here.
