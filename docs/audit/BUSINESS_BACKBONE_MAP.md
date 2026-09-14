# BUSINESS BACKBONE MAP — Phase 3

Executable reconstruction. Every row was traced FE → API client → controller →
DTO → service → Prisma. Rows marked *no UI caller* have a live HTTP endpoint but
no frontend code path.

## Matrix A — EXECUTABLE FLOW MATRIX

| Flow | FE entry | API | Controller | Service | Writes | Exit state | Evidence |
|---|---|---|---|---|---|---|---|
| Booking create | BookingsPage | `POST /bookings` | `booking.controller` | `BookingService.create` | UnitBooking, Unit.status→BOOKING, UnitHistory, activity | queued or ACTIVE | booking.service.ts:126,183,218 |
| Booking queue reorder | drag-drop | `PATCH /bookings/:id/priority` | booking.controller | `updatePriority` | UnitBooking.priority ×N, then status ×N **outside txn** | resequenced | booking.service.ts:804-845,1291 |
| Booking cancel | BookingsPage | `PATCH /bookings/:id/cancel` | booking.controller | `cancel` | status, promoteNextInQueue, Unit.status | next promoted or VACANT | booking.service.ts:942,1247 |
| Proposal create/submit | ProposalsPage | `POST /proposals`, `/:id/submit` | proposals.controller | `create`/`submit` | Proposal, ApprovalWorkflow, ApprovalStep | SUBMITTED | proposals.service.ts |
| Proposal approve | ApprovalsPage | `POST /approvals/...` | approvals.controller | `ApprovalsService` (Serializable) | ApprovalStep, Workflow, Proposal.status | APPROVED | proposals.service.ts:665 comment |
| **Proposal → Contract** | "Convert" button | `POST /proposals/:id/convert` | proposals.controller:104 | `createContractFromProposal` | Contract, Unit→CONTRACTED, bookings CANCELLED, Proposal→CONVERTED, Lead→WON | DRAFT contract | proposals.service.ts:659-770 |
| **Contract direct create** | **no UI caller** | `POST /contracts` | contracts.controller:153 | `ContractsService.create` | Contract, Unit→CONTRACTED, ContractEvent | DRAFT contract | contracts.service.ts:235-336 |
| Contract activate | ContractsPage | `PATCH /contracts/:id/status` | contracts.controller:170 | `updateStatus` | Contract.status, ContractEvent, OutboxEvent, BillingScheduleEntry ×N | ACTIVE + schedule | contracts.service.ts:417-520 |
| Fitout create | (auto) | outbox `contract.activated` | — | `FitoutService.create` | FitoutProject, SLA milestone | first stage | fitout.service.ts:131-150 |
| Fitout advance | FitoutPage | `PATCH /fitouts/:id/status` | fitout.controller | `advanceStatus` | FitoutProject.status, Unit.status, SLA, AuditLog on override | next stage | fitout.service.ts:197-300 |
| Unit status manual | Spaces UI | `PATCH /spaces/units/:id/status` | spaces.controller:344 | `updateUnitStatus` | Unit.status, UnitHistory | any allowed target | spaces.service.ts:571-583 |
| Billing schedule build | (auto on activate) | `POST /billing/schedule/:id/build` | billing.controller:271 | `buildScheduleForContract` | BillingScheduleEntry upsert ×N | PENDING/SKIPPED entries | billing-schedule.service.ts:27-115 |
| Invoice from schedule | Billing UI | `POST /billing/receivables/...` | billing.controller:68 | `createInvoiceFromPending` | Invoice + lines, entry.invoiceId | DRAFT invoice | billing.service.ts:413 |
| Invoice manual | Billing UI | `POST /billing/invoices` | billing.controller:124 | `createInvoice` | Invoice + lines (**no mallId**) | DRAFT invoice | billing.service.ts:936 |
| Revenue-share invoice | Sales/Billing | (generation job/action) | — | `generateRevenueShareInvoices` | Invoice (**no mallId**) | DRAFT invoice | billing.service.ts:1522-1560 |
| Payment | BillingPage / TenantPortal | `POST /billing/invoices/:id/payments` | billing.controller | `recordPayment` | Payment, Invoice.status, source receivable | PAID/PARTIALLY_PAID | billing.service.ts:1140-1240 |
| Termination initiate | ContractsPage | `POST /contracts/:id/termination` | contracts.controller:245 | `initiate` | ContractTermination, Contract→TERMINATING, Unit→LIQUIDATED | TERMINATING | contract-termination.service.ts:80-101 |
| Termination complete | ContractsPage | `POST /contracts/:id/termination/complete` | contracts.controller:261 | `complete` | termination→COMPLETED, Contract→TERMINATED, Unit→VACANT | closed | contract-termination.service.ts:141-172 |
| SAP invoice post | SAP page | `POST /sap/sync/invoice` | sap.controller:62 | `syncInvoice` | SapIntegrationLog | posted/queued | sap.service.ts:83-128 |

## The Unit state machine (Matrix B)

Reconstructed from `common/services/unit-status.service.ts:13-30`, which is the
single chokepoint. Verified: **every** production write of `Unit.status` goes
through `UnitStatusService.transition()` except the merge/split pair, which set
`MERGED`/`VACANT` directly behind their own blocker checks
(spaces.service.ts:1750,1815). `sanitizeUnitDto` (spaces.service.ts:30-49)
*throws* if a generic Spaces edit so much as mentions `status`, and
`bulkUpdateUnits` explicitly rejects a bulk status change
(spaces.service.ts:1421). There is **no `force: true` anywhere in production
code**.

