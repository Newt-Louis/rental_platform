# 23 — CR-101 File Owner Verification

Audit only. No code changed. Completes verification of all 8 document families in `files.controller.ts` against the running code (not the design table alone). 2 of 8 were verified in the Phase 1/2 pass; the remaining 6 are verified here, directly, this session.

## Chain-by-chain (File ID → Metadata → Owner Entity → Mall → Tenant → Authorization Decision)

### 1. Contract (`downloadContractFile`) — previously verified
`ContractFile.id → ContractFile.contractId → Contract.tenantId` (only `tenantId` is selected — **Mall is not even queried today**, though `Contract.unit.mallId` exists and is reachable). Tenant check: enforced for `TENANT` role. Mall check: **absent**. Role check for non-tenant callers: **absent** (any authenticated non-tenant user with the class-level role gate passes).

### 2. Invoice/Ticket/Fitout (`downloadUnifiedDocument`) — previously verified
Dispatches on `doc.entityType`. INVOICE: `Invoice.tenantId` tenant check + `requireRole([ADMIN,FINANCE,MALL_DIRECTOR])` for non-tenant. TICKET: `Ticket.tenantId` tenant check, no additional role restriction. FITOUT_SUBMITTAL/ISSUE/DAILY_REPORT: role-only (`[ADMIN,OPERATION,LEASING_MANAGER,MALL_DIRECTOR]`), no tenant access possible by design (TENANT has no Fitout module access). **Mall check: absent in every branch.**

