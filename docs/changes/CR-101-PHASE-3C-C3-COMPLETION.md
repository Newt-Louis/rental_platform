# CR-101 Phase 3C — C3 Completion Report

Status: **Implementation complete, unstaged, awaiting human review.** No commit made. RC3 remains designated; no RC4.

## 1. Families investigated vs. actually remediated

Investigated: Parking, Service Contract, Work Order, Patrol, Maintenance — all 5 named in the authorization. **All 5 confirmed as genuinely distinct, reachable document families and all 5 remediated.**

## 2. Maintenance classification (Section 7)

**Classification A — a separate, distinct persistence/document family**, not an alias of Work Order, not dead, not documentation duplication. `MaintenanceSchedule`/`MaintenanceExecution` are Prisma models entirely independent of `WorkOrder` (verified against `schema.prisma`: different domains — scheduled/preventive maintenance execution vs. ad-hoc ticketed work orders — no shared table, no FK between them). `files.controller.ts` already had a distinct route (`maintenance-evidence/:executionId/:fileName`) with its own pre-existing `maintenanceSchedule` resolver reference (added in an earlier CR-101 phase, but never actually invoked at runtime until this batch).

## 3. Resolvers reused vs. added

**Reused unchanged**: `maintenanceSchedule` (already registered, now actually invoked for the first time on this route).

**Added (4 new, all direct-field, no schema dependency)**: `workOrder` (`WorkOrder.mallId`), `parkingCustomerContract` (`ParkingCustomerContract.mallId`), `serviceContract` (`ServiceContract.mallId`), `patrolCheck` (`PatrolCheck.shiftId → PatrolShift.mallId`). All 4 were confirmed genuinely missing from `MallAccessService` before implementation (grepped directly, not assumed from the plan doc) — no `PLAN CORRECTION` needed; the implementation plan's classification was accurate.

## 4. Patrol consolidation (Section 11 and Section 6's "reuse, don't duplicate")

