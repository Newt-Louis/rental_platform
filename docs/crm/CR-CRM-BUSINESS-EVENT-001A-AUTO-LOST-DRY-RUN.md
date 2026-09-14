# CR-CRM-BUSINESS-EVENT-001A — Auto-LOST safety gate

## STATUS

APPROVED SCOPE — explicitly requested 2026-09-12. This safety sub-CR does not approve CRMBusinessEvent, lifecycle semantics, or BC-029's final automation rule.

## BUSINESS REASON

The stale calculation does not observe all activity written by the current CRM UI. It must not automatically change a Lead to LOST while its evidence is unreliable.

## CURRENT BEHAVIOR

`POST /crm/leads/auto-move-stale` selects open Leads whose `lastActivityAt` (or creation time when absent) is older than the threshold and executes one `updateMany`, setting `status=LOST` and a generated `lostReason`.

## EXPECTED BEHAVIOR

`AUTO_LOST_MODE=DRY_RUN`. The same scoped candidate predicate returns an observable candidate report and deterministic reason per Lead. It performs no Lead/business-data mutation and creates no lifecycle event. Replays have zero business-data side effects. The service remains callable from the existing manual endpoint or a future scheduler.

The endpoint response contract fixes `mode=DRY_RUN`, `moved=0`, and
`statusMutations=0`. Its structured service log uses event
`crm.auto_lost.evaluated` and includes the same `DRY_RUN` mode plus candidate
count, mutation count, and threshold; it contains no candidate details.

## MODE ACTIVATION AND ROLLBACK CONTROL

- Mode: `AUTO_LOST_MODE = DRY_RUN`
- Activation date: 2026-09-12
- Reason: the current stale calculation does not include every customer-care activity source, so it is not reliable enough to drive a lifecycle mutation.
- Rollback condition: if this safety change itself causes an operational defect, revert the dry-run response implementation while keeping automatic LOST disabled; do not restore mutation as an emergency rollback.
- Re-enable condition: automatic LOST may be reconsidered only after every condition in **RE-ENABLE CONDITIONS** is satisfied and BC-029 receives explicit business approval through a separate CR.

## PRIMARY DOMAIN

CRM (Tier 1), narrowly scoped safety behavior.

## AFFECTED JOURNEYS

BP-001 / GS-01 Lead-to-Lease; BP-011 management reporting; GS-09 cross-Mall denial; GS-15 retry after failure.

## IMPACT MAP

- Upstream: existing `Lead.status`, `lastActivityAt`, `createdAt`, `mallId`, assignment/downstream legacy scope and caller Mall access.
- Downstream: existing POST endpoint response changes from `{moved}` to an explicit dry-run report. No frontend caller was found beyond the API wrapper.
- Data ownership: CRM Lead remains authoritative; this CR removes a write and adds no owner.
- State machine: automatic stale→LOST transition is disabled. Manual LOST paths are unchanged.
- Financial/currency: none; no amount, formula, FX, or currency display changes.
- Mall/Tenant/authorization: existing ADMIN/LEASING_MANAGER endpoint role gate and canonical Lead Mall predicate remain. Candidate details are returned only from the scoped query. Tenant access remains denied by module/role policy.
- Reporting: candidate count is observational only; existing pipeline KPI formulas are unchanged.
- Transaction/concurrency: read-only query; failure/retry cannot partially mutate a Lead. Repeated runs may observe normal concurrent business changes but cause none.
- Events/jobs: no event is emitted. Method remains request-independent and schedulable. No new scheduler is introduced.
- Documents/API/migration: no documents or schema migration. Response is deliberately changed to dry-run fields; legacy `moved` is retained as constant `0` for compatibility.
- Backward compatibility: callers receive `moved=0`, `mode=DRY_RUN`, candidate count/details and deterministic reasons. No caller may infer candidates were actually LOST.
- Reconciliation: before/after Lead `status`, `lostReason`, and `updatedAt` remain identical for the dry-run.
- Rollback: restore the previous `updateMany` only after all re-enable conditions below are approved; code revert alone is not production authorization.

## GOLDEN / TEST SCENARIOS

AUTOLOST-001..008 plus existing CRM Mall-scope regression. GS-01 is checked for unchanged manual LOST behavior; GS-09 checks candidate scoping; GS-15 is represented by read failure/replay side-effect tests.

## RE-ENABLE CONDITIONS

All are required: canonical/complete activity source, trustworthy last-touch projection, authoritative lifecycle service and event ledger, reviewed dry-run accuracy, answered BC-029, Mall-specific policy approval where applicable, and passing authorization/idempotency/reconciliation gates.

## OPEN BUSINESS QUESTIONS

BC-029 remains open. This CR makes no final decision about whether auto-LOST should ever return.

## VERIFICATION RESULTS

- AUTOLOST-001..008: PASS in `crm.auto-lost-dry-run.spec.ts`.
- CRM targeted regression: PASS, 3 suites / 30 tests.
- Backend full unit suite: PASS, 157 suites / 1542 tests.
- Typecheck: PASS (`tsc --noEmit`).
- Backend build: PASS (`nest build`).
- Changed-file lint: PASS.
- Runtime Mall E2E: PASS, 1 suite / 13 tests against a disposable PostgreSQL 16 database bound only to localhost. It proves authorized candidate count/detail, foreign-Mall spoof rejection, unchanged `status`/`lostReason`/`updatedAt`, zero CRM lifecycle-event storage, and business-state idempotency across repeated dry-runs. The disposable container was removed after verification.

## SEVERITY

P1 / Tier 1 safety gate. Scope is limited to removal of unreliable automatic mutation.

## SIGN-OFF

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Requester / safety gate authority | User | 2026-09-12 | APPROVED 001A scope only |