### 3. Fitout (`downloadFitoutDocument`) — verified this session
`FitoutDocument.id → FitoutDocument.projectId → FitoutProject.tenantId`. Tenant check for `TENANT` role; `requireRole([ADMIN,OPERATION,LEASING_MANAGER,MALL_DIRECTOR])` for non-tenant. **Mall check: absent** (same shape as #1/#2 — Mall-relevant fields exist on the reachable relation chain but are never selected or checked).

### 4. Parking Contract Document (`downloadParkingContractDocument`) — verified this session
`requireRole(user, PARKING_ROLES)` — then `parkingContractDocument.findUnique({where:{id: fileId}})` with **no owner-entity lookup of any kind**. No tenant check, no Mall check, no verification the document even belongs to a contract the role-holder should see. **This is weaker than #1-#3**: those at least check tenant ownership; this checks nothing beyond "does your role include PARKING access."

### 5. Service Contract Document (`downloadServiceContractDocument`) — verified this session
Identical shape to #4: `requireRole(user, SERVICE_CONTRACT_ROLES)`, then a bare `findUnique({where:{id}})`, no owner-entity check at all.

### 6. Work Order Evidence (`downloadWorkOrderEvidence`) — verified this session
Identical shape to #4/#5: `requireRole(user, WORK_ORDER_ROLES)`, bare `findUnique`, no owner-entity check.

### 7. Patrol Check File (`downloadPatrolCheckFile`) — verified this session
Identical shape: `requireRole(user, PATROL_ROLES)`, bare `findUnique`, no owner-entity check.

### 8. Maintenance Evidence (`downloadMaintenanceEvidence`) — verified this session
`requireRole(user, MAINTENANCE_ROLES)`, then fetches `MaintenanceExecution` by `executionId` and additionally verifies the requested `fileName` actually appears in that execution's own `evidenceUrls` array before serving it — **the one file family with a genuine per-record ownership check today**, though it checks "does this file belong to this execution," not "does this execution belong to a Mall you have access to." No Mall check.

## Classification at minimum requested (Contract / Invoice / Fitout / Ticket / Tenant / Service Contract / Parking / other)

| Family | Owner-entity check | Tenant check | Mall check | Role-only fallback |
|---|---|---|---|---|
| Contract | Yes (fetches parent) | Yes | No | N/A |
| Invoice | Yes (fetches parent) | Yes | No | Yes, for non-tenant |
| Ticket | Yes (fetches parent) | Yes | No | No additional |
| Fitout (submittal/issue/daily-report, via UnifiedDocument) | Yes (fetches parent) | N/A (no tenant access) | No | Yes |
| Fitout (FitoutDocument, direct) | Yes (fetches parent) | Yes | No | Yes, for non-tenant |
| Tenant-uploaded documents | Covered by the Contract/Invoice/Ticket/Fitout families above — no separate "Tenant document" family exists as its own route | — | — | — |
| Service Contract | **No** | **No** | **No** | Role-only |
| Parking | **No** | **No** | **No** | Role-only |
| Work Order Evidence | **No** | N/A (no tenant access) | **No** | Role-only |
| Patrol Check | **No** | N/A (no tenant access) | **No** | Role-only |
| Maintenance Evidence | Partial (file-to-execution binding only) | N/A | **No** | Role-only |

## Key finding — two distinct severities within the same "GAP" label

The Phase 1/2 report correctly flagged all 8 families as `GAP` for Mall-scoping, but this session's full verification reveals **two materially different underlying situations**:
1. **Families 1-3, and the Invoice/Ticket branches of family 2**: already do real per-record ownership verification (tenant-based), just missing the Mall dimension specifically. Closing the gap here is "add a Mall check alongside the existing tenant check."
2. **Families 4-8 (Parking, Service Contract, Work Order, Patrol, Maintenance)**: have **no per-record ownership verification of any kind** — any user whose role passes the class-level gate can fetch any document ID in that family, full stop. Closing the gap here requires adding **both** an owner-entity lookup **and** a Mall check — a larger unit of work per family than families 1-3.

This distinction should directly inform `AUTH-101C`'s effort estimate in `26-CR-101-PHASE-3-BATCH-PLAN.md` — families 4-8 are not merely "add one more filter," they need the ownership-check machinery built from scratch.

## Resolver design (Section 12 — names, no code)

| Resolver name | Owner entity | Authoritative Mall path | Authoritative Tenant path | Required roles (unchanged from today) | Cross-Mall policy |
|---|---|---|---|---|---|
| `contractFile` | `ContractFile → Contract → Unit → Mall` | `contract.unit.mallId ?? contract.unit.floor.mallId` (chain exists, not currently selected) | `contract.tenantId` (already selected) | Contract edit roles | None proposed |
| `unifiedDocumentInvoice` | `UnifiedDocument → Invoice → Contract → Unit → Mall` | Via `invoice.contract.unit.mallId` (or `invoice.mallId` directly, per the `invoice` resolver already in `16-CR-101-RESOLVER-REGISTRY.md`) | `invoice.tenantId` (already selected) | ADMIN/FINANCE/MALL_DIRECTOR | None proposed |
| `unifiedDocumentTicket` | `UnifiedDocument → Ticket → Unit → Mall` | `ticket.unit.mallId` (reuses the existing `ticket` resolver) | `ticket.tenantId` (already selected) | Tickets roles | None proposed |
| `unifiedDocumentFitout` / `fitoutDocument` | `→ FitoutProject → Unit → Mall` | `project.unit.mallId` (reuses `fitoutProject` resolver) | `project.tenantId` (already selected) | Fitout roles | None proposed |
| `parkingContractDocument` | `→ ParkingCustomerContract → Mall` | **Confirmed CR-101 Phase 3A (read-only schema verification)**: `ParkingCustomerContract` has a direct, non-nullable `mallId` field with a `Mall` relation (`prisma/schema.prisma:901-902`). Reachable in one hop: `parkingContractDocument.contractId → ParkingCustomerContract.mallId`. No schema change needed. | Not currently checked at all — would be new (`ParkingCustomerContract.tenantId` exists at `prisma/schema.prisma:903-904` if a tenant check is later wanted too) | PARKING_ROLES | None proposed |
| `serviceContractDocument` | `→ ServiceContract → Mall` | **Confirmed CR-101 Phase 3A**: `ServiceContract` has a direct, non-nullable `mallId` field (`prisma/schema.prisma:1650`). Reachable in one hop: `serviceContractDocument.contractId → ServiceContract.mallId`. No schema change needed. | Not currently checked | SERVICE_CONTRACT_ROLES | None proposed |
| `workOrderEvidence` | `→ WorkOrder → Mall` | **Confirmed CR-101 Phase 3A**: `WorkOrder` has a direct, non-nullable `mallId` field with a `Mall` relation (`prisma/schema.prisma:638-639`) — no need to traverse via `Unit` (the `unitId`/`unit` relation on `WorkOrder` is optional/nullable and would be a weaker path than the direct field). Reachable in one hop: `workOrderEvidence.workOrderId → WorkOrder.mallId`. No schema change needed. | N/A | WORK_ORDER_ROLES | None proposed |
| `patrolCheckFile` | `→ PatrolCheck → Route/Point → Mall` | Patrol already has working Mall-resolution helpers elsewhere in the codebase (`routeMallId`/`pointMallId`/etc., per `patrol.controller.ts`) — **reuse those**, don't design a new chain | N/A | PATROL_ROLES | None proposed |
| `maintenanceEvidence` | `→ MaintenanceExecution → MaintenanceSchedule → Mall` | Reuses the existing `maintenanceSchedule` resolver (already registered) | N/A | MAINTENANCE_ROLES | None proposed |

**Architecture gap — resolved by this verification pass**: as of CR-101 Phase 3A, all three of `parkingContractDocument`, `serviceContractDocument`, and `workOrderEvidence` have been confirmed (by reading `prisma/schema.prisma` directly, not inferred) to have a direct, one-hop-reachable `mallId` field on their owner entity. None require a schema migration or a new mapping table — unlike `customer`/`parkingGateFacility`, which remain genuinely schema-blocked. **This verification is read-only**: no resolver code was added to `mall-access.service.ts` and no route in `files.controller.ts` was changed this phase; these three families remain `GAP`-status pending a future implementation batch (not authorized this phase — see `26-CR-101-PHASE-3-BATCH-PLAN.md`), and per the finding in the "Key finding" section above, that future batch also needs to build the owner-entity/ownership-check machinery from scratch for these three families, not just add a Mall check to an existing one.

## Status: Verified 8 of 8 (up from 2 of 8), Schema-blocked: 0 confirmed schema-blocked among these 8 (unlike `customer`/`parkingGateFacility` from the route-resolver registry, which are separately schema-blocked), Unknown: 0 (Parking/ServiceContract/WorkOrder document owner→Mall reachability confirmed CR-101 Phase 3A, read-only)

---

## CR-101 Phase 3C correction and expansion (2026-08-22, readiness review — audit only, no code changed)

**Correction to line 66 above**: this document's `patrolCheckFile` row describes the chain as `PatrolCheck → Route/Point → Mall`. Phase 3C independently re-verified the actual, currently-running `PatrolService.checkMallId()` helper and found the real chain is **`PatrolCheck.shiftId → PatrolShift.mallId`** — a *different* parent (`PatrolShift`, not `PatrolRoute`/`PatrolPoint`) than this line describes, though `PatrolPoint.routeId → PatrolRoute.mallId` is also a valid, parallel path that exists on the same `PatrolCheck` row (via `pointId`) and would very likely resolve to the same Mall in practice — the two paths are just never cross-validated against each other. The recommendation ("reuse the existing helper, don't design a new chain") was correct and remains the plan; only the specific relation path named was imprecise. Corrected here, not silently rewritten.

**Scope note**: this document's Verified-8-of-8 count covered only the `files.controller.ts` **download** side of these 8 families. Phase 3C (`28`/`29`/`30`/`31-CR-101-FILE-*.md`) expanded the investigation to the **upload/list/manage** side (the module-native controllers: `tickets`, `work-orders`, `patrol`, `fitout`×4, `parking`, `service-contracts`, `contracts`, `billing`) and found that side is, with two specific exceptions, already Mall-enforced — a materially different picture than the download side, which remains fully unenforced across all 8 families (the pre-existing `AUTH-01` finding, re-confirmed unchanged). The two confirmed exceptions on the upload/manage side — `fitout.controller.ts`'s `reviewDocument` (client-supplied `docId` not scoped to the already-checked project) and `fitout-issue.controller.ts` (protected only incidentally by the global guard, no explicit check) — are new findings from Phase 3C, not previously documented anywhere. See `29-CR-101-FILE-OWNERSHIP-MATRIX.md` and `30-CR-101-FILE-THREAT-MODEL.md` for full detail; `28-CR-101-FILE-AUTHORIZATION-READINESS.md` for the summary.
