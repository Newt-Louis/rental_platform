# 27 — CR-101 Phase 3 Entry Gate

Audit only. No implementation. Assesses Phase 3 readiness against explicit entry criteria.

## Entry criteria assessment

| Criterion | Status | Evidence |
|---|---|---|
| Unknown Tier-0/Tier-1 service paths = 0 | **PASS** | `20-CR-101-SERVICE-ENFORCEMENT-MATRIX.md` — every mandatory service (UnitStatusService, ContractsService, ProposalsService, TenantsService, TicketsService, BillingService, Spaces-related, Fitout-related, Files, CRM, AI) classified with cited evidence; zero UNKNOWN |
| Unknown background-job scope = 0 | **PASS** | `22-CR-101-JOB-EVENT-SCOPE-REVIEW.md` — all ~22 jobs classified; the 5 previously-PARTIAL notification jobs individually resolved (4 SAFE, 1 confirmed UNSAFE_GLOBAL_QUERY) |
| AI data flow understood | **PASS** | `21-CR-101-AI-SCOPE-DESIGN.md` — full trace complete, AI_SCOPE definitively MISSING (not merely suspected), minimum plumbing designed |
| All file owner chains verified or explicitly schema-blocked | **PARTIAL** | `23-CR-101-FILE-OWNER-VERIFICATION.md` — 8 of 8 chains directly read this session (up from 2 of 8); however 3 of 8 (Parking/ServiceContract/WorkOrder document families) have an **unconfirmed** Mall-relation reachability question that is narrower than a schema-block but still an open pre-implementation task, not fully closed |
| CEO decision either confirmed or isolated from initial batches | **PASS** | `25-CR-101-BUSINESS-DECISION-PACK.md` prepares the concrete decision package (not yet decided by a human, as expected); `26-CR-101-PHASE-3-BATCH-PLAN.md` isolates all CEO-dependent work into `AUTH-101G`, sequenced last, so batches A-F can proceed independently of this decision |
| Schema-blocked routes isolated | **PASS** | `customer` (BC-016) and `parkingGateFacility` (BC-008) resolvers explicitly excluded from all Phase 3 batches in `26-CR-101-PHASE-3-BATCH-PLAN.md`'s "deferred" section |
| Phase 3 batches defined | **PASS** | `26-CR-101-PHASE-3-BATCH-PLAN.md` — 7 categories evidenced and scoped (AUTH-101F folded into AUTH-101D as a documented, not silent, simplification) |
| Rollback strategy defined | **PASS** | Per-batch in `26-CR-101-PHASE-3-BATCH-PLAN.md`, building on the feature-flag design in `17-CR-101-MIGRATION-PLAN.md` Phase 6 |
| Audit-mode strategy defined | **PASS** | `17-CR-101-MIGRATION-PLAN.md`'s "Audit mode observability" section (decision fields, redaction rule, reuse of the existing `AuditLogInterceptor` pattern) — see refinement below |
| Test generation plan defined | **PASS** | `18-CR-101-TEST-STRATEGY.md`'s parameterized harness — see refinement below |

## Overall: **PARTIAL PASS**

9 of 10 criteria fully PASS. 1 criterion (file owner chains) is substantively complete (all 8 families read directly, up from 2) but carries forward a narrower, well-scoped unknown (3 families' exact Mall-relation reachability) rather than a full schema-block. This is a materially smaller gap than existed at the start of this phase and does not block the 5 already-fully-verified file families' batch work, or any of the other 6 batches.

## Remaining blockers before full PASS

1. Verify whether `ParkingCustomerContract`, `ServiceContract`, and `WorkOrder` have a direct or one-hop-reachable `mallId` — a single targeted schema read, not a design task, estimated as a small pre-work item for whoever picks up `AUTH-101C`.
2. `BC-CEO-SCOPE` requires an actual human decision (Option A/B/C) before `AUTH-101G` can be scoped precisely — already correctly isolated as the last batch, not blocking the other 6.
3. `BC-013` should ideally resolve before `AUTH-101A`'s Analytics/Reports routes ship enforcement (affects whether they get `CROSS_MALL_READ` or accessible-mall-set-by-default treatment) — does not block designing or starting the batch's audit-log-first observation window, only its final enforcement flip.

## Audit-mode design — refinement

Building on `17-CR-101-MIGRATION-PLAN.md`'s design: the decision-log record shape (`route`, `userId`, `role`, `resolvedMallId`, `authorizedMallIds`, `decision`, `reason`) should additionally carry a `requestId` (for correlating with the existing `RequestObservabilityInterceptor`'s own request-scoped logging, confirmed already present in this codebase) and `declaredScope`/`resolver` (the `@Scope(...)` metadata that produced the decision, for auditing the metadata itself, not just its outcome). **Never log**: JWTs, passwords, full request bodies (reuses `AuditLogInterceptor`'s existing regex-based redaction, already proven in production use). **Retention**: recommend 90 days for the observe-only rollout window specifically (long enough to catch a monthly/quarterly business process that only runs occasionally), shorter (30 days) once steady-state enforcement is live and the log becomes a routine security trail rather than a migration-verification tool. **Sampling**: recommend 100% capture during each batch's observe-only window (the whole point is catching rare cases), with sampling only considered later if volume becomes a genuine storage/cost concern in steady state — not a Phase 3 design concern.

## Fail-closed rollout strategy — confirmed unchanged

The 7-phase transition in `17-CR-101-MIGRATION-PLAN.md` (compatibility mode → gap remediation → audit mode → metrics review → warn completeness → strict completeness → fail closed → remove heuristic fallback) remains the correct sequence; this Phase 2.5 pass found no evidence requiring a change to that sequence, only to the *batches* that populate the "gap remediation" step (now the 7 `AUTH-101x` categories above, rather than an undifferentiated single Phase 3).

## Test generation plan — refinement

The parameterized harness design in `18-CR-101-TEST-STRATEGY.md` (T-A through T-H) is confirmed sufficient for every batch's needs, with one addition surfaced this session: `AUTH-101E`'s service-layer assertion needs a harness variant that doesn't go through an HTTP route at all (a direct unit test calling `UnitStatusService.transition()` with a mismatched `expectedMallId`, asserting rejection) — the existing route-driven generator doesn't cover this case since it's specifically about defense-in-depth *below* the HTTP layer. This is an addition, not a redesign, of the existing plan.

## No application change

Confirmed — this entire Phase 2.5 pass was read-only investigation (Bash/Grep/Read tool calls against the existing codebase) plus documentation writes under `docs/architecture-review/`. No controller, service, guard, schema, migration, job, AI code, file query, permission, or role assignment was modified.
