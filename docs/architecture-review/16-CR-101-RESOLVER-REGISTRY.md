# 16 — CR-101 Resolver Registry

Design only. No code. Defines the centralized entity→Mall resolution logic that every `@Scope(MALL, { resolver: X })` declaration (see `14-CR-101-SCOPE-MODEL.md`) refers to by name, replacing today's duplicated ad hoc lookups.

## Principle

`MallAccessService.extractAndValidateMallAccess()` (`common/services/mall-access.service.ts:51-266`) already contains correct, working resolution *logic* for ~15 entity types — the defect is not in this logic, it's in how a route *opts into* using it (today: an implicit, incomplete, hardcoded field-name/path-substring guess; proposed: an explicit per-route declaration naming exactly which resolver applies). This registry formalizes the EXISTING resolvers as named, reusable units and extends the list with resolvers needed to close the confirmed gaps.

## Existing resolvers (already implemented, to be kept as-is and simply made explicitly addressable)

| Resolver name | Entity | Path to Mall | Source (verified) |
|---|---|---|---|
| `unit` | Unit | `unit.mallId ?? unit.floor.mallId` | `mall-access.service.ts:42-49` |
| `floor` | Floor | `floor.mallId` | `mall-access.service.ts:85-91` |
| `contract` | Contract | `contract.unit.mallId ?? contract.unit.floor.mallId` | `mall-access.service.ts:93-99` |
| `maintenanceSchedule` | MaintenanceSchedule | `schedule.mallId` | `mall-access.service.ts:101-104` |
| `fitoutProject` | FitoutProject | `project.unit.mallId ?? project.unit.floor.mallId` | `mall-access.service.ts:106-112` |
| `fitoutSubmittal` | FitoutSubmittal | `submittal.project.unit.mallId ?? ...floor.mallId` | `mall-access.service.ts:114-120` |
| `fitoutIssue` | FitoutIssue | `issue.unit.mallId ?? issue.unit.floor.mallId` | `mall-access.service.ts:122-128` |
| `invoice` | Invoice | `invoice.mallId ?? invoice.contract.unit.mallId ?? ...floor.mallId ?? invoice.billingParty.mallId` (fail-closed: throws if entity found but no mallId resolves) | `mall-access.service.ts:130-143` |
| `payment` | Payment | via parent `invoice`'s chain (fail-closed) | `mall-access.service.ts:145-166` |
| `invoiceAdjustment` | InvoiceAdjustment | via parent `invoice`'s chain (fail-closed) | `mall-access.service.ts:168-183` |
| `booking` | UnitBooking | `booking.unit.mallId ?? ...floor.mallId` | `mall-access.service.ts:185-191` |
| `slot` | UnitSlot | `slot.unit.mallId ?? ...floor.mallId` | `mall-access.service.ts:193-199` |
| `slotBooking` | SlotBooking | `booking.slot.unit.mallId ?? ...` | `mall-access.service.ts:201-207` |
| `slotPricingRule` | SlotPricingRule | `rule.slot.unit.mallId ?? ...` | `mall-access.service.ts:209-215` |
| `proposal` | Proposal | `proposal.unit.mallId ?? ...floor.mallId` | `mall-access.service.ts:217-223` |
| `approvalStep` / `approvalWorkflow` | ApprovalStep / ApprovalWorkflow | via linked Proposal or FitoutSubmittal's chain | `mall-access.service.ts:225-240` |
| `tenant` | Tenant | via active Contract's or Proposal's unit chain | `mall-access.service.ts:242-252` |
| `ticket` | Ticket | `ticket.unit.mallId ?? ...floor.mallId` | `mall-access.service.ts:254-260` |

## New resolvers needed to close confirmed gaps

