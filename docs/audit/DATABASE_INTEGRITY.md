# DATABASE INTEGRITY — Phase 2

Schema/database truth only. Per the severity rule, a state the schema permits is
recorded as **structural risk / UNVERIFIED**, not P0/P1, unless application
reachability or existing violating data is already proven.

Note on a limit of any relational schema: PostgreSQL/Prisma foreign keys
reference a single-column primary key. A schema therefore **cannot** express
"these two FKs must resolve to the same Mall" without composite keys or triggers.
Every same-mall guarantee below is consequently ALLOWED-BY-SCHEMA and must be
app-enforced. That is a property of the modelling approach, not a defect, and is
not scored as one.

## Matrix 2 — IMPOSSIBLE STATE MATRIX

| # | Invalid state | DB prevented | App prevention known | Evidence | Risk |
|---|---|---|---|---|---|
| 1 | Two ACTIVE bookings for one Unit | **NO** — `UnitBooking` has only `bookingNumber @unique`; nothing on `unitId`+status | **YES (strong)** — `booking.service.ts` `runSerializable()` wraps the priority computation and create; relies on Postgres Serializable + P2034 retry; documented "at most one ACTIVE booking per unit" queue invariant | schema.prisma UnitBooking; booking.service.ts:38-48,126 | APP_ENFORCED via isolation level, not constraint. Correct-by-design but survives only while that transaction wrapper is used |
| 2 | Two live Contracts for one Unit, overlapping periods | **NO** — no unique/exclusion constraint on `Contract.unitId` | **LIKELY** — per-unit "already has a live contract" guard added previously (memory: booking-proposal pipeline fixes) | schema.prisma Contract | structural risk; no `EXCLUDE` constraint on date ranges |
| 3 | Proposal referencing a Unit in another Mall | **NO** (cannot be expressed) | UNVERIFIED | Proposal has no `mallId`; derives via `unitId` | structural — single-parent derivation actually makes this *self-consistent*: Proposal's mall **is** its Unit's mall by definition |
| 4 | Contract referencing Proposal but different Tenant | **NO** | UNVERIFIED | `Contract.tenantId` and `Contract.proposalId` are independent FKs | structural risk — needs Phase 3 |
| 5 | Contract referencing Proposal but different Unit | **NO** | UNVERIFIED | same as #4 | structural risk — needs Phase 3 |
| 6 | ACTIVE Contract without Tenant | **YES** | n/a | `Contract.tenantId String` (NOT NULL) | **DB-PREVENTED** |
| 7 | ACTIVE Contract without Unit | **YES** | n/a | `Contract.unitId String` (NOT NULL) | **DB-PREVENTED** |
| 8 | BillingScheduleEntry without valid Contract | **YES** | n/a | `BillingScheduleEntry.contractId String` (NOT NULL) + FK | **DB-PREVENTED** |
| 9 | Invoice without Contract or valid billing source | **NO** | partial | `Invoice.contractId?`, `tenantId?`, `billingPartyId?`, `mallId?` — **all four nullable** | **highest structural finding in the financial backbone** — see IS-09 below |
| 10 | Payment without Invoice | **YES** | n/a | `Payment.invoiceId String` (NOT NULL) | **DB-PREVENTED** |
| 11 | Payment currency ≠ Invoice currency | **NO** (no composite FK) | **YES (proven)** — request rejected with *"Hệ thống chưa hỗ trợ thanh toán chuyển đổi ngoại tệ"* | billing.service.ts:1154-1156 | APP_ENFORCED, verified in code |
| 12 | FitoutProject without Contract | **YES** | n/a | `FitoutProject.contractId String` (NOT NULL) | **DB-PREVENTED** |
| 13 | Multiple FitoutProjects for one Contract | **YES** | n/a | `FitoutProject.contractId @unique` | **DB-PREVENTED** |
| 14 | OCCUPIED Unit without Fitout/Handover evidence | **NO** | UNVERIFIED | no handover state exists at all — LIFE-001 | structural gap (see §Handover) |
| 15 | Unit VACANT while ACTIVE Contract exists | **NO** | UNVERIFIED | `Unit.status` and `Contract.status` are independent columns | structural risk — Phase 3 must check `UnitStatusService` |
| 16 | SalesTurnover with incompatible currency semantics | **NO** — `SalesTurnover` has no currency at all | **NO** | schema.prisma:2174-2195; billing.service.ts:1522 | **CUR-001 (P1, CONFIRMED reachable)** |
| 17 | ApprovalWorkflow detached from Proposal/Contract | **NO** | by design | `ApprovalWorkflow.proposalId String?` — workflow is polymorphic (`entityType`/`entityId`: PROPOSAL, FITOUT_SUBMITTAL, …) | nullable is intentional for polymorphism; cost is loss of FK guarantee for non-Proposal workflows |
| 18 | Cross-Mall parent/child relationships | **NO** (not expressible) | per-entity | see note above | universal structural property; enforcement is Phase 6 |
| 19 | Tenant holding records across multiple Malls | **NO** | by design | `Tenant` has no `mallId` | intentional — a tenant legitimately operates in several malls |
| 20 | Contract ACTIVE without Approval completion | **NO** | UNVERIFIED | `Contract.proposalId?` nullable → a Contract created directly has no Proposal, hence no `ApprovalWorkflow` (which hangs off `proposalId`) | **structural risk, high business relevance** — Phase 3 must test `ContractsService.create()` |

