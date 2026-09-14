# MODULE INVENTORY — reconstructed from source

Audit date: 2026-09-05
Method: reconstructed from `apps/backend/src/modules/*`, `*.controller.ts` route
prefixes, `apps/frontend/src/App.tsx` route table and `prisma/schema.prisma`.
No claim below is taken from README, menu labels or prior audit documents.

Status vocabulary: CONFIRMED / LIKELY / UNVERIFIED / REFUTED.
Connectivity vocabulary: CONNECTED / PARTIALLY CONNECTED / UI ONLY / BACKEND ONLY
/ BROKEN / DEAD CODE / UNKNOWN.

At Phase 1 every module below is classed **UNVERIFIED** for connectivity unless
this document states otherwise — a route plus a controller is *not* evidence that
a business capability works end to end. Connectivity is assigned in Phase 3+.

## 1. Scale baseline (CONFIRMED)

| Metric | Count |
|---|---|
| Backend modules (`src/modules/*`) | 34 |
| Controllers | 48 |
| Services (non-spec) | 80 |
| Prisma models | 127 |
| Prisma enums | 49 |
| Migrations | 58 |
| Backend spec files | 113 |
| Frontend test files | 53 |
| Playwright e2e specs | 8 |
| Markdown docs | 328 |

## 2. Backend modules (CONFIRMED — directory listing)

ai, analytics, announcements, approvals, audit-log, auth, billing, billing-addin,
booking, branding, categories, contracts, crm, dashboard, departments,
email-settings, fitout, inventory, notifications, parking, parking-dashboard,
patrol, proposals, reports, sales, sap, service-contracts, slots, spaces,
telemetry, tenants, tickets, users, work-orders

## 3. Controller route prefixes (CONFIRMED — `@Controller('...')`)

ai, ai-v2, ai/codebase, analytics, announcements, approvals, audit-logs, auth,
billing, billing/addin, bookings, branding, categories, contracts, crm,
crm/customers, dashboard, deal-scoring, email-settings, files,
fitout-daily-reports, fitout-issues, fitout-submittals, fitout-tasks, fitouts,
fitouts/:projectId/controls, health, inventory, mall-access, notifications,
operations, parking-dashboard, proposals, reports, sales, sap, service-catalog,
service-contracts, slots, spaces, telemetry, tenants, tickets, users

**CORRECTION (Phase 1).** An earlier revision of this document stated there was
"no `parking` or `patrol` controller prefix". That was **REFUTED** — it was an
artifact of my own extraction regex, which only matched single-quoted
`@Controller('...')`. Both controllers exist using double quotes:
`@Controller("patrol")`, `@Controller("parking")`. The corrected prefix set adds:
`patrol`, `parking`, `parking-dashboard`, `inventory`.

Recorded rather than silently edited, because it is an instance of the exact
failure mode this audit is meant to catch: a confident "CONFIRMED" claim derived
from a tool artifact rather than from the code.

## 4. Frontend routes (CONFIRMED — `App.tsx`)

`/`, `/login`, `/activate`, dashboard, spaces, bookings, proposals, approvals,
contracts, tenants, crm, crm-overview, deal-pipeline, pipeline-stats, fitout,
fitout-approvals, fitout/dashboard, fitout/settings, fitout/:projectId/gantt,
fitout/:projectId/daily-report, tickets, work-orders, inventory, patrol,
parking, parking-transaction, parking-report, service-contracts, sales, billing,
billing-addin, sap, reports, analytics, cross-mall, ai, ai/codebase,
announcements, tenant-portal, audit-log, admin, profile, `*` (NotFound)

## 5. Stated business scope vs. reconstructed inventory

The audit brief lists ~9 capability groups. Mapping to real code:

| Brief capability | Backend module | Frontend route | Status |
|---|---|---|---|
| Dashboard | dashboard | /dashboard | CONFIRMED exists |
| Units / Spaces | spaces | /spaces | CONFIRMED exists |
| Booking | booking, slots | /bookings | CONFIRMED exists |
| Proposal | proposals | /proposals | CONFIRMED exists |
| Approval | approvals | /approvals | CONFIRMED exists |
| Contract | contracts | /contracts | CONFIRMED exists |
| Tenant | tenants | /tenants | CONFIRMED exists |
| Statistics | reports, pipeline-stats | /pipeline-stats | CONFIRMED exists |
| CRM / Lead | crm, crm/customers | /crm, /crm-overview | CONFIRMED exists |
| Fitout | fitout (+4 sub-controllers) | /fitout* | CONFIRMED exists |
| Fitout Doc Approval | fitout-submittals | /fitout-approvals | CONFIRMED exists |
| Ticket | tickets | /tickets | CONFIRMED exists |
| Work Order | work-orders | /work-orders | CONFIRMED exists |
| Ops Warehouse | inventory | /inventory | CONFIRMED exists |
| Security Patrol | patrol | /patrol | CONFIRMED exists |
| Parking Ops/Txn/Reports | parking, parking-dashboard | /parking* | CONFIRMED exists |
| Service Contract | service-contracts | /service-contracts | CONFIRMED exists |
| Revenue | sales | /sales | CONFIRMED exists |
| Operational Billing Add-in | billing-addin | /billing-addin | CONFIRMED exists |
| Billing & AR | billing | /billing | CONFIRMED exists |
| SAP | sap | /sap | CONFIRMED exists |
| Deal Pipeline | deal-scoring | /deal-pipeline | CONFIRMED exists |
| Reports / Analytics | reports, analytics | /reports, /analytics | CONFIRMED exists |
| AI Assistant | ai, ai-v2, ai/codebase | /ai | CONFIRMED exists |
| Cross-Mall CEO | analytics | /cross-mall | CONFIRMED exists |
| Mall Notifications | announcements, notifications | /announcements | CONFIRMED exists |
| Tenant Portal | (tenants + auth) | /tenant-portal | CONFIRMED exists |
| System Logs | audit-log, telemetry | /audit-log | CONFIRMED exists |
| Administration | users, departments, branding, email-settings, categories | /admin | CONFIRMED exists |

**No capability in the brief was found missing at the routing/controller level.**
This says nothing about whether each is connected end to end — see Phase 3.

Modules present in code but **not** named in the brief: `branding`,
`email-settings`, `departments`, `telemetry`, `notifications`, `categories`,
`slots`, `files`, `health`, `mall-access`, `deal-scoring`, `operations`,
`service-catalog`, `ai-v2`.

## 6. Mall-scoping architecture (CONFIRMED)

Only **33 of 127** models carry a `mallId` column:

CategoryMallPricing, Department, InventoryCategory, InventoryItem,
InventoryTransaction, WorkOrder, WorkOrderTemplate, PatrolRoute, PatrolSchedule,
PatrolShift, ParkingCustomerContract, ParkingZone, ParkingShift, ParkingIncident,
Building, Floor, Zone, Unit, Lead, ServicePriceCatalog, ServiceContract, Invoice,
BillingParty, PeriodicChargeRateConfig, FloorPlanAnalysis, OccupancySnapshot,
MallPolicy, ComplianceExport, UserMallAccess, MaintenanceSchedule,
MallAnnouncement, UnifiedDocument, UnitImportLog

Core backbone entities that **do not** carry `mallId` and must derive it
transitively: `Tenant`, `Proposal`, `Contract`, `UnitBooking`, `FitoutProject`,
`Ticket`, `Payment`, `SalesTurnover`, `ApprovalWorkflow`, `Customer`.

Derivation is centralised in `common/services/mall-resolver-registry.ts`
(36 resolvers: unit, floor, contract, maintenanceSchedule, fitoutProject,
fitoutSubmittal, fitoutIssue, invoice, payment, invoiceAdjustment, booking, slot,
slotBooking, slotPricingRule, proposal, approvalStepOrWorkflow, tenant, ticket,
servicePriceCatalog, fitoutGanttTask, fitoutDailyReportEntry, announcementMall,
zone, workOrder, parkingCustomerContract, serviceContract, patrolCheck,
floorPlanAnalysis, fitoutRisk, fitoutChangeOrder, salesTurnover, crmDeal,
serviceCatalogProposal, parkingGateFacility, customer, fileOwnerEntity).

