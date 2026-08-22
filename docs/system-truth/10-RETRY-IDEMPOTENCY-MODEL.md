# System Truth — 10 — Retry / Idempotency Model

## Retry Queue capability
**EXISTS**, but not as a single generic abstraction — two independent implementations of the same pattern (exponential backoff, persisted `FAILED` status, capped retry window):
- `OutboxService` (common/) — generic event delivery, 300s backoff cap.
- `EmailDeliveryService` (notifications/) — email-specific, 1800s backoff cap.
- SAP integration (`sap.service.ts`) implements a **third**, independent retry mechanism with a circuit breaker (bounded exponential backoff per attempt, `SAP_MAX_ATTEMPTS` default 3, circuit opens after `SAP_CIRCUIT_FAILURE_THRESHOLD` consecutive failures, default 5) — the most sophisticated retry logic in the platform, but entirely separate from the other two.

## Job Ledger capability
**EXISTS** — `SchedulerLockService.runAndRecord()` → `JobExecution` table, used by ~20 of ~22 scheduled jobs (all except the dead analytics contract-expiry job). This is genuinely centralized and is the platform's best cross-cutting idempotency/observability primitive — see `09-EVENT-CATALOG.md`.

## Distributed Lock capability
**EXISTS** — `SchedulerLockService` (Redis-backed `runExclusive`), with a documented single-instance fallback when Redis is unavailable. Used to prevent concurrent/overlapping runs of the same scheduled job across instances (e.g. double-billing generation). **Not used for the Slots double-booking risk** — that's a per-request race, not a scheduled-job overlap, and no distributed lock or DB constraint covers it (see `06-BUSINESS-INVARIANTS.md` INV-005).

## Idempotency key patterns found

1. **P2002 (unique-constraint) catch-and-recover-existing-record** — the dominant pattern. Used by: Booking create, Proposal submit/convert/createContractFromProposal, Contract activation (P2034 variant), Fitout createFromContract/advanceStatus, ServiceContracts transferPaymentToBilling, Parking generateStatement, Billing issueInvoice/createInvoiceFromPending (PARKING/SHORT_TERM_BOOKING branches).
2. **Explicit idempotency-key + payload-hash dedupe** — Billing `recordPayment()` (`idempotencyKey`/hash fields), SAP integration (`entityType:entityId:endpoint` as both an HTTP header and a DB-unique key).
3. **Deterministic natural-key invoice numbering** — `INV-SCHEDULE-${id}`, `PARKING-${id}`, `ST-BOOKING-${id}`, and `SC-PAYMENT-${payment.id}` (Billing's own SERVICE_CONTRACT branch) — all collision-safe on retry. **Exception**: ServiceContracts' *own* `transferPaymentToBilling()` uses `SC-${year}-${Date.now()...}` — wall-clock-based, **not fully deterministic**, a genuinely different (and weaker) numbering scheme for the same conceptual operation as the Billing-owned equivalent.
4. **None found** — Slots `createBooking()` (no idempotency key, no unique constraint — a client-side double-submit compounds the concurrency race already noted); Sales `create()` (upsert-by-unique-key is idempotent for sequential resubmission but not safe under true concurrency — no P2002 catch, unlike its siblings).

## Platform-wide risk summary (consolidated from `09-EVENT-CATALOG.md`)

| Risk class | Instances |
|---|---|
| No idempotency key at all | Slots booking creation, Sales turnover submission (partial — upsert exists but unsafe under concurrency) |
| Weaker/inconsistent idempotency scheme for a duplicated cross-module operation | ServiceContracts' own "transfer to billing" (wall-clock invoice numbering) vs. Billing's equivalent (deterministic) |
| No scheduled retry at all (manual-trigger-only) | SAP sync retry, SAP reconciliation, penalty-interest calculation |
| Non-durable event delivery | `approval.workflow.rejected` (plain EventEmitter, not outbox) |
| No per-item failure isolation within a locked batch job | Parking statement generation, Analytics occupancy-snapshot, Analytics renewal-risk-calc |

## Assessment

The platform has strong idempotency *primitives* (P2002-recovery pattern, the Job Ledger, SchedulerLock) applied consistently to the highest-value financial operations (Billing, Booking, Proposal, Contract activation). The gaps cluster in: (a) the two adjacent-revenue modules with the weakest data-modeling investment overall (Slots, Sales — also the ones with no currency field), and (b) operations that were never wired into the scheduled-job framework at all (SAP retry, penalty-interest) despite apparently being designed to run unattended (per `docs/OPERATIONS_RUNBOOK.md`'s assumption).
