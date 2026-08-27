# System Truth — 04 — State Machines

## Lead (CRM)
- States: NEW→CONTACTED→QUALIFIED→PROPOSAL→NEGOTIATION→WON/LOST (`schema.prisma:97-105`).
- Enforcement: **partial**. Only the jump to WON is guarded (blocked unless a linked proposal is APPROVED/CONVERTED, `crm.service.ts:270-282`). All other transitions (NEW→WON directly is blocked only by the WON-specific guard; NEW→LOST, WON→NEW, etc.) are accepted with no adjacency check.
- External readers: Proposals, Dashboard, Reports.
- Confidence: HIGH.

## Customer (CRM)
- States: PROSPECT/NEGOTIATING/ACTIVE/INACTIVE/BLACKLISTED, driven off Lead status via mapping tables with a monotonic-rank guard (ACTIVE/INACTIVE never downgrade) — **enforced**.
- Confidence: HIGH.

## UnitBooking (Booking)
- States: PENDING→ACTIVE→{EXPIRED, CANCELLED, CONVERTED} (`schema.prisma:61-67`).
- Enforcement: centralized via `requireBooking()` allowed-status guards on every mutating method; queue-position invariant (`priority===1 ⇒ ACTIVE`) recomputed atomically inside Serializable transactions.
- Sub-state: `PriceApprovalStatus` (PENDING/APPROVED/REJECTED) gates conversion to Proposal.
- Confidence: HIGH — best-enforced state machine in the Core Leasing group besides Contracts.

## Proposal
- States: DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED→REJECTED, plus APPROVED→CONVERTED (`schema.prisma:211-218`).
- Enforcement: per-method (not a central matrix) but consistently applied.
- **`UNDER_REVIEW` is a defined enum value with no code path that ever sets it** — dead/unused state.
- Confidence: HIGH.