**Two distinct enforcement patterns exist** (CONFIRMED). Both must be checked
per endpoint; presence of one and absence of the other is not a defect by itself:

1. *Controller-level assertion* — handler calls `mallAccess.assertMallAccess()`
   or `mallAccess.extractAndValidateMallAccess()`.
   Example: `spaces.controller.ts` (45 endpoints / 44 mallAccess calls).
2. *Service-level filtering* — service takes `mallIds?: string[]` and applies
   `where.mallId = { in: mallIds }`.
   Example: `patrol.service.ts:95 routes(mallIds?, q?)`,
   `parking.service.ts:52 contracts(mallIds?, q?)`.

Counting only pattern 1 would have produced a **false P0** against `patrol`
(22 endpoints, 0 controller calls) and `parking` (17 endpoints, 0) — both are in
fact scoped via pattern 2. Recorded here to prevent that error being repeated.

Residual risk to test in Phase 6: in pattern 2 the `mallIds` parameter is
**optional**; when a controller passes `undefined` the filter is skipped and the
query spans all malls. Whether every caller computes and passes it is UNVERIFIED.

## 7. Self-declared scope status (CONFIRMED)

The codebase annotates endpoints with `@Scope({ type, status })`:

| EnforcementStatus | Count |
|---|---|
| ENFORCED | 121 |
| PENDING_BUSINESS_CONFIRMATION | 9 |
| GAP | 6 |

| ScopeType | Count |
|---|---|
| MALL_SCOPED | 133 |
| GLOBAL | 5 |
| TENANT_SCOPED | 3 |
| USER_SCOPED | 2 |
| SYSTEM_INTERNAL | 1 |

Controllers carrying self-declared `GAP`: `announcements`, `sales`, `spaces`,
`tickets`. These are the project's *own* admissions of unenforced scope and are
the first candidates for Phase 6 verification.

## 8. Currency architecture (CONFIRMED)

`enum CurrencyCode { VND, USD, MMK }`. Registry duplicated intentionally in
`common/constants/currency.constants.ts` (backend) and `lib/currency.ts`
(frontend).

The documented propagation chain exists **structurally**, with ownership
semantics stated in schema comments:

| Step | Model.field | schema.prisma | Declared semantics |
|---|---|---|---|
| 1 | `Unit.currencyCode` | :1239 | unit master-data rent currency |
| 2 | `UnitBooking.currencyCode` | :3211 | covers expectedRent, proposedRentPerSqm, budgetRentMin/Max, serviceFeeSqm, businessSupportFeeSqm |
| 3 | `Proposal.rentCurrency` | :1441 | "Canonical Proposal currency field" |
| 4 | `Contract.currencyCode` | :1605 | "Authoritative … propagated from Proposal.rentCurrency at creation, immutable outside the Amendment workflow once ACTIVE" |
| 5 | `BillingScheduleEntry.currencyCode` | :1665 | "Derived from Contract.currencyCode at schedule-build time" |
| 6 | `Invoice.currencyCode` | :2219 | "Derived from the source Contract/BillingScheduleEntry at invoice-creation time" |
| 7 | `Payment.currencyCode` | :2348 | "Always equal to Invoice.currencyCode — enforced server-side, never client-suppliable independently" |

Also currency-bearing: `CategoryMallPricing` (:203), `ServiceContract`,
`ServiceContractPayment`, `ProposalService`, `FitoutChangeOrder`,
`ParkingCustomerContract`, `ServicePriceCatalog`.

Whether each declared propagation is *enforced in code* is UNVERIFIED and is the
subject of Phase 7. Note every one of these columns is `@default(VND)`, which is
the database-level form of the MON-CUR-04 silent-VND hazard.

## 9. Models with monetary fields but NO currency field (CONFIRMED)

