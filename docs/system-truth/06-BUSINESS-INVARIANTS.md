# System Truth — 06 — Business Invariants

## INV-001 — An Invoice's currency must equal its originating Contract's/source's currency
- Enforcement: Correctly enforced for LEASE_CONTRACT and SHORT_TERM_BOOKING (documented VND-default) and PARKING (documented VND-default) sources. **Violated (silently) for the ServiceContracts `transferPaymentToBilling` path** (missing `currencyCode`, defaults to schema's VND regardless of actual payment currency) and **for penalty-interest invoices** (`penalty-interest.service.ts`, same gap).
- Severity: P1 (financial data-correctness bug, not yet confirmed as customer-visible-impact scale — depends on how often non-VND service contracts/penalties occur).
- Evidence: `service-contracts.service.ts:366-372` vs. correctly-set equivalent at `billing.service.ts:403`; `penalty-interest.service.ts:68-99`.

## INV-002 — Amounts of different currencies are never summed without explicit FX conversion
- Enforcement: Correctly enforced in `getPendingReceivables`, `getArAging`, `collection-kpi.service.ts`, `dashboard.service.ts` (all explicit VND-filter or currency-bucketed).
- **Violated** in `billing.service.ts:findAllInvoices()` summary block (708-730) — sums `balance`/`totalAmount` across all currencies unfiltered.
- **Violated (formula-level)** in `calculateRevenueShare` — subtracts VND-implicit `sale.grossSales` from potentially-non-VND `contract.rent`.
- Severity: P0 for the revenue-share case if non-VND revenue-share contracts exist in production (unconfirmed); P1 for the invoice-summary case.

## INV-003 — A Unit's status transition is always validated against the shared transition matrix
- Enforcement: Correct for ~20 confirmed call sites via `UnitStatusService.transition()`.
- **Violated** by `SpacesService.mergeUnits`/`splitUnit`, which write `Unit.status` directly because `MERGED` isn't representable in the matrix.
- Severity: P2 today (guarded manually with its own local checks); P1 risk for future maintainers who add a new rule to `UnitStatusService` expecting it to apply universally.

## INV-004 — A Contract cannot have overlapping ACTIVE status for the same Unit
- Enforcement: Not independently re-verified this pass at the DB-constraint level; `UnitStatusService`'s `isLockedForBooking`/`isCommittedToTenant` guards suggest this is enforced procedurally through the booking/contract creation flow rather than a DB constraint. **NOT YET VERIFIED** at the constraint level.

## INV-005 — A Slot cannot be double-booked for an overlapping time window
- Enforcement: **VIOLATED — confirmed concurrency bug.** `SlotsService.createBooking()`'s conflict-check-then-create is not wrapped in a transaction, and there is no DB unique constraint on `(slotId, timeRange)`. Two simultaneous requests can both pass the conflict check and both succeed.
- Severity: P1 (double-booking is a direct operational/customer-facing failure, though relatively low-frequency given it requires true concurrent requests).

## INV-006 — Every Tenant Portal-visible resource belongs to the requesting Tenant
- Enforcement: Correctly enforced on all core CRUD paths for Tickets, Billing/Invoices, Sales (server-side `currentUser.tenantId` force, never trusts client-supplied tenantId).
- **Violated** on Tickets' `escalations`/`rate`/`rating` endpoints (no ownership check at all — `currentUser` not even passed to the service method).
- Severity: P1 (cross-tenant data read, though limited to escalation history/ratings, not financial/PII-heavy data — actual sensitivity unconfirmed).

## INV-007 — A cross-Mall user action is denied unless the user's role explicitly grants cross-Mall scope
- Enforcement: **Violated in multiple confirmed places** — see `15-MULTI-MALL-MULTI-COMPANY.md` and `ARCHITECTURE_CONTRADICTIONS.md` for the full list (Spaces units, Analytics/Reports, Sales, Parking-Dashboard, Fitout-controls/Gantt-mutate/daily-report-photos, AI chat context, CRM Customers/getUnifiedDeals).
- Severity: P0/P1 — this is the platform's single largest confirmed invariant-violation cluster.

## INV-008 — A rejected Proposal correctly reverts Lead status and releases the Unit if no other booking holds it
- Enforcement: **Confirmed correct** — positive finding, clean compensating-transaction logic.

## INV-009 — Money amounts are never negative except where explicitly modeling a credit/refund
- Enforcement: Not exhaustively re-verified this pass; `Invoice.balance` calculations consistently use `max(0, ...)` clamps across all 6 independent implementations found (see `12-FINANCIAL-SEMANTICS.md`) — suggests this invariant is respected by convention, though the convention itself is duplicated rather than centrally enforced.

## INV-010 — Contract termination leaves no orphaned state (Contract, ContractTermination, Unit all consistent)
- Enforcement: **Violated.** `ContractTerminationService.complete()` commits Contract→TERMINATED and Termination→COMPLETED atomically, but the subsequent Unit-status release to VACANT is outside that transaction — a failure there leaves a TERMINATED contract with a stale Unit status. `initiate()` similarly writes the termination record and `Contract.status=TERMINATING` as two separate unwrapped statements.
- Severity: P1 — this is the one gap in an otherwise consistently well-hardened module (Contracts is the best-transacted module elsewhere).

## Invariant violation register (summary)

| INV-xxx | Enforced? | Severity |
|---|---|---|
| INV-001 | Partially | P1 |
| INV-002 | Partially | P0 (revenue-share case, if applicable) / P1 (invoice summary) |
| INV-003 | Partially | P2 |
| INV-004 | NOT YET VERIFIED | — |
| INV-005 | No | P1 |
| INV-006 | Partially | P1 |
| INV-007 | Partially (multiple violations) | P0/P1 |
| INV-008 | Yes | — (positive) |
| INV-009 | Yes, by convention | — |
| INV-010 | Partially | P1 |
