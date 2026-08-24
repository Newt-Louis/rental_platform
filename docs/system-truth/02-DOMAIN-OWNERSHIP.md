# System Truth — 02 — Domain Ownership

> Verified against `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`'s hypothesis mapping. That file assigns review *roles*; this document verifies actual *code* ownership boundaries — i.e., does each module's own service layer mediate all writes to its data, or do other modules reach in directly?

## Ownership boundary verdicts

| Module | Clean write boundary? | Evidence |
|---|---|---|
| approvals | **YES — cleanest in the platform** | Zero direct `prisma.approvalWorkflow`/`prisma.approvalStep` writes found outside `/approvals/`; consumers (Proposals, Fitout) only read via `@OnEvent` listeners. |
| booking | Mostly yes | All mutations route through `BookingService`; cross-module reads of `prisma.unitBooking` (CRM, Proposals, Dashboard, Spaces) are read-only. |
| fitout | Mostly yes | `FitoutService`/`FitoutStageConfigService` own the stage pipeline; Unit-status side effects correctly proxy through the shared `UnitStatusService`. |
| inventory | Yes | No cross-module reach-in found; fully self-contained, best transaction discipline of the space-ops group. |
| patrol | Yes | Self-contained except its confirmed one-way trigger into Work Orders (a legitimate cross-module write via `WorkOrdersService`-equivalent create, not a direct table reach-in). |
| work-orders | Yes | Self-contained; Inventory and Tickets confirmed to have **no** relationship to Work Orders despite grouping assumption in `04-BUSINESS-PROCESS-CATALOG.md`'s BP-009. |
| tickets | Yes for writes; **gap on 3 read endpoints** | `escalations`/`rate`/`rating` service methods accept no `currentUser`, bypassing the ownership check that every other method in the same service applies. |
| sales | Yes | Self-contained `SalesTurnover`/`SalesAuditTrail`; consumed read-only by Billing's revenue-share calc. |
| service-contracts | Yes | Self-contained; the "transfer to billing" write into `Invoice` is intentional cross-module output, not a reach-in. |
| parking | Yes | Self-contained; Billing reads `ParkingMonthlyStatement` **and writes back** `paidAmount`/`status`/`reconciliationStatus` — a genuine bidirectional coupling (Billing writes into Parking's table), not merely a read. |
| parking-dashboard | N/A | Not an ERP-data owner at all — a thin read proxy over an external MSSQL system with no Prisma model. |
| slots | Yes | Self-contained `UnitSlot`/`SlotPricingRule`/`SlotBooking`; feeds Billing read-only. |
| spaces | Mostly, with one bypass | `UnitStatusService` (shared, common/) is the de-facto single writer of `Unit.status` for the normal lifecycle (20 confirmed call sites platform-wide) — but `SpacesService.mergeUnits`/`splitUnit` write `Unit.status` directly, bypassing it, because `MERGED` isn't representable in the shared transition matrix. |
| crm | **NO** | `prisma.lead.*`/`prisma.customer.*`/`prisma.unitBooking.*` called directly from `booking.service.ts`, `proposals.service.ts`, `deal-scoring.service.ts`, `reports.service.ts`, `slots.service.ts`, `dashboard.service.ts`, `spaces.service.ts` — none route through `CrmService`/`CustomersService`. |
| proposals | **NO** | `prisma.proposal.*` written directly from `booking.service.ts`, `contracts.service.ts`, `crm.service.ts`, `billing.service.ts`, `ai.service.ts`, `spaces.service.ts`, `reports.service.ts`. |
| contracts | **NO** | `prisma.contract.*` written directly from `billing.service.ts`, `billing-schedule.service.ts`, `analytics/*`, `dashboard.service.ts`, `sales.service.ts`, `tenants.service.ts`, `spaces.service.ts`, `ai.service.ts`, `proposals.service.ts`. |
| billing | Mostly yes, with intentional bidirectional coupling | Owns `Invoice`/`Payment`/`InvoiceLine`/`InvoiceAdjustment`; itself reaches into Parking/Service-Contracts/Slots tables to read pending receivables and write back sync fields — architecturally intentional (documented pattern), but means those three modules do not have exclusive write ownership of their own payment-status fields. |
| dashboard, reports, analytics, ai | N/A (consumers) | Pure read-side aggregators; see `13-REPORTING-DEFINITIONS.md` for the extensive independent-reimplementation findings — these modules don't violate other modules' write ownership, but they do violate *formula* ownership (recompute rather than call the owning module's calculation). |
| tenants, auth, users, categories, audit-log, notifications, sap, telemetry, branding, announcements | Not deeply re-audited for reach-in beyond what's noted in `03-DATA-OWNERSHIP.md` and the security stream | No contrary evidence found in the research pass. |

## Domain boundary violations found (consolidated)

The pattern above — CRM, Proposals, and Contracts all lacking a clean write boundary, while Booking, Approvals, Fitout, Inventory, Patrol, Work Orders, Tickets, Sales, Service-Contracts, Parking, Slots are clean — is itself a finding: **the core Lead→Booking→Proposal→Approval→Contract chain (BP-001) is exactly where boundary discipline is weakest**, which is also the highest-value chain for financial and status correctness. This is logged as `CONTRA-004` in `ARCHITECTURE_CONTRADICTIONS.md`.

## Summary table

| Module | Owns (entities) | Reached into by | Boundary violations found |
|---|---|---|---|
| crm | Lead, Customer | booking, proposals, deal-scoring, reports, slots, dashboard, spaces | Yes — no clean boundary |
| proposals | Proposal, ProposalVersion | booking, contracts, crm, billing, ai, spaces, reports | Yes — no clean boundary |
| contracts | Contract, ContractEvent, ContractTermination | billing, billing-schedule, analytics, dashboard, sales, tenants, spaces, ai, proposals | Yes — no clean boundary |
| billing | Invoice, Payment, InvoiceAdjustment | (itself reaches into parking/service-contracts/slots) | Intentional bidirectional coupling, not a violation of billing's own boundary |
| spaces | Mall, Floor, Zone, Unit (via UnitStatusService for status) | (self, except merge/split bypass) | Yes — merge/split bypasses shared status service |
| approvals, booking, fitout, inventory, patrol, work-orders, tickets, sales, service-contracts, parking, slots | (own tables) | None found | No |