| Model | Monetary fields | Parent that could supply currency |
|---|---|---|
| SalesTurnover | grossSales, netSales | none — no currency anywhere in chain |
| SalesAuditTrail | oldValue, newValue | SalesTurnover (also none) |
| Lead | expectedRent, estimatedValue | none |
| Customer | budgetMin, budgetMax | none |
| UnitSlot | pricePerDaySqm, pricePerHour, pricePerSqmMonth | none |
| SlotBooking | baseAmount, totalAmount | UnitSlot (also none) |
| ParkingContractRate | unitPrice, excessUnitPrice | ParkingCustomerContract (has currencyCode) |
| ParkingMonthlyStatement | subtotal, adjustment, totalAmount, paidAmount | ParkingCustomerContract |
| ParkingMonthlyLine | unitPrice, excessUnitPrice, baseAmount, excessAmount, totalAmount | ParkingCustomerContract |
| ParkingDebtPayment | amount | ParkingCustomerContract |
| ParkingShift | cashRevenue, nonCashRevenue | none |
| InvoiceLine | unitPrice, amount | Invoice (has currencyCode) |
| InvoiceAdjustment | amount | Invoice |
| PeriodicChargeEntry | subtotal | to determine |
| ContractTermination | depositRefund, penaltyAmount | Contract (has currencyCode) |
| SapReconciliationRecord | ourAmount, sapAmount | none — compares two amounts |
| OccupancySnapshot | revenuePerSqm | none — aggregate |
| InventoryItem / InventoryTransaction | averageCost / unitCost | none |

Child-of-parent cases are acceptable *only if* the parent currency is applied at
every read, write and render. Cases with no parent currency at all
(SalesTurnover, Lead, Customer, UnitSlot/SlotBooking, ParkingShift,
SapReconciliationRecord) violate MON-CUR-01 by construction. Confirmed downstream
consequence already recorded as ISSUE CUR-001 in ISSUE_REGISTER.md.

## 10. Audit scope classification (set by client, Phase 1)

| Module | Scope | Note |
|---|---|---|
| patrol | OUT_OF_SCOPE_FOR_CORE_LEASING_AUDIT | documented, not audited |
| parking | OUT_OF_SCOPE_FOR_CORE_LEASING_AUDIT | **one boundary back in scope — see §11** |
| parking-dashboard | OUT_OF_SCOPE_FOR_CORE_LEASING_AUDIT | documented, not audited |
| inventory | OUT_OF_SCOPE_FOR_CORE_LEASING_AUDIT | documented, not audited |

Per client instruction these modules are **not** to be classified BROKEN, DEAD
CODE or NOT READY on the grounds that they were not audited. Their internal
correctness does not affect the Core Leasing go-live gate. Their status is
**NOT_ASSESSED**, which is distinct from "failing".

## 11. Direct-dependency exception test (CONFIRMED)

The exclusion was tested, not assumed. Two checks were run:

**(a) Do excluded modules write core tables?** — NO.
`grep -rnoP "prisma\.(contract|invoice|payment|billingScheduleEntry|salesTurnover|unit|tenant|approvalWorkflow|approvalStep|proposal|unitBooking|sapIntegrationLog|sapEntityMapping)\.(create|update|delete|upsert|...)"`
over `patrol/ parking/ parking-dashboard/ inventory/` returns **zero matches**.
None of the four creates or modifies a Contract, Unit, Tenant, BillingSchedule,
Invoice, Payment, SalesTurnover, Approval or SAP record.

**(b) Do core modules read excluded-module data?** — YES, one crossing:

- `billing/billing.service.ts:168, 485, 805` read `prisma.parkingMonthlyStatement`.
  The core AR / pending-receivables engine consumes parking financial data.
- `schema.prisma` model `ParkingCustomerContract` holds `tenantId → Tenant`,
  attaching parking contracts to the core Tenant entity.

**Result:** the *parking → core AR* boundary is brought back into scope, and only
that boundary. `patrol`, `parking-dashboard` and `inventory` show no crossing and
remain fully out of scope. Finding recorded as **CUR-004** in ISSUE_REGISTER.md.

## 12. Handover — resolved (CONFIRMED)

The brief asks whether Handover is an entity, an event, a Fitout status, or
missing. Answer: **none of the first three.**

