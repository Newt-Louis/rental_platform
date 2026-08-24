# 26 — CR-101 Phase 3 Batch Plan

Design only. No implementation. Splits Phase 3 into independently-authorizable batches, derived from this session's and the prior sessions' evidence — not the illustrative category list applied blindly (all 7 illustrative categories turned out to be evidenced and are used, with concrete scope per batch).

## AUTH-101A — Low-risk HTTP route enforcement

**Scope**: routes classified `GAP` in `15-CR-101-ROUTE-COVERAGE.md` where a resolver already exists (existing or trivially reusable) and no schema/business-policy blocker applies: Analytics (read routes only, excluding the CEO write-access question), Reports, CRM `getUnifiedDeals`, Deal-Scoring `scoreProposal`, Service-Catalog (all 4 gap routes), Announcements admin CRUD, SAP `syncCustomer`, Fitout-Controls, Fitout-Gantt mutate/delete, Fitout-Daily-Report photos.
**Risk**: Medium — these are the routes most likely to have zero legitimate cross-Mall usage today (narrow, specific-entity operations), but still require the audit-log-first rollout per `17-CR-101-MIGRATION-PLAN.md`.
**Business confirmations required**: None blocking — none of these routes are on the BC-CEO-SCOPE/BC-013 list.
**Schema dependency**: None.
**Tests**: Generated harness (per `18-CR-101-TEST-STRATEGY.md`) — Same-Mall ALLOW / Different-Mall DENY for each.
**Rollback**: Feature-flag per-route, per `17-CR-101-MIGRATION-PLAN.md` Phase 6 design.
**Order dependency**: None — can start first.

## AUTH-101B — Spaces hierarchy enforcement

