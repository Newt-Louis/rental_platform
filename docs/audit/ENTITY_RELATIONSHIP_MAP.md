# ENTITY RELATIONSHIP MAP — Core Leasing lifecycle

Phase 2. Source: `apps/backend/prisma/schema.prisma` only. Scope: Core Leasing +
Financial backbone. Out of scope: patrol, parking internals, parking-dashboard,
inventory (except the parking→AR boundary, CUR-004).

`String` = required FK/field. `String?` = nullable.

## Matrix 1 — ENTITY RELATIONSHIP MATRIX

| Entity | PK | Critical FK | Unique constraints | Status | Currency | Mall ownership | Notes |
|---|---|---|---|---|---|---|---|
| **Lead** | id cuid | tenantId?, customerId?, mallId? | — | `LeadStatus` enum, default NEW | **none** (has expectedRent, estimatedValue) | **direct but nullable** `mallId?` | pre-conversion entity; money without currency (CUR-002) |
| **Customer** | id cuid | tenantId? | `customerCode` | `CustomerStatus` enum | **none** (budgetMin/Max) | derived (`customer` resolver) | CUR-002 |
| **Unit** | id cuid | mallId, buildingId?, floorId?, zoneId?, categoryId? | `@@unique([mallId, code])` | `UnitStatus` enum, default VACANT | **own** `currencyCode` default VND | **direct** `mallId` | root of mall derivation for most of the backbone |
| **UnitBooking** | id cuid | **unitId (required)**, leadId?, customerId? | `bookingNumber` | `BookingStatus` enum, default PENDING | **own** `currencyCode` default VND | derived via Unit | leadId AND customerId both nullable → party-less booking possible |
| **Proposal** | id cuid | **unitId (required)**, leadId?, tenantId?, bookingId? | `proposalNumber`, `bookingId` | `ProposalStatus` enum, default DRAFT | **own** `rentCurrency` default VND | derived via Unit | 1:1 with Booking enforced by DB |
| **ApprovalWorkflow** | id cuid | proposalId? | `proposalId` | `WorkflowStatus` enum, default PENDING | n/a | derived via Proposal | polymorphic (entityType/entityId) → proposalId nullable by design |
| **ApprovalStep** | id cuid | workflowId | — | `StepStatus` enum, default PENDING | n/a | derived via workflow | |
| **Contract** | id cuid | **tenantId (required)**, **unitId (required)**, proposalId? | `contractNumber`, `proposalId` | `ContractStatus` enum, default DRAFT | **own** `currencyCode` default VND — *"Authoritative … immutable outside Amendment once ACTIVE"* | derived via Unit | proposalId nullable → contract can exist with no proposal and therefore no approval linkage |
| **Tenant** | id cuid | categoryId? | `taxCode?` | — | n/a | **none** — derived | multi-mall by nature |
| **FitoutProject** | id cuid | **contractId (required)**, **tenantId**, **unitId** | `contractId` | **`String` default "CONTRACT_SIGNED"** — *not an enum, no FK* | n/a | derived via Contract/Unit | see DATABASE_INTEGRITY §Fitout |
| **BillingScheduleEntry** | id cuid | **contractId (required)**, invoiceId? | `@@unique([contractId, period])`, `invoiceId` | own status | **own** `currencyCode` — *"Derived from Contract at schedule-build time"* | derived via Contract | cascades on Contract delete |
| **Invoice** | id cuid | contractId?, tenantId?, billingPartyId?, mallId? | `invoiceNumber` | `InvoiceStatus` enum, default DRAFT | **own** `currencyCode` | **direct but nullable** `mallId?` | **all four ownership FKs nullable** — see IS-09 |
| **InvoiceLine** | id cuid | invoiceId | — | — | **parent-inherited** (no own column) | via Invoice | |
| **Payment** | id cuid | **invoiceId (required)**, tenantId?, billingPartyId? | `idempotencyKey?` | *no status field* | **own** `currencyCode` — *"Always equal to Invoice.currencyCode — enforced server-side"* | via Invoice | DB idempotency key present |
| **SalesTurnover** | id cuid | **tenantId**, **unitId** | `@@unique([tenantId, unitId, period])` | `SalesApprovalStatus` | **none** | derived via Unit | CUR-001 |
| **SapEntityMapping** | id cuid | — | `@@unique([entityType, entityId])` | — | n/a | n/a | polymorphic |
| **SapIntegrationLog** | id cuid | — | `idempotencyKey?` | — | n/a | n/a | |
| **SapReconciliationRecord** | id cuid | — | `idempotencyKey` (required) | — | **none** (ourAmount, sapAmount) | n/a | compares two amounts with no currency — CUR-002 |
| **ContractTermination** | id cuid | contractId | `contractId` | — | **none** (depositRefund, penaltyAmount) | via Contract | move-out handover fields live here |

## Declared 1:1 chain (all DB-enforced)

```
UnitBooking ──1:1──> Proposal ──1:1──> ApprovalWorkflow
                        │
                        └──1:1──> Contract ──1:1──> FitoutProject
                                     │
                                     └──1:N──> BillingScheduleEntry ──1:1──> Invoice ──1:N──> Payment
```

Enforced by: `Proposal.bookingId @unique`, `ApprovalWorkflow.proposalId @unique`,
`Contract.proposalId @unique`, `FitoutProject.contractId @unique`,
`BillingScheduleEntry.invoiceId @unique`, `@@unique([contractId, period])`.

This is a genuinely strong spine — the 1:1 cardinalities that matter for
financial identity are database-enforced, not left to application code.

## Referential actions

| Action | Count | Notes |
|---|---|---|
| `onDelete: Cascade` | 66 | includes `BillingScheduleEntry`, `ProposalVersion`, `ProposalService`, `InvoiceAdjustment`, all Fitout children |
| `onDelete: SetNull` | 4 | WorkOrder.template, PatrolCheck.schedule, ServiceContractPayment link, `ServiceContract.invoice` |
| `onDelete: Restrict` | 1 | `Department.parent` only |

`Invoice` and `Payment` do **not** cascade from Contract — financial records
survive contract deletion. `BillingScheduleEntry` **does** cascade from Contract.
Whether hard-delete of a Contract is reachable is a Phase 3 question; the models
carry `isActive`/`deletedAt` soft-delete fields, so cascade may be unreachable in
practice.