| From | To | Trigger | Guard | Side effects | Atomic |
|---|---|---|---|---|---|
| VACANT | OFFERING / BOOKING / NEGOTIATING | manual or booking create | BOOKING requires an ACTIVE/PENDING booking to exist | UnitHistory | yes |
| OFFERING | VACANT / BOOKING / NEGOTIATING | manual or booking | VACANT blocked while an active booking exists | UnitHistory | yes |
| BOOKING | VACANT / OFFERING / NEGOTIATING / **CONTRACTED** | contract create | CONTRACTED requires a live Contract row | tenantId, lease dates | yes (in caller txn) |
| NEGOTIATING | VACANT / OFFERING / BOOKING / **CONTRACTED** | contract create | same | same | yes |
| CONTRACTED | UNDER_FITOUT / **OCCUPIED** / VACANT / LIQUIDATED | fitout stage or **manual** | live contract required for the committed targets | UnitHistory | yes |
| UNDER_FITOUT | **OCCUPIED** / VACANT / LIQUIDATED | fitout stage or manual | live contract required | UnitHistory | yes |
| OCCUPIED | VACANT / UNDER_FITOUT / LIQUIDATED | termination or manual | VACANT blocked while a live contract exists | clears tenantId + lease dates | yes |
| LIQUIDATED | CONTRACTED / UNDER_FITOUT / OCCUPIED / VACANT | termination cancel/complete | complete requires the 3-item handover checklist | restores `preTerminationUnitStatus` | yes |
| MERGED | — | terminal | — | — | — |

### Cross-cutting guards inside `transition()` (all unconditional, `force` cannot skip them)

1. `expectedMallId` mismatch → Forbidden, checked **before any write** (:104).
2. Moving to VACANT/OFFERING/BOOKING/NEGOTIATING while a live Contract exists → rejected (:112-127).
3. BOOKING without an ACTIVE/PENDING booking → rejected (:129-137).
4. VACANT while an active booking exists → rejected (:139-147).
5. Any COMMITTED status (OCCUPIED/CONTRACTED/UNDER_FITOUT/LIQUIDATED) **without a live Contract → rejected** (:149-162).

Guard 5 is the strongest single invariant in the platform: a Unit cannot be shown
as occupied or committed unless a live Contract row exists for it. It is enforced
in one place that every path funnels through.

### Direct skips that ARE allowed

- `CONTRACTED → OCCUPIED` — skips fit-out entirely. Intentional per the schema
  comment (short-term / no-fitout deals), but see LIFE-001.
- `CONTRACTED → LIQUIDATED`, `UNDER_FITOUT → LIQUIDATED` — deliberate, documented
  at unit-status.service.ts:18-21 (tenant default before opening).
- `VACANT → OCCUPIED` is **not** reachable — VACANT only reaches OFFERING/BOOKING/
  NEGOTIATING. Confirmed impossible.

## Proposal → Approval → Contract (Priority 10)

`createContractFromProposal` (proposals.service.ts:659) is the UI's only contract
creation route and it is strict:

- rejects any proposal not `APPROVED` (:664-668) — the comment records that
  `SUBMITTED` was previously accepted and was closed as a governance hole;
- rejects a proposal with no tenant (:669-671);
- returns the existing contract if one exists — idempotent (:673, re-checked at :681);
- **derives `tenantId` and `unitId` from the Proposal**, never from client input (:707-708);
- derives `currencyCode` from `proposal.rentCurrency` (:722);
- blocks a second live contract on the unit from a competing proposal (:685-698);
- cancels the unit's remaining booking queue, marks the proposal CONVERTED, marks
  the lead WON — all inside one **Serializable** transaction;
- resolves a lost P2002 race to "return the winner" rather than erroring.

**Priority 2 verdict: DERIVED_SERVER_SIDE.** A proposal/contract unit or tenant
mismatch is not reachable on this path — the client supplies only the proposal id.

## Handover / occupancy (Priority 6)

Two ways a Unit reaches OCCUPIED:

1. **Fitout pipeline** — a `FitoutStageConfig` row whose `triggersUnitStatus` is
   `OCCUPIED`. Reaching it requires: role OPERATION/MALL_DIRECTOR/ADMIN, contract
   ACTIVE or EXPIRING, strictly the next configured stage, and
   `checkGateRequirements()` satisfied (or an ADMIN/MALL_DIRECTOR override with a
   mandatory written reason, written to AuditLog). This path is genuinely gated.
2. **Manual** — `PATCH /api/spaces/units/:id/status` with `{"status":"OCCUPIED"}`,
   roles ADMIN / MALL_DIRECTOR / LEASING_MANAGER. The only checks are the generic
   transition rules: a live Contract must exist, and the current status must be
   CONTRACTED, UNDER_FITOUT or LIQUIDATED. **No FitoutProject, no handoverDate, no
   gate, no tenant acceptance is required.**

Path 2 makes LIFE-001 reachable. See ISSUE_REGISTER.

### The asymmetry

Move-**out** handover is enforced. `ContractTerminationService.complete()`
(contract-termination.service.ts:145-149) refuses to finalise unless
`accessCardReturn`, `signageRemoved` and `keysReturned` are all true. Move-**in**
handover has no equivalent gate on the manual path. The platform is stricter
about a tenant leaving than about a tenant taking possession.