**Scope**: Spaces Units (P0-002: get/update/status/delete), Spaces Malls (`getMall`/`updateMall`/`deleteMall` — the newly-found, more-severe whole-Mall gap), Spaces Floors/Zones (`:id`-keyed mutate/delete, and list-when-omitted). Plus the `INV-AUTH-009` data-integrity fix from `24-CR-101-SPACES-HIERARCHY-SECURITY.md` (stripping `mallId`/`floorId`/`zoneId` from `updateUnit`'s pass-through, adding `validateXLocation` to `updateFloor`/`updateZone`).
**Risk**: **High** — this is the platform's most severe confirmed gap cluster (whole-Mall and Unit-level CRUD). Highest-priority batch by severity, independent of its position in this list.
**Business confirmations required**: None blocking (BC-009 informs urgency/sequencing, not whether to do this batch).
**Schema dependency**: None (application-level fixes only, per `24-CR-101-SPACES-HIERARCHY-SECURITY.md`'s recommendation).
**Tests**: Generated harness, plus a dedicated data-integrity test for the `updateUnit` `mallId`-stripping fix.
**Rollback**: Feature-flag per-route.
**Order dependency**: None structurally, but recommended to run in parallel with or immediately after `AUTH-101A` given its severity.

## AUTH-101C — Files authorization

**Scope**: all 8 `files.controller.ts` document families, per `23-CR-101-FILE-OWNER-VERIFICATION.md`'s two-tier finding: Contract/Invoice/Ticket/Fitout (add a Mall check alongside the existing, working tenant check — smaller unit of work) vs. Parking/ServiceContract/WorkOrder/Patrol (build owner-entity + Mall check from scratch — larger unit of work) vs. Maintenance (add Mall check to the existing file-binding check).
**Risk**: Medium — read-only document exposure, no mutation risk, but genuinely sensitive documents (contracts, invoices).
**Business confirmations required**: None blocking.
**Schema dependency**: **Unconfirmed for 3 of 8 families** (Parking/ServiceContract/WorkOrder document owner-entities' Mall-relation reachability was not verified this session — a pre-implementation task, not a schema change itself, but must be resolved before this batch's effort can be estimated for those 3 families specifically).
**Tests**: Generated harness per family.
**Rollback**: Feature-flag per document family (finer-grained than per-route, since families have very different effort levels).
**Order dependency**: The 3 unconfirmed families should be verified before this batch is estimated/started; the other 5 can proceed independently.

## AUTH-101D — AI scope propagation

**Scope**: `AiController`/`AiService` plumbing per `21-CR-101-AI-SCOPE-DESIGN.md` (thread `@CurrentUser()` → `mallIds` → `buildContext()` query filters), **plus** the `ai-proactive-insights` scheduled job fix from `22-CR-101-JOB-EVENT-SCOPE-REVIEW.md` (send per-Mall-scoped insights instead of one platform-wide summary to every MALL_DIRECTOR) — bundled together since both stem from the same root cause and should not be estimated/shipped as unrelated work.
**Risk**: Medium — read-only exposure (chat context, notification content), no mutation risk.
**Business confirmations required**: None blocking.
**Schema dependency**: None.
**Tests**: New tests for `buildContext()`'s Mall-filtered queries; a test asserting `ai-proactive-insights` computes a distinct summary per Mall.
**Rollback**: Straightforward code revert (no data migration).
**Order dependency**: None.

## AUTH-101E — Service-layer assertions

**Scope**: `INV-AUTH-006` on `UnitStatusService.transition()` (accept and verify an `expectedMallId` parameter, all 12 call sites updated to pass it) — per `20-CR-101-SERVICE-ENFORCEMENT-MATRIX.md`'s deep review. No other service was found to need this (Billing/Contracts/Proposals/Tenants/Tickets are all confirmed HTTP_ONLY_SAFE).
**Risk**: Medium — touches a widely-shared service (12 call sites across 7 modules), so regression risk from the *change itself* is broader than its security value alone would suggest; needs full regression across all 7 calling modules.
**Business confirmations required**: None.
**Schema dependency**: None.
**Tests**: Must re-run the full existing test suites for Booking, Contracts, Proposals, Fitout, Slots, Spaces in addition to new assertion-specific tests.
**Rollback**: Straightforward code revert.
**Order dependency**: Should follow `AUTH-101B` (Spaces), since fixing Spaces' controller-level gap first removes the only currently-live path that would trip the new assertion, reducing the chance of an unexpected regression surfacing at the same time as the assertion is introduced.

## AUTH-101F — Background job/event scoping

**Scope**: fix `ai-proactive-insights` (folded into `AUTH-101D` above, not duplicated here) — **beyond that, no other job or event consumer was found needing a fix** (`22-CR-101-JOB-EVENT-SCOPE-REVIEW.md`: 15 `MALL_ITERATED`/verified-SAFE, 4 `GLOBAL_BY_DESIGN`, 2 `SYSTEM_INTERNAL`, 0 other `UNSAFE_GLOBAL_QUERY`). This batch is therefore **effectively empty** beyond what `AUTH-101D` already covers — a positive finding, not a gap in the plan.
**Risk**: N/A.
**Recommendation**: fold `AUTH-101F` into `AUTH-101D` rather than running it as a separate batch; retain the category name only as a record that the full job/event sweep was completed and found (almost) nothing.

## AUTH-101G — Cross-Mall permissions

**Scope**: introduce the `CROSS_MALL_READ` declared-but-ungranted permission concept from `19-CR-101-ADR.md`; apply it consistently to `GET /dashboard/cross-mall` (already correctly gated) and `GET /analytics/multi-mall` (currently reachable by the broader `MODULE_ROLES.analytics` list); resolve `BC-CEO-SCOPE` and implement whichever option is chosen (removing CEO from `BYPASS_ROLES` if Option A/B is chosen, with Proposals/Parking access narrowed accordingly).
**Risk**: **High** — this is the batch most likely to visibly change what a real CEO/MALL_DIRECTOR user can do day-to-day; requires product/support communication regardless of which option is chosen.
**Business confirmations required**: `BC-CEO-SCOPE` (blocking), `BC-013` (informs whether Analytics/Reports get the same `CROSS_MALL_READ` treatment or the broader accessible-mall-set-by-default treatment).
**Schema dependency**: None.
**Tests**: Generated harness's `CROSS_MALL_READ`-specific test case; a dedicated regression suite for whichever CEO-role-list change is chosen.
**Rollback**: Feature-flag; also the highest-value candidate for the audit-log-first observe-only rollout window, specifically to catch any undocumented legitimate CEO workflow before enforcement.
**Order dependency**: Last — depends on `BC-CEO-SCOPE` being resolved, and benefits from `AUTH-101A`'s Analytics-route work landing first.

## Batches explicitly deferred, not part of Phase 3 at all

`customer` resolver (BC-016), `parkingGateFacility` resolver (BC-008), `CustomersController`'s full gap — schema-dependent, tracked separately, not batched into Phase 3's HTTP-enforcement work since the underlying schema question must resolve first (per instruction, no schema change is authorized in this phase or proposed as part of Phase 3's initial scope).

## Summary table

| Batch | Risk | Blocking BC | Schema-dependent | Recommended order |
|---|---|---|---|---|
| AUTH-101A | Medium | None | No | 1st (parallel-safe) |
| AUTH-101B | **High** | None (BC-009 informs urgency only) | No | 1st (parallel-safe, highest severity) |
| AUTH-101C | Medium | None | 3 of 8 families unconfirmed | 1st for 5 families; pre-work needed for 3 |
| AUTH-101D | Medium | None | No | 1st (parallel-safe) |
| AUTH-101E | Medium | None | No | After AUTH-101B |
| AUTH-101F | N/A | N/A | N/A | Folded into AUTH-101D |
| AUTH-101G | **High** | **BC-CEO-SCOPE** | No | Last |