### IS-09 — Invoice ownership is fully nullable

`Invoice.contractId?`, `Invoice.tenantId?`, `Invoice.billingPartyId?`,
`Invoice.mallId?` are all nullable. The database therefore permits an invoice
belonging to no contract, no tenant, no billing party and no mall.

This is partly **intentional**: the AR funnel issues invoices for sources that
have no leasing Contract (short-term `SlotBooking`, parking statements,
periodic charges), and `billingPartyId` exists as an alternative counterparty to
`tenantId`. So nullability is a deliberate polymorphic-source design.

The consequence that matters is for Phase 6: an `Invoice` with `mallId = NULL`
cannot be mall-filtered by its own column. The codebase already recognises this —
`ai/ai.service.ts:203-207` explicitly fail-closes on it:
*"Invoice.mallId is direct but nullable — when mallIds is non-null, an `{in: mallIds}` filter also correctly excludes any invoice with no resolvable mallId at all, matching the fail-closed default."*
Whether every other invoice query does the same is Phase 6 work.

## Matrix 3 — BUSINESS UNIQUENESS MATRIX

| Invariant | DB | App | Effective protection | Evidence |
|---|---|---|---|---|
| Unit → at most one active Booking | ✗ | ✓ Serializable txn + retry | **APP_ENFORCED** | booking.service.ts:38-48,126 |
| Booking → Proposal (1:1) | ✓ `Proposal.bookingId @unique` | — | **DB_ENFORCED** | schema |
| Proposal → Contract (1:1) | ✓ `Contract.proposalId @unique` | — | **DB_ENFORCED** | schema |
| Proposal → ApprovalWorkflow (1:1) | ✓ `ApprovalWorkflow.proposalId @unique` | — | **DB_ENFORCED** | schema |
| Contract → FitoutProject (1:1) | ✓ `FitoutProject.contractId @unique` | — | **DB_ENFORCED** | schema |
| Contract → one schedule entry per period | ✓ `@@unique([contractId, period])` | — | **DB_ENFORCED** | schema |
| Schedule entry → one Invoice | ✓ `BillingScheduleEntry.invoiceId @unique` | — | **DB_ENFORCED** | schema |
| Invoice business number | ✓ `invoiceNumber @unique` | generated `INV-YYYY-NNNNN` (random 5 digits) | **DB_ENFORCED** (collision → constraint error, not duplicate) | billing.service.ts:929-931 |
| Payment idempotency | ✓ `Payment.idempotencyKey @unique` (nullable) | — | **PARTIAL** — enforced only when a key is supplied | schema |
| SAP posting idempotency | ✓ `SapIntegrationLog.idempotencyKey?`, `SapReconciliationRecord.idempotencyKey` (required) | — | **DB_ENFORCED** for reconciliation, **PARTIAL** for integration log | schema |
| SAP entity mapping | ✓ `@@unique([entityType, entityId])` | — | **DB_ENFORCED** | schema |
| Contract → one termination | ✓ `ContractTermination.contractId @unique` | — | **DB_ENFORCED** | schema |
| Unit code within a Mall | ✓ `@@unique([mallId, code])` | — | **DB_ENFORCED** | schema |
| Turnover per tenant/unit/period | ✓ `@@unique([tenantId, unitId, period])` | — | **DB_ENFORCED** | schema |
| One live Contract per Unit | ✗ | likely guard | **APP_ENFORCED (unverified)** | Phase 3 |
| No duplicate Invoice per contract+period+type | ✗ | `findFirst` check-then-create for REVENUE_SHARE | **APP_ENFORCED, race-prone** | billing.service.ts:1526-1529 |

