# Pre-existing Failures Review

Review date: 2026-08-18  
Scope: current post-Option-B working tree. No failure was fixed in this gate review.

## Classification rule

- **BLOCKER**: can invalidate a release decision or represents an unmitigated production failure.
- **HIGH**: material production or regression risk; must have an owner and closure evidence.
- **MEDIUM/LOW**: bounded risk that may be accepted for a pilot with an explicit owner.
- **TEST DEBT ONLY**: the assertion or harness is stale and live/runtime evidence contradicts the failure. It still reduces regression confidence and must be repaired.

## Failure inventory

| Test | Area | Cause | Existing Before Option B | Production Risk | Action |
| --- | --- | --- | --- | --- | --- |
| `health.controller.spec.ts` (5 failures) | Backend health | Test module does not provide the newer `PrismaMssqlService` constructor dependency. Runtime `/api/health/live`, `/ready`, and `/health` all returned HTTP 200; readiness reported PostgreSQL and Redis up. | Yes; completion report records the same suite. | **TEST DEBT ONLY**. It does not show a live health defect, but leaves health behavior without a green unit regression gate. | Platform: add an MSSQL mock and retain assertions for liveness not touching DB and readiness returning 503 on dependency failure. |
| `proposals.controller.spec.ts` (2 failures) | Backend proposals / Mall scope | `getStats` now receives a second optional `leaseTermType`; tests still assert a one-argument call. Mall access and Mall ID values in the received calls are correct. | Yes; same two backend suites and seven failures were recorded before Option B. | **TEST DEBT ONLY**. No evidence of lost Mall scoping, but RBAC regression coverage is noisy. | Leasing backend: update expectations to include `undefined` and add an explicit lease-term assertion. |
| `BookingsPage.test.tsx` (27 failures) | Frontend bookings | Page/test harness drift. The suite hard-codes Vietnamese copy and older interaction assumptions while the test render is returning untranslated keys/current workspace behavior. Pure booking grouping/filter tests in the same file pass. | Yes; exact count recorded by Option B. | **MEDIUM**. Mostly harness debt, but 27 broken journey assertions hide regressions in cancel, reinstate, delete, search, pagination, and create flows. | C1 owner: initialize i18n consistently, remove obsolete UI assertions, and recover behavior-level coverage before changing Bookings. |
| `LeadEditDialog.test.tsx` (10 failures) | Frontend CRM | Test/mocking drift after the shared CRM component began querying users and updating linked Customer data. Radix dialog/test cleanup and translated-name assumptions also no longer match runtime. The suite was green in the older 2026-07-17 UAT artifact. | Yes for Option B baseline; introduced before Option B, after the older UAT artifact. | **MEDIUM**. The failures cover validation, payload clearing, success and error handling, so they cannot be dismissed as copy-only debt. | C1 owner: repair mocks for `usersApi`/`customersApi`, enforce cleanup, and retain payload/validation cases. Manually UAT linked Lead/Customer updates meanwhile. |
| `DashboardPage.test.tsx` (2 failures) | Frontend dashboard | The test expects Vietnamese labels while its i18n setup renders keys; it also assumes an older explicit refresh control. The Option B backend dashboard tests, including Fitout SLA scoping, pass. | Yes; exact count recorded by Option B. | **LOW / TEST DEBT**. Dashboard action navigation lacks a reliable component regression gate. | Dashboard owner: use initialized test i18n or role/name-independent selectors, and align refresh behavior with the current design. |
| `test/app.e2e-spec.ts` (3 failures from host) | Integration smoke | Host execution reads Docker-only `DATABASE_URL=...@postgres:5432`; the hostname is not resolvable from the host. This is an environment/harness mismatch. The running container reports ready and schema current. | Not established by the Option B report; e2e was not reported there. | **MEDIUM** because integration coverage did not execute, even though live public smoke passed. | DevOps: provide a host e2e env (`localhost`) or run e2e inside the Compose network; then require the three smoke tests in CI. |
| `release-readiness.test.mjs` (1 failure) | Release automation | Its CI-mode fixture expects the static gate to pass, but the live repository now correctly fails the static gate on seven operational invariants. | No evidence it was run during Option B. | **HIGH**, not test debt: the failing wrapper exposes real readiness failures below. | Reliability owner: remediate static-gate findings, then rerun this test and preserve the generated report. |
| Six named cron lock failures | Scheduler reliability | Parking billing, two Patrol jobs, two Work Order jobs, and maintenance reminders do not call `SchedulerLockService.runExclusive`. | Pre-existing relative to Option B; these modules were not touched by Option B. | **BLOCKER for multi-replica production**; duplicate statements, shifts, work orders or notifications are possible. | Reliability Sprint A0: add stable names, distributed lock coverage and idempotency tests for all six jobs. |
| Backend production `CMD` runs `prisma migrate deploy` | Deployment / migration | Every application replica can attempt schema migration at startup. Prisma locking lowers concurrency risk but does not create a controlled, observable migration gate or separate failure domain. | Pre-existing relative to Option B. | **HIGH**; startup and rollout are coupled to schema mutation and rollback control is weakened. | DevOps: move migration to a single pre-deploy job; app startup must be read-only with respect to schema. |

## Totals observed on 2026-08-18

- Backend unit: **58 suites passed, 2 failed; 269 tests passed, 7 failed (276 total)**.
- Frontend unit/component: **26 files passed, 3 failed; 181 tests passed, 39 failed (220 total)**.
- Host e2e: **1 suite failed; 3 tests failed before requests because DB hostname was unreachable**.
- Operations automation fixtures: **7 passed, 1 failed**; failure is caused by the repository's static production invariants, not random flakiness.
- Option B additions: the new approval, dashboard, permissions and notification classification/center tests pass.

## Gate conclusion

The 46 unit/component failures are not evidence that Option B introduced regressions, but the frontend groups are not all “test debt only”: they cover business mutations and materially weaken release confidence. More importantly, the release automation exposes real scheduler and deployment risks. A production decision must therefore use the live operational findings, not the label “pre-existing.”
