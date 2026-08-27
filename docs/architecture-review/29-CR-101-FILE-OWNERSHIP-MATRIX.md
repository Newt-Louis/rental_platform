# 29 — CR-101 Phase 3C: File Ownership Matrix

Audit only. Every row independently re-derived from `apps/backend/prisma/schema.prisma` and the relevant controller/service source this phase (file:line citations in `28-...-READINESS.md`'s companion research, not repeated in full here for brevity — every claim is traceable).

Two tables: (A) the 8 families served by `files.controller.ts` (the confirmed `AUTH-01` gap surface), (B) the module-native upload/list/manage routes (mostly already Mall-enforced).

## Table A — `files.controller.ts` download routes (AUTH-01 cluster)

**Status update (CR-101 Phase 3C, C1+C2, `docs/changes/CR-101-PHASE-3C-C1-C2-COMPLETION.md`): the first 7 rows below are RESOLVED.** Not a silent rewrite — the original GAP finding and classification are preserved as-written; this note records what changed and points to the evidence. The remaining 5 rows (Parking/ServiceContract/WorkOrder/Patrol/Maintenance) are unchanged, still GAP, explicitly deferred to C3 (not authorized in this batch).

| Document Family | File Entity | Owner Entity Chain | Tenant Source | Mall Source | Enforcement (as of C1+C2) | Gap classification (original, preserved) |
|---|---|---|---|---|---|---|
| Contract file | `ContractFile` | `ContractFile.contractId → Contract.unitId → Unit.mallId` (non-null throughout) | `Contract.tenantId` (checked) | `Unit.mallId` | **RESOLVED — Mall-checked via the `contract` resolver** (`files.controller.ts`'s `downloadContractFile`) | `READY_WITH_EXISTING_QUERY` — reuse the registered `contract` resolver |
| Invoice document | `UnifiedDocument` (`entityType='INVOICE'`) | `doc.entityId → Invoice` — `Invoice.mallId` direct but **nullable**, resolver falls back to `contract.unit.mallId` then `billingParty.mallId`, fails closed (throws) if none resolve | `Invoice.tenantId` (checked for TENANT; role-gated for staff) | `Invoice.mallId` (nullable) → fallback chain | **RESOLVED — Mall-checked via the `invoice` resolver** (already fail-closed, unchanged) | `READY_WITH_EXISTING_QUERY` — reuse the registered `invoice` resolver (already fail-closed) |
| Ticket photo | `UnifiedDocument` (`entityType='TICKET'`) | `doc.entityId → Ticket.unitId → Unit.mallId` (non-null throughout) | `Ticket.tenantId` (checked) | `Unit.mallId` | **RESOLVED — Mall-checked via the `ticket` resolver** | `READY_WITH_EXISTING_QUERY` — reuse the registered `ticket` resolver |
| Fitout Submittal attachment | `UnifiedDocument` (`entityType='FITOUT_SUBMITTAL'`) | `doc.entityId → FitoutSubmittal.projectId → FitoutProject.unitId → Unit.mallId` (non-null throughout) | N/A — TENANT has no module access | `Unit.mallId` | **RESOLVED — Mall-checked via the `fitoutSubmittal` resolver** | `READY_WITH_EXISTING_QUERY` — reuse the registered `fitoutSubmittal` resolver |
| Fitout Issue photo | `UnifiedDocument` (`entityType='FITOUT_ISSUE'`) | `doc.entityId → FitoutIssue.unitId → Unit.mallId` (direct, non-null) | N/A | `Unit.mallId` | **RESOLVED — Mall-checked via the `fitoutIssue` resolver** | `READY_WITH_EXISTING_QUERY` — reuse the registered `fitoutIssue` resolver |
| Fitout Daily Report photo | `UnifiedDocument` (`entityType='FITOUT_DAILY_REPORT'`) | `doc.entityId → FitoutDailyReportEntry.projectId → FitoutProject.unitId → Unit.mallId` (non-null throughout) | N/A | `Unit.mallId` | **RESOLVED — Mall-checked via the `fitoutDailyReportEntry` resolver** | `READY_WITH_EXISTING_QUERY` — reuse the registered `fitoutDailyReportEntry` resolver (added Phase 3A) |
| Fitout project document | `FitoutDocument` | `FitoutDocument.projectId → FitoutProject.unitId → Unit.mallId` (non-null throughout) | `FitoutProject.tenantId` (checked) | `Unit.mallId` | **RESOLVED — Mall-checked via the `fitoutProject` resolver** | `READY_WITH_EXISTING_QUERY` — reuse the registered `fitoutProject` resolver |
| Parking contract document | `ParkingContractDocument` | `ParkingContractDocument.contractId → ParkingCustomerContract.mallId` (**direct field**, non-null, with a real `mall Mall @relation`) | N/A (staff-only module) | `ParkingCustomerContract.mallId` | **RESOLVED (CR-101 Phase 3C, C3) — Mall-checked via the new `parkingCustomerContract` resolver** | `REQUIRES_NEW_RESOLVER` — small: direct-field lookup, mirrors the `servicePriceCatalog`/`announcementMall` pattern already in the registry (~5 lines) |
| Service contract document | `ServiceContractDocument` | `ServiceContractDocument.contractId → ServiceContract.mallId` (**direct field**, non-null, **no** `mall Mall @relation` object declared — raw scalar FK, referential-integrity note only, doesn't weaken the auth chain) | N/A (staff-only module) | `ServiceContract.mallId` | **RESOLVED (C3) — Mall-checked via the new `serviceContract` resolver** | `REQUIRES_NEW_RESOLVER` — small, same shape as above |
| Work Order evidence | `WorkOrderEvidence` | `WorkOrderEvidence.workOrderId → WorkOrder.mallId` (**direct field**, non-null, real relation) | N/A (staff-only module) | `WorkOrder.mallId` | **RESOLVED (C3) — Mall-checked via the new `workOrder` resolver** | `REQUIRES_NEW_RESOLVER` — small, same shape as above |
| Patrol check evidence | `PatrolCheck` (evidence fields on the row itself) | `PatrolCheck.shiftId → PatrolShift.mallId` (direct, non-null) — **not** via `pointId → PatrolPoint → PatrolRoute` (a parallel, un-cross-validated path that also exists on the same row) | N/A (staff-only module) | `PatrolShift.mallId` | **RESOLVED (C3) — Mall-checked via the new `patrolCheck` resolver, which folds `PatrolService.checkMallId()`'s logic into `MallAccessService` rather than importing `PatrolService` into `FilesModule`; `checkMallId()` itself is unchanged and keeps its own call sites in `patrol.controller.ts`** | `READY_WITH_EXISTING_QUERY` — the exact lookup already exists and is production-tested as `PatrolService.checkMallId()`; this is a **one-line fix** (call the existing helper, then `assertMallAccess`) |
| Maintenance evidence | `MaintenanceExecution.evidenceUrls[]` | `MaintenanceExecution.scheduleId → MaintenanceSchedule.mallId` (direct, non-null) | N/A | `MaintenanceSchedule.mallId` | **RESOLVED (C3) — Mall-checked via the pre-existing `maintenanceSchedule` resolver, unchanged; array-membership check preserved** | `READY_WITH_EXISTING_QUERY` — reuse the registered `maintenanceSchedule` resolver |

**Status update (CR-101 Phase 3C, C3, `docs/changes/CR-101-PHASE-3C-C3-COMPLETION.md`): all 5 rows above are RESOLVED — all 12 of Table A's original rows are now closed.** The only remaining `files.controller.ts`-adjacent open items are C4's (`fitout.controller.ts` `reviewDocument`, `fitout-issue.controller.ts`), which are a different bug class (ID-substitution / incidental-only protection) tracked separately in Table B, not Table A.

**No `UNKNOWN` rows.** Every chain above was traced to a concrete field with a confirmed line number this phase; none is left unresolved.

## Table B — module-native upload/list/manage routes

| Route family | Controller | Enforcement mechanism | Status |
|---|---|---|---|
| Contract files (list/upload/delete/sign) | `contracts.controller.ts` | `validateContract()` → `contract` resolver; child `fileId` correctly scoped to `contractId` via `findFirst({id, contractId})` in `deleteFile`/`signFile` | ENFORCED, no gap |
| Invoice documents (list/upload) | `billing.controller.ts` | `invoice` resolver (fail-closed) | ENFORCED, no gap |
| Ticket photos (list/upload) | `tickets.controller.ts` | Double-checked: route-level `MallAccessService` call **and** service-level `findOne()`'s tenant check | ENFORCED, no gap |
| Fitout Submittal attachments (list/upload) | `fitout-submittal.controller.ts` | `validateSubmittalAccess()` → `fitoutProject` resolver chain | ENFORCED, no gap |
| Fitout Issue photos (list/upload) — and all 7 other routes in the same controller | `fitout-issue.controller.ts` | **RESOLVED (CR-101 Phase 3C, C4-02)** — all 9 routes now call `MallAccessService` explicitly, reusing the registered `fitoutProject` resolver (list/create) and `fitoutIssue` resolver (the 7 `:id`-keyed routes). **Correction to this row's original scope**: 2 of the 9 routes (`list`/`create`) were actually incidentally protected via `query.projectId`/`body.projectId` matching the guard's `fitoutProjectId` field, not the path-substring match this row originally described — both mechanisms shared the same underlying root cause (no explicit call), so the fix and its scope are unchanged, only the mechanism-per-route description is corrected here. | Was P2 — works today, fragile, not build-time-verifiable; now RESOLVED |
| Fitout Daily Report photos (list/upload) | `fitout-daily-report.controller.ts` | Explicit `fitoutDailyReportEntry` resolver call (Phase 3A) | ENFORCED, no gap |
| Fitout project documents (list/upload/**review**) | `fitout.controller.ts` | `validateProject()` → `fitoutProject` resolver, for list/upload | List/upload: ENFORCED (unchanged). **`PUT :id/documents/:docId/review`: RESOLVED (CR-101 Phase 3C, C4-01)** — `FitoutDocumentsService.reviewDocument()` now takes `projectId` and uses `findFirst({ where: { id: documentId, projectId } })`, so a `docId` belonging to a different project can never be acted on even when the caller is correctly authorized for the project in the path. | Was P1 — confirmed ID-substitution / cross-Mall document-review bug; now RESOLVED |
| Parking contract documents (upload) | `parking.controller.ts` | `assertContract()` → `contractMallId()` (parking.service.ts) | ENFORCED, no gap |
| Service contract documents (upload/delete) | `service-contracts.controller.ts` | `assertItemAccess()`; child `documentId` correctly scoped via `findFirst({id, contractId})` — the most defensively-coded handler found in this audit | ENFORCED, no gap |
| Work Order evidence (upload) | `work-orders.controller.ts` | `assert()` → `service.mallId()` | ENFORCED, no gap |
| Patrol check evidence (upload/PATCH) | `patrol.controller.ts` | `checkMallId()` (the same helper `files.controller.ts` fails to call on the download side) | ENFORCED, no gap |
| Branding logo/background | `branding.controller.ts` | N/A — no Mall dimension exists (`BrandingSettings` has no `mallId`), correctly `@GlobalScope` | Correctly out of scope, no gap |
| AI floor-plan analysis (upload, get, apply) | `ai.controller.ts` | Upload/list: incidental global-guard coverage via `body.mallId`/`query.mallId`. **`GET analyses/:id`, `.../status`, `POST .../apply`: zero Mall check, local or global** (guard has no resolver for an analysis id) | **P2, cataloged only — AI is Phase 3D, not proposed for remediation here** |

## Resolvers already registered in `MallAccessService` and reusable as-is for Table A

`contract`, `invoice`, `ticket`, `fitoutProject`, `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry`, `maintenanceSchedule` — **8 of the 12 Table-A rows need zero new resolver code**, only a call-site wiring change in `files.controller.ts` itself (inject `MallAccessService`, call the appropriate resolver, `assertMallAccess`/`extractAndValidateMallAccess` before streaming).

## Resolvers that exist but live outside `MallAccessService`'s registry

`PatrolService.checkMallId()` (and its siblings `routeMallId`/`pointMallId`/`shiftMallId`/`scheduleMallId`) — correct, tested, production logic, but a **second, parallel resolution mechanism**, per the standing recommendation in `16-CR-101-RESOLVER-REGISTRY.md` (not new to this phase — re-confirmed still true and still unaddressed). Folding these into the canonical registry as named resolvers (`patrolCheck`, `patrolRoute`, `patrolPoint`, `patrolShift`, `patrolSchedule`) is proposed in `31-...-IMPLEMENTATION-PLAN.md`'s Batch C1, not done this phase.

## New resolvers needed (small, direct-field, no schema dependency)

`workOrder` (`WorkOrderEvidence.workOrderId → WorkOrder.mallId`, direct), `parkingCustomerContract` (`ParkingContractDocument.contractId → ParkingCustomerContract.mallId`, direct), `serviceContract` (`ServiceContractDocument.contractId → ServiceContract.mallId`, direct). All three mirror the exact shape of Phase 3A's `servicePriceCatalog`/`announcementMall` additions — no schema change, no relation traversal beyond one hop to an already-non-nullable field.

---

## Status update — CR-101 Phase 3C, C4 (`docs/changes/CR-101-PHASE-3C-C4-COMPLETION.md`)

The 2 open Table B items from C1/C2/C3 (`fitout.controller.ts`'s `reviewDocument`, `fitout-issue.controller.ts`) are **both RESOLVED** — see the inline row updates above. Table A remains 12/12 closed (C1/C2/C3). Table B's `fitout.controller.ts`/`fitout-issue.controller.ts` rows are now also closed. Per the C4 authorization, this does **not** constitute a declaration that the File Authorization domain is fully closed — that determination is reserved for C5.