Overall: the identity spine is unusually well constrained at the database level.
The two notable app-only cases (active booking per unit; one live contract per
unit) are both defended by deliberate concurrency design rather than neglect.

## Matrix 4 — MALL OWNERSHIP MATRIX

| Entity | Direct `mallId` | Derived via | DB same-mall guarantee |
|---|---|---|---|
| Unit | ✓ | — | n/a (is the anchor) |
| Lead | ✓ **nullable** | — | none |
| Invoice | ✓ **nullable** | contract → unit | none |
| ServiceContract, WorkOrder, MallAnnouncement, UnifiedDocument, OccupancySnapshot, CategoryMallPricing, BillingParty | ✓ | — | none |
| UnitBooking | ✗ | `unitId` → Unit | none |
| Proposal | ✗ | `unitId` → Unit | none |
| Contract | ✗ | `unitId` → Unit | none |
| FitoutProject | ✗ | `contractId`/`unitId` | none |
| ApprovalWorkflow / ApprovalStep | ✗ | proposal → unit | none |
| Ticket | ✗ | resolver | none |
| Payment | ✗ | invoice → contract → unit | none |
| SalesTurnover | ✗ | `unitId` → Unit | none |
| Tenant | ✗ | intentionally multi-mall | n/a |

Derivation is centralised in `common/services/mall-resolver-registry.ts` (36
resolvers). **No DB-level same-mall guarantee exists anywhere** — expected, per
the note at the top. Phase 6 tests whether the application closes it.

Structural mismatch risk worth carrying forward: `Proposal.unitId` (mall A) and
`Proposal.tenantId` are independent; `Contract.unitId` and `Contract.tenantId`
likewise. Because Tenant is deliberately mall-less, the risk is not
"tenant from another mall" but "child rows whose Unit-derived mall differs from
the mall the actor was authorised for" — a Phase 6 access question, not a data
model defect.

## Matrix 5 — CURRENCY OWNERSHIP MATRIX (structure only)

| Entity | Monetary fields | Currency source | Can exist without currency context |
|---|---|---|---|
| Unit | baseRentPerSqm, camPerSqm, marketRentPerSqm, askingRentPerSqm | **OWN** (`currencyCode`, default VND) | no |
| UnitBooking | expectedRent, proposedRentPerSqm, budgetRentMin/Max, serviceFeeSqm, businessSupportFeeSqm | **OWN** (`currencyCode`) | no |
| Proposal | rentPerSqm, monthlyRent, camPerSqm, deposit, totalContractValue | **OWN** (`rentCurrency`) | no |
| Contract | rent, cam, deposit | **OWN** (`currencyCode`, authoritative, immutable once ACTIVE) | no |
| BillingScheduleEntry | amounts | **OWN** (derived from Contract) | no |
| Invoice | subtotal, vatAmount, totalAmount, adjustmentAmount, refundedAmount | **OWN** | no |
| InvoiceLine | unitPrice, amount | **PARENT_INHERITED** (Invoice) | no — `invoiceId` required |
| InvoiceAdjustment | amount | **PARENT_INHERITED** (Invoice) | no |
| Payment | amount | **OWN** (must equal Invoice) | no — `invoiceId` required |
| ContractTermination | depositRefund, penaltyAmount | **PARENT_INHERITED** (Contract) | no — `contractId` required |
| **SalesTurnover** | grossSales, netSales | **NO_CURRENCY** | **yes** — CUR-001 |
| **Lead** | expectedRent, estimatedValue | **NO_CURRENCY** | **yes** |
| **Customer** | budgetMin, budgetMax | **NO_CURRENCY** | **yes** |
| **UnitSlot / SlotBooking** | pricePerDaySqm, pricePerHour, pricePerSqmMonth / baseAmount, totalAmount | **NO_CURRENCY** | **yes** |
| **SapReconciliationRecord** | ourAmount, sapAmount | **NO_CURRENCY** | **yes** |
| **PeriodicChargeEntry** | subtotal | parent `contract` | to confirm |