`PatrolService.checkMallId()` (`patrol.service.ts:66`) — the pre-existing, correct, production-tested helper the readiness review found `files.controller.ts` never called — was **not modified, not removed, not re-exported**. Its own call sites in `patrol.controller.ts` (the module-native upload/PATCH routes) are unchanged and continue using it directly. Instead, the identical relation chain (`PatrolCheck.shiftId → PatrolShift.mallId`) was added to `MallAccessService` as a new named resolver, `patrolCheck`, so `files.controller.ts` can call the same canonical `extractAndValidateMallAccess()` mechanism every other CR-101-remediated route uses, rather than importing `PatrolService` into `FilesModule` (a cross-module dependency the existing architecture doesn't otherwise need). A dedicated test (`mall-access.service.spec.ts`) proves the new resolver queries via `shift.mallId`, matching `checkMallId()`'s exact chain — not the parallel, un-cross-validated `pointId → PatrolPoint → PatrolRoute` path that also exists on the same `PatrolCheck` row. This satisfies "fold into the canonical architecture" without refactoring any unrelated Patrol functionality.

## 5. Routes remediated

All 5: `GET /api/files/parking-contract-documents/:fileId`, `GET /api/files/service-contract-documents/:fileId`, `GET /api/files/work-order-evidence/:fileId`, `GET /api/files/patrol-checks/:fileId`, `GET /api/files/maintenance-evidence/:executionId/:fileName`.

**Pattern applied** (identical to C2's "File First" invariant): fetch the file/execution record by its own id → read the owner reference already present on that fetched record (`doc.contractId`, `doc.workOrderId`, the check's own `fileId` for Patrol, `execution.scheduleId`) → call `MallAccessService.extractAndValidateMallAccess()` → only then stream.

## 6. Cross-Mall protection

RESOLVED for all 5 families — verified by test (§9): a DENY from `MallAccessService` now throws `ForbiddenException` before `stream()` is called, for every family.

## 7. Cross-Tenant protection

Not applicable to any of these 5 families — all are staff-only modules (`Role.TENANT` has no access at all, confirmed unchanged from the readiness review's finding). No tenant-ownership check existed before this batch and none was needed; nothing to preserve or weaken here.

## 8. ID substitution search (Section 17)

Searched all 5 routes for the same bug class confirmed in `fitout.controller.ts`'s `reviewDocument` (an already-authorized parentId paired with an unrelated, unchecked child id). **None found.** All 5 routes' request shape is a single `fileId` (or `executionId`+`fileName` for Maintenance) path parameter — none accepts a second, client-supplied owner/parent identifier at all. The owner id used for the Mall check always comes from the fetched file/execution record's own scalar FK field, never from request input. This is a structural property, not a per-route judgment call — confirmed by reading every route's full parameter list. **No C3 fix was required for this bug class; nothing was silently expanded beyond the authorized scope.**

**Schema-level reinforcement also noted**: every one of the 5 owner FK fields (`contractId` ×2, `workOrderId`, `shiftId`, `scheduleId`) is a required, non-nullable column with `onDelete: Cascade` on the parent relation — meaning an "unknown/missing owner" scenario (the file record exists but its owner doesn't) is structurally prevented by the database's own referential integrity, not merely by application code. This was verified, not assumed (§10).

## 9. Tests added

- `mall-access.service.spec.ts`: 13 new tests — the standard DENY/ALLOW/bypass-role `it.each` pattern for all 4 new resolvers (`workOrderId`/`parkingCustomerContractId`/`serviceContractId`/`patrolCheckId`), plus one dedicated test proving `patrolCheckId` resolves via `shift.mallId` specifically (not the parallel point/route path).
- `files.controller.spec.ts`: 7 new tests in a "Mall access (CR-101 Phase 3C C3)" block — one DENY-and-blocks-stream test per family (proving the route calls the correct resolver with the correct server-derived id), one same-Mall-ALLOW regression test, one ADMIN-bypass test. The stale C2-era test asserting "Parking is unchanged, no Mall check added" (correct at the time, now obsolete since C3 is authorized) was replaced with this block rather than left contradicting the new code.

## 10. Data reconciliation (Section 18)

Ran against the dev database. **Result: CLEAN, same weak-evidence caveat as C1+C2** — `ParkingContractDocument`, `ServiceContractDocument`, `WorkOrderEvidence`, `PatrolCheck` (with a file), and `MaintenanceExecution` (with evidence) all contain **0 rows** in this dev environment. Every orphan check (file/execution → owner FK existence) correctly returned 0, confirming the query logic is sound, but **0 rows of business data is weak evidence, not meaningful production validation** — stated plainly, not overclaimed. Classification: **CLEAN (0 rows, not meaningfully exercised)**, not `DIRTY-AMBIGUOUS`.

## 11. Backend / Frontend / Regression

- Backend (`npx jest`): **75/75 suites, 475/475 tests.** Breakdown: 456 (C1+C2 final count) + net +6 in `files.controller.spec.ts` (7 new C3 controller tests, minus 1 stale test replaced) = 462, + 13 new resolver tests in `mall-access.service.spec.ts` = **475**. 0 regressions.
- Frontend (`npx vitest run`): **28/29 files, 216/225 tests** — identical to baseline. **The 9 `BookingsPage.test.tsx` failures are the pre-existing, unrelated "Xóa booking" timeout issue**, reported separately, not a regression — this batch touched zero frontend files.
- `tsc --noEmit` (backend): clean.
- `tsc --noEmit` (frontend): clean.
- `eslint` on every file touched: clean.
- `nest build`: clean.
- `vite build`: clean (pre-existing chunk-size-warning only, unrelated to this change).
- `git diff --check`: clean.
- Route inventory re-run: all 8 `files.controller.ts` routes now `ENFORCED` (was 3/8 after C1+C2, now 8/8).

## 12. Adversarial review

- **cross-Mall fileId substitution**: NOT APPLICABLE — every route keyed by the resource's own PK, structurally unchanged from C2's finding.
- **same-role/wrong-Mall access**: C1/C2/C3 BYPASS category — now fixed for all 12 of Table A's families (was the exact thing this and the prior batch closed).
- **unknown owner / missing owner**: PROTECTED, and confirmed structurally impossible (not merely unlikely) via the DB's own `onDelete: Cascade` + required-FK constraints on every one of the 5 owner relations (§8).
- **alternate download route**: FALSE POSITIVE, re-confirmed closed — no other controller exposes these 5 models' file bytes; unchanged from the readiness review.
- **module-native route bypass**: PROTECTED, unchanged — `parking.controller.ts`/`service-contracts.controller.ts`/`work-orders.controller.ts`/`patrol.controller.ts`'s own upload/manage routes were already confirmed `ENFORCED` in the readiness review and were not touched this batch.
- **direct storage path**: PROTECTED, unchanged — not touched this batch.
- **role-only bypass**: FIXED for all 5 families — role checks preserved, Mall check now additionally required.
- **Patrol special-case bypass**: PROTECTED — the special-case (a second, parallel resolution mechanism outside `MallAccessService`) is now folded into the canonical registry (§4); no divergence between the folded `patrolCheck` resolver and the original `checkMallId()` was found (proven by test).
- **Maintenance/WorkOrder family confusion**: NOT APPLICABLE — confirmed genuinely distinct families with distinct resolvers, no shared code path that could cross-resolve one as the other (§2).

**No findings requiring action outside C3's authorized scope were found or silently fixed.**

## 13. File-domain coverage (Section 20 — recalculated from executable evidence, not the old counts)

- **Total Table-A families**: 12.
- **C1/C2 closed**: 7 (Contract, Invoice, Ticket, Fitout Submittal/Issue/Daily-Report, Fitout project document).
- **C3 closed**: 5 (Parking, Service Contract, Work Order, Patrol, Maintenance).
- **Table A remaining**: 0 of 12 — **fully closed**.
- **C4 remaining** (a different bug class, tracked in Table B, not Table A): 2 — `fitout.controller.ts`'s `reviewDocument` (ID-substitution), `fitout-issue.controller.ts` (incidental-only protection).
- **Unknown**: 0.
- **Known P0**: none (none were found at any point in this program's file-authorization work).
- **Known P1**: 1 — `fitout.controller.ts`'s `reviewDocument` (C4, unchanged, not authorized this batch).
- **Known P2**: 1 — `fitout-issue.controller.ts`'s incidental-only protection (C4, unchanged, not authorized this batch). Plus the previously-noted, out-of-scope `ai.controller.ts` unguarded analysis routes (Phase 3D, unrelated to Files C-series).

## 14. Application files changed

`apps/backend/src/files/files.controller.ts` (5 route handlers + header comment), `apps/backend/src/files/files.controller.spec.ts` (7 new tests, 1 stale test replaced), `apps/backend/src/common/services/mall-access.service.ts` (4 new resolvers), `apps/backend/src/common/services/mall-access.service.spec.ts` (13 new tests), `apps/backend/src/common/services/mall-resolver-registry.ts` (4 new registry entries). No other application file touched. No `patrol.service.ts`, `parking.service.ts`, `service-contracts.service.ts`, or `work-orders.service.ts` change — their existing, correct business/RBAC logic is fully preserved, per Sections 9/10/11's explicit instruction not to redesign existing module authorization.

## 15. Git discipline

No `git add -A`. All working-tree entries (this batch's edits plus everything carried forward) confirmed **unstaged** (`git diff --cached` empty) before this report was written. No commit created. No RC4. RC3 (`c61fdb9`) unchanged. HEAD unchanged (`915c96e4b90c8002c238f731a90bd86cc90f4114`).