## ApprovalWorkflow / ApprovalStep
- Workflow: PENDING→IN_PROGRESS→APPROVED/REJECTED — **PENDING is never actually used**; workflows are always created directly as IN_PROGRESS.
- Step: PENDING→APPROVED/REJECTED/SKIPPED — **SKIPPED is defined but never set by any code path found**, same dead-enum-value pattern as Proposal's UNDER_REVIEW.
- Enforcement: sequential (`approve()` rejects if an earlier step isn't APPROVED); one rejection kills the whole workflow immediately.
- Confidence: HIGH.

## Contract
- States: DRAFT→PENDING_LEGAL→PENDING_SIGNATURE→ACTIVE→{EXPIRING,EXPIRED,TERMINATING}→{EXPIRED,TERMINATED} (`schema.prisma:242-251`).
- Enforcement: **the only module-level explicit adjacency-table data structure found** (`CONTRACT_STATUS_TRANSITIONS`, `contracts.service.ts:21-32`) — most rigorous state-machine implementation in the platform. Field-level mutability is also state-gated (amendment-only fields locked post-ACTIVE).
- Auto-transitions ACTIVE→EXPIRING/EXPIRED via a scheduled job.
- Confidence: HIGH.

## ContractTermination (sub-entity)
- States: implied INITIATED→COMPLETED, tracked separately from `Contract.status`.
- **Enforcement gap**: `initiate()` writes the termination record and `Contract.status=TERMINATING` as two separate unwrapped statements; `complete()` writes termination-COMPLETED + Contract-TERMINATED atomically but the subsequent Unit-status release is **outside** that transaction. See `08-TRANSACTION-BOUNDARIES.md`.
- Confidence: HIGH (gap confirmed, not speculative).

## Invoice (Billing)
- States: DRAFT→ISSUED→PARTIALLY_PAID→PAID / OVERDUE / CANCELLED (`schema.prisma:379-386`).
- Enforcement: single centralized function, `recomputeInvoiceStatusFromPayments()`, called after every payment/reversal/adjustment/issue — genuine single-writer pattern, the platform's cleanest status-recompute design.
- Confidence: HIGH.

## BillingScheduleEntry
- States: PENDING→INVOICED→SKIPPED.
- Confidence: MEDIUM (not deeply re-verified this pass beyond schema).

## ServiceContract
- States: DRAFT/PROPOSAL/UNDER_REVIEW/PENDING_SIGNATURE/ACTIVE/EXPIRING/EXPIRED/TERMINATED/RENEWED/CANCELLED, enforced via an explicit `ALLOWED_TRANSITIONS` map — same discipline pattern as Parking.
- `ServiceContractPayment.status` is free-text `String`, not a DB enum, guarded only by a "read-only once transferred" check.
- Confidence: HIGH.

## ParkingCustomerContract
- States: DRAFT/ACTIVE/SUSPENDED/EXPIRED/TERMINATED/RENEWED, free-text `String` field, enforced via explicit `STATUS_TRANSITIONS` map.
- `ParkingMonthlyStatement.status` (UNPAID/PARTIAL/PAID) and `.reconciliationStatus` (PENDING/MATCHED/DISPUTED/TRANSFERRED_TO_BILLING) are both free-text, no enum.
- Confidence: HIGH.

## SalesTurnover
- `SalesApprovalStatus`: PENDING/APPROVED/DISPUTED, with revision-resets-to-PENDING logic ("if figures change, prior approval no longer applies").
- Enforcement: correct logically, but **not transactional** (turnover update + audit-trail write are two separate unwrapped statements) and **not concurrency-safe** (no P2002 catch on the upsert-by-unique-key path, unlike Billing/Parking/Service-Contracts).
- Confidence: HIGH.

## SlotBooking
- States: PENDING/CONFIRMED/CANCELLED/COMPLETED, enforced ad hoc (no explicit transition map, unlike Parking/Service-Contracts).
- Confidence: MEDIUM.

## Unit (shared across Spaces/Booking/Contracts/Fitout)
- States: `VACANT ⇄ {BOOKING, NEGOTIATING}`; `BOOKING ⇄ {VACANT, NEGOTIATING, CONTRACTED}`; `NEGOTIATING ⇄ {VACANT, BOOKING, CONTRACTED}`; `CONTRACTED → {UNDER_FITOUT, OCCUPIED, VACANT}`; `UNDER_FITOUT → {OCCUPIED, VACANT}`; `OCCUPIED → {VACANT, UNDER_FITOUT}`; `MERGED` — **terminal but structurally unreachable via the shared transition matrix**, only reachable via the direct-write bypass in Spaces' merge/split.
- Enforcement: centralized in `UnitStatusService.transition()` (common/, ~20 confirmed call sites) with `isLockedForBooking`/`isCommittedToTenant` guards — for everything except merge/split.
- Confidence: HIGH.
- **Status update (CR-101 Phase 3E, `docs/changes/CR-101-PHASE-3E-UNITSTATUS-COMPLETION.md`)**: the call-site count was re-verified precisely via direct grep and is **12**, not ~20 (the earlier figure was a rough estimate, not a count). `transition()` now also enforces `INV-AUTH-006` (source-entity-to-target-Unit Mall consistency) via an optional `expectedMallId`, for the 1 of 12 call sites (`BookingService.update()`'s unit-reassignment branch) where the target `unitId` was client-influenced against an already-existing, differently-scoped entity. The other 11 call sites were confirmed structurally safe already (create-flows with no prior entity to compare against, or `unitId` sourced from an already-persisted trusted DB record).

## FitoutProject
- 9-stage config-driven pipeline (`CONTRACT_SIGNED → SUBMIT_DESIGN → DESIGN_REVIEW → FIRE_SAFETY_REVIEW → CONSTRUCTION_PERMIT → FITOUT_IN_PROGRESS → INSPECTION → APPROVED_TO_OPEN → OPENED`), forward-only, DB-seeded not hardcoded, gate-document-enforced with auditable override, Unit-status side effects at stages 6 (`UNDER_FITOUT`) and 9 (`OCCUPIED`).
- Confidence: HIGH — verified matching `docs/program/05-FITOUT-STATE-MACHINE.md` exactly.

## Ticket
- Staff transitions: NEW→{ASSIGNED,IN_PROGRESS}, ASSIGNED→{IN_PROGRESS}, IN_PROGRESS→{WAITING_TENANT,RESOLVED}, WAITING_TENANT→{IN_PROGRESS,RESOLVED}, RESOLVED→{CLOSED,IN_PROGRESS}, CLOSED→{IN_PROGRESS}.
- Tenant-only subset: RESOLVED→{CLOSED,IN_PROGRESS}, WAITING_TENANT→{CLOSED}, enforced separately.
- Confidence: HIGH.

## WorkOrder
- NEW→{ASSIGNED,IN_PROGRESS,CANCELLED}, ASSIGNED→{IN_PROGRESS,CANCELLED}, IN_PROGRESS→{WAITING_REVIEW,ON_HOLD,CANCELLED}, ON_HOLD→{IN_PROGRESS,CANCELLED}, WAITING_REVIEW→{IN_PROGRESS,COMPLETED}; COMPLETED/CANCELLED terminal. WAITING_REVIEW gated by checklist completion + required evidence photo.
- Enforcement: solid; minor gap — status update and audit-event write are two separate statements (low severity, status itself stays consistent).
- Confidence: HIGH.

## PatrolShift / PatrolCheck
- Shift: SCHEDULED/OVERDUE→IN_PROGRESS→COMPLETED, CANCELLED from any non-terminal state.
- Check result: PENDING→{NORMAL, ABNORMAL, SKIPPED}.
- Anti-fraud fields (`qrVerified`, `locationVerified`, `tooFast`) persisted per-check, not part of the state machine per se but gate `complete()`.
- Confidence: HIGH.

## Dead/unused enum values found (consolidated)
`ProposalStatus.UNDER_REVIEW`, `ApprovalStep.StepStatus.SKIPPED`, `UnitStatus.MERGED` (reachable only via bypass). Flagged for business confirmation — either aspirational/future-use or cleanup candidates. See `BUSINESS_CONFIRMATION_REQUIRED.md`.

## Cross-entity state coupling
See `SYSTEM_STATUS_MAP.md` for the consolidated cross-entity view (Contract↔Invoice, Contract↔Fitout, Booking↔Unit, Fitout↔Unit).
