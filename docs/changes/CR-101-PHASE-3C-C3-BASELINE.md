# CR-101 Phase 3C — C3 Baseline (captured 2026-08-22, before C3 implementation)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114` (unchanged from every prior CR-101 phase — no commit made anywhere in this program yet)
- `git diff --cached`: empty, 0 files staged
- `git status --short`: 103 pre-existing modified/untracked working-tree entries, carried forward from all prior phases including C1+C2.

## Baseline test results (re-confirmed before C3 work began)
- Backend (`npx jest`): 75 suites / 462 tests passing (Phase 3C C1+C2's final count).
- Frontend baseline (unchanged across every prior phase): 28/29 files, 216/225 tests. Pre-existing, unrelated failure: `BookingsPage.test.tsx`, 9 tests, "Xóa booking" timeout.

## Pre-implementation verification against executable code (per Section 2's "code wins over docs")
- `workOrderId`/`parkingCustomerContractId`/`serviceContractId`/`patrolCheckId` resolvers: confirmed **not present** in `mall-access.service.ts` — genuinely need to be added, no plan correction required.
- `PatrolService.checkMallId()`: confirmed still present and unchanged at `patrol.service.ts:66`.
- `MaintenanceSchedule`/`MaintenanceExecution` vs. `WorkOrder`: confirmed distinct Prisma models (different domains — scheduled/preventive maintenance vs. ad-hoc ticketed work) — Maintenance is classification **A: a separate, distinct, reachable document family**, not an alias, not dead, not documentation duplication. Included in C3 scope per the authorization's conditional inclusion.
- Schema FK field names re-confirmed directly (not assumed from prior docs): `ParkingContractDocument.contractId → ParkingCustomerContract.mallId` (direct), `ServiceContractDocument.contractId → ServiceContract.mallId` (direct, no Prisma relation object but a valid scalar FK), `WorkOrderEvidence.workOrderId → WorkOrder.mallId` (direct), `MaintenanceExecution.scheduleId → MaintenanceSchedule.mallId` (direct, resolver already existed), `PatrolCheck.shiftId → PatrolShift.mallId` (matches `checkMallId()`'s own chain, not the parallel `pointId → PatrolPoint → PatrolRoute` path).

## Scope authorized this phase
**C3 only**: Parking, Service Contract, Work Order, Patrol, Maintenance — the remaining 5 `files.controller.ts` download-route families. Explicitly **not authorized**: C4 (`fitout.controller.ts` `reviewDocument`, `fitout-issue.controller.ts`), C5, Phase 3D/3E/3G, CR-103, financial semantics refactor, global fail-closed, heuristic removal, any schema change.
