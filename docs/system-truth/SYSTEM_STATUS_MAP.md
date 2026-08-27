# System Truth — System Status Map

## Cross-entity status coupling

| Upstream entity.status | Downstream entity.status | Coupling enforced? | Evidence |
|---|---|---|---|
| Booking.status → ACTIVE | Unit.status → BOOKING | Yes — same Serializable transaction | `booking.service.ts` |
| Proposal.status → CONVERTED | Contract created, Unit.status → CONTRACTED, other UnitBookings for the unit cancelled, Lead.status → WON | Yes — same Serializable transaction | `proposals.service.ts:677-770` |
| Contract.status → ACTIVE | BillingScheduleEntry rows generated, `contract.activated` event → Fitout auto-create | Yes — same Serializable transaction (billing) + durable outbox (fitout) | `contracts.service.ts:393-438` |
| Contract.status → TERMINATING/TERMINATED | Unit.status → VACANT | **Partially enforced** — Contract+Termination commit atomically, but Unit release is a separate, unwrapped follow-up call | `contract-termination.service.ts:113-143` |
| FitoutProject.status → FITOUT_IN_PROGRESS (stage 6) | Unit.status → UNDER_FITOUT | Yes — same Serializable transaction | `fitout.service.ts:195-290` |
| FitoutProject.status → OPENED (stage 9) | Unit.status → OCCUPIED | Yes — same transaction | Same |
| FitoutProject.status → APPROVED_TO_OPEN (stage 8) | Unit.status — **stays UNDER_FITOUT, not yet OCCUPIED** | By design, not a bug — "handover approved" and "unit occupied" are distinct steps | Matches `docs/program/05-FITOUT-HANDOVER-COMPLETION.md` |
| PatrolCheck.result → ABNORMAL | WorkOrder created (category SECURITY) | Yes — one-way trigger | `patrol.service.ts:433-457` |
| ApprovalWorkflow.status → APPROVED (all steps) | Proposal auto-processed toward Contract creation | Yes — outbox-durable | `approvals.service.ts` → `proposals.service.ts` |
| ApprovalWorkflow.status → REJECTED | Proposal.status → REJECTED, Lead reverted, Unit released if uncommitted | **Weakly enforced** — event is non-durable (plain EventEmitter), so delivery isn't guaranteed on crash | `05-CROSS-MODULE-CONTRACTS.md` XMOD-006 |
| Invoice payments recorded | Invoice.status recomputed (PARTIALLY_PAID/PAID) | Yes — single centralized function, called after every payment/reversal/adjustment | `billing.service.ts:1103-1130` |
| ServiceContractPayment transferred to Billing | ServiceContractPayment.transferredToBillingAt/.billingError set | Yes, but **two independent code paths perform this**, one with a currency bug | `05-CROSS-MODULE-CONTRACTS.md` XMOD-010/011 |
| ParkingMonthlyStatement paid | Statement.paidAmount/.status/.reconciliationStatus written back by Billing | Yes — bidirectional coupling, not independently verified as transactional | `05-CROSS-MODULE-CONTRACTS.md` XMOD-008 |
| SlotBooking.status | No coupling to Unit.status found | N/A — Slots operate on a sub-unit "slot" concept, not the parent Unit's lifecycle | |

## Status values with unclear/undocumented meaning (dead enum values)

- `ProposalStatus.UNDER_REVIEW` — defined, never set by any code path.
- `ApprovalStep.StepStatus.SKIPPED` — defined, never set by any code path.
- `UnitStatus.MERGED` — defined, reachable only via the Spaces merge/split direct-write bypass, not through the normal `UnitStatusService` transition matrix.

All three logged in `BUSINESS_CONFIRMATION_REQUIRED.md` — future-use placeholders vs. cleanup candidates is a business/product decision, not determinable from code alone.

## Diagram

Narrative form (visual diagram deferred to a follow-up design pass):

```text
Lead(NEW..WON) ──> UnitBooking(PENDING→ACTIVE→CONVERTED) ──> Proposal(DRAFT→SUBMITTED→APPROVED→CONVERTED) ──> Contract(DRAFT→...→ACTIVE→...→TERMINATED)
                         │                                         │                                                │
                         └──> Unit.status (BOOKING) <───────────────┘                                                ├──> Unit.status (CONTRACTED → UNDER_FITOUT → OCCUPIED)
                                                                                                                       ├──> FitoutProject (9-stage) [only Serializable-transacted status coupling to Unit besides Booking/Proposal]
                                                                                                                       └──> BillingScheduleEntry → Invoice(DRAFT→ISSUED→PARTIALLY_PAID→PAID/OVERDUE)
```