| Resolver name | Entity | Path to Mall | Needed for |
|---|---|---|---|
| `unitDirect` | Unit (by its own `:id`, not via another entity's `unitId` field) | Same logic as `unit` above, just addressable when the route's own resource IS the Unit (today's `unit` resolver is only reachable via a `unitId`-named field on some other request; Spaces' `/units/:id` routes need the resolver addressable when `:id` IS the unit itself) | Spaces `/units/*` routes — the single highest-priority new resolver, closes P0-002 |
| `fitoutRisk` / `fitoutChangeOrder` | FitoutRisk / FitoutChangeOrder | `risk.project.unit.mallId ?? ...` (same chain shape as `fitoutSubmittal`) | `fitout-controls.controller.ts` |
| `fitoutGanttTask` | FitoutTask (Gantt) | `task.project.unit.mallId ?? ...` | `fitout-gantt.controller.ts`'s `:id` mutate/delete routes |
| `fitoutDailyReportEntry` | FitoutDailyReport entry | `entry.project.unit.mallId ?? ...` | `fitout-daily-report.controller.ts`'s `:entryId/photos` routes |
| `salesTurnover` | SalesTurnover | `turnover.unit.mallId ?? ...floor.mallId` | `sales.controller.ts` |
| `parkingGateFacility` | (external MSSQL, no Prisma entity) | Requires a NEW mapping table/config (`parkingCode` → `mallId`), since no relational chain exists today — **this is a schema/config addition, not purely an authorization-wiring fix; flag as a dependency, not assume it's free** | `parking-dashboard.controller.ts` |
| `crmDeal` | Lead (the entity `getUnifiedDeals` actually queries) | `lead.mallId` (field already exists on `Lead`, per System Truth — the gap is the query not filtering by it at the DB level, not a missing relational chain) | `crm.controller.ts`'s `getUnifiedDeals` |
| `customer` | Customer | **No `mallId` field exists on the model at all** — this resolver cannot be built until `BC-016` is answered and, if the answer requires it, a schema change adds a Mall relationship (directly, or transitively via `Customer.tenantId → Tenant → active Contract → Unit`, which already exists as a nullable link) | `customers.controller.ts` — **explicitly flagged as schema-dependent, not purely an authorization-wiring fix** |
| `serviceCatalogProposal` | Proposal (via `proposalId`) | Reuse the existing `proposal` resolver directly — this is not a new resolution chain, just a new call site | `service-catalog.controller.ts` |
| `announcementMall` | MallAnnouncement | `announcement.mallId` (direct field, already exists) | `announcements.controller.ts`'s admin CRUD path — simplest fix in this entire registry, the field already exists and is already used correctly on the read side, just needs the same validation applied to the write side |
| `fileOwnerEntity` | (varies by document type) | See table below — each file type has its own chain, distinct per document-family | `files.controller.ts` |

## `fileOwnerEntity` sub-resolvers (one per document family, per `docs/architecture-review/02-FILE-SECURITY-ARCHITECTURE.md`'s ownership table)

| File type | Chain |
|---|---|
| `ContractFile` | `file.contract.unit.mallId ?? ...floor.mallId` (reuses `contract` resolver once `contractId` is available from the file record) |
| `UnifiedDocument` (Invoice) | `doc.invoice` → reuses `invoice` resolver |
| `UnifiedDocument` (Ticket) | `doc.ticket` → reuses `ticket` resolver |
| `UnifiedDocument` (Fitout) | `doc.fitoutProject` → reuses `fitoutProject` resolver |
| `FitoutDocument` | `doc.project.unit.mallId ?? ...` (reuses `fitoutProject` resolver) |
| `ParkingContractDocument` | `doc.parkingContract.mallId` (direct field on `ParkingCustomerContract`, per System Truth — not independently re-verified this session, flag for confirmation) |
| `ServiceContractDocument` | `doc.serviceContract` → needs its own chain, not independently traced this session — flag for confirmation before implementation |
| `WorkOrderEvidence` | `doc.workOrder.unit.mallId ?? ...` (assumes WorkOrder has a Unit relation — not independently re-verified this session) |
| `PatrolCheck` (evidence) | `check.point.route.mallId` or similar — Patrol's own mall-scoping chain was found correctly implemented elsewhere in the codebase (`patrol.controller.ts` uses `routeMallId`/`pointMallId`/`shiftMallId`/`checkMallId` helpers already) — **this sub-resolver should literally reuse those existing helper functions**, not be redesigned from scratch |
| `MaintenanceExecution` (evidence) | via `MaintenanceSchedule`'s existing `maintenanceSchedule` resolver |

**Every "not independently re-verified this session" note above is a specific, bounded, cheap pre-implementation task** — confirming one Prisma relation chain each — not a design gap. List consolidated here so Phase 1 of the migration plan has a concrete checklist rather than an open-ended "verify everything" task.

## Avoiding duplicated ad-hoc lookup logic (the review's explicit concern)

Patrol's controller already independently invented its own resolver-helper pattern (`routeMallId`/`pointMallId`/etc., not going through `MallAccessService` at all) — this is a second, parallel resolution mechanism that happens to work today but duplicates what this registry formalizes. **Recommendation**: fold Patrol's helpers into this registry as named resolvers (`patrolRoute`, `patrolPoint`, `patrolShift`, `patrolCheck`) during Phase 1, so there is exactly ONE resolver registry platform-wide, not two parallel-but-compatible ones. This is a refactor with zero behavior change (Patrol's logic is already correct), scoped entirely within Phase 1's "annotate what already works" step.

## Status

Design proposed — extends existing, working resolution logic rather than replacing it. New resolvers needed are enumerated above with their dependency status (pure wiring vs. schema-dependent) made explicit.