- There is **no** `Handover` model among the 127.
- There is no `HANDOVER` value in `UnitStatus`
  (`VACANT, OFFERING, BOOKING, NEGOTIATING, CONTRACTED, UNDER_FITOUT, OCCUPIED,
  LIQUIDATED, MERGED`) nor in `ContractStatus`
  (`DRAFT, PENDING_LEGAL, PENDING_SIGNATURE, ACTIVE, EXPIRING, EXPIRED,
  TERMINATING, TERMINATED`).
- There is no `FitoutStatus` enum at all — only `FitoutDocumentStatus`. **Phase 2
  confirmed** the consequence: `FitoutProject.status` is `String @default(
  "CONTRACT_SIGNED")` with a comment claiming an FK to `FitoutStageConfig.code`
  that **does not exist** (no `@relation`, no CHECK). It is the only core
  lifecycle status that is unconstrained free text — issue **FIT-001**.
- Handover exists **only as nullable date attributes**:
  `schema.prisma:1443` `Proposal.handoverDate`, `:1861` **`FitoutProject.handoverDate`
  (resolved in Phase 2)**, `:2982-2983` `ContractTermination.handoverDate` +
  `handoverCondition` (that pair is *move-out* handover, not move-in).
- **Phase 2 addition:** a global schema search found no `acceptanceDate`,
  `acceptedAt`, `acceptedBy`, `inspectionDate` or `tenantAccepted*` field. The
  state "tenant accepted the premises" has **no representation at all** — see the
  LIFE-001 addendum in `ISSUE_REGISTER.md`.

Consequence to test in Phase 3 (priority P3): the lifecycle goes
`UNDER_FITOUT → OCCUPIED` with **no modelled handover precondition**, so
operational activation without a recorded handover is structurally possible
unless service-layer code enforces it. `UnitStatus.LIQUIDATED`'s own schema
comment ("chờ bàn giao xong mới về Trống" — only returns to Vacant once handover
completes) references a handover gate that has no state to represent it.

## 13. Remaining open questions

1. Which of the 14 code-only modules are user-reachable vs internal?
2. Do the 6 self-declared `GAP` endpoints correspond to real cross-mall leakage?
3. `ai-v2` vs `ai` vs `ai/codebase` — all three controllers exist; is `ai-v2`
   reachable from the frontend or dead code?
4. ~~Is `FitoutProject.status` a free-text String (no DB constraint)?~~
   **ANSWERED in Phase 2 — yes.** Unconstrained `String`, no FK despite the
   comment, no CHECK. FIT-001.
5. ~~Is `ContractsService.create()` reachable without a Proposal?~~
   **ANSWERED in Phase 3 — yes, via API; no UI caller.** INT-003, CONT-001.
6. ~~Who can write `FitoutStageConfig`?~~ **ANSWERED in Phase 3 — ADMIN only,
   unvalidated `@Body() body: any`, global scope, fails closed.** FIT-002.

## 14. Connectivity facts established in Phase 3

- **`contractsApi.createContract`** (`apps/frontend/src/api/contracts.ts:7`) is
  defined but called by **no page**. The UI's only contract-creation action is
  Proposal → Convert (`POST /proposals/:id/convert`). The direct
  `POST /contracts` endpoint is live and API-reachable but not UI-reachable.
- **`UnitStatusService.transition()` is the single chokepoint** for `Unit.status`.
  Verified exhaustively: `sanitizeUnitDto` (spaces.service.ts:30-49) throws on any
  generic edit containing `status`; `bulkUpdateUnits` rejects bulk status changes
  (spaces.service.ts:1421); the only direct `unit.update({status})` writes are
  merge (→MERGED) and split (→VACANT), both behind their own blockers. **No
  `force: true` exists in production code.**
- **SAP posting is manual only.** `sapService.syncInvoice` is called from nowhere
  outside `sap.controller.ts`. No cron, no outbox handler, no automatic
  propagation of any invoice to SAP.
- **`ai-v2` reachability (open question 3) remains unanswered** — not touched in
  Phase 3, which stayed on the leasing and financial backbones.