### Chain traceability verdict

The declared chain
`Unit → Booking → Proposal → Contract → BillingScheduleEntry → Invoice → Payment`
is **structurally traceable end to end**: every step carries its own currency
column *and* the FK needed to re-derive it from the parent.

One structural break: **`Contract.proposalId` is nullable**, so a Contract may
exist with no Proposal. Currency is not lost (Contract owns its own
`currencyCode`), but the *provenance* of that currency is unverifiable for
directly-created contracts.

No child in the chain can exist without its currency-bearing parent — all the
linking FKs (`Payment.invoiceId`, `BillingScheduleEntry.contractId`,
`Contract.unitId`, `Proposal.unitId`, `UnitBooking.unitId`) are NOT NULL.

Every currency column is `@default(VND)` — carried as CUR-003.

## Fitout status (Priority 4) — RESOLVED

`FitoutProject.status String @default("CONTRACT_SIGNED") // FK to FitoutStageConfig.code`

- **Not** a Prisma enum. **Not** nullable. **No CHECK constraint.**
- The comment claims a foreign key to `FitoutStageConfig.code`. **There is no
  `@relation` on that field** — verified by listing every `@relation` in the
  model (contract, tenant, unit, operationManager only). `FitoutStageConfig.code`
  *is* `@unique`, so it could have been an FK target; the relation was simply
  never declared.
- Result: the only core-lifecycle status that is **unconstrained free text**.
  Any string is writable. Recorded as **FIT-001**.

`FitoutStageConfig` is a **runtime-configurable state machine**:
`code`, `order`, `phaseGroup`, `roleColumn`, `meetingRequired`,
`triggersUnitStatus String?` ("UnitStatus cần chuyển khi vào stage này"),
`setsField String?` ("Field trên FitoutProject cần set now()"), `isActive`.

So **Unit status transitions are driven by configuration rows, not code**, and
`triggersUnitStatus` is itself an unconstrained String. An admin editing this
table changes the unit lifecycle. Carried to Phase 3/4 as **FIT-002**.

## Handover (Priority 5) — structural answer

Can the database distinguish these five states?

| State | Representation | Distinguishable |
|---|---|---|
| A. Fitout work completed | a value of the free-text `FitoutProject.status` | only by convention |
| B. Fitout approved | separate entities exist (`FitoutSubmittal`, `FitoutDocument`, `FitoutDocumentStatus` enum, `ApprovalWorkflow` with entityType FITOUT_SUBMITTAL) | **yes** |
| C. Physical handover completed | `FitoutProject.handoverDate DateTime?` — a nullable date, no status, no actor, no evidence link | weakly |
| D. **Tenant accepted premises** | **none** — no `acceptanceDate`, `acceptedAt`, `acceptedBy`, `inspectionDate`, `tenantAccepted*` anywhere in the schema | **NO** |
| E. Unit became occupied | `UnitStatus.OCCUPIED` + `FitoutProject.actualOpenDate?` | yes |

A, C and E collapse into one free-text status plus two nullable dates
(`handoverDate`, `actualOpenDate`), with no ordering guarantee between them and
no actor/evidence attribution. **D has no representation at all.**

`ContractTermination.handoverDate` + `handoverCondition` model the **move-out**
handover — so the schema models handover-on-exit more richly than
handover-on-entry.

Confirms and extends **LIFE-001**. No redesign proposed at this stage.
