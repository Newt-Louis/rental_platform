# TRANSACTION ATOMICITY — Phase 3

Classification: **STRONG_ATOMIC** = Serializable + in-transaction re-read +
idempotent replay + conflict retry · **ATOMIC** = single transaction, no
concurrency hardening · **PARTIAL** = some writes outside the transaction ·
**NON_ATOMIC** = no transaction spanning the writes.

## Matrix C — TRANSACTION MATRIX

| Flow | Isolation | Atomic | Idempotent | Retry | Risk |
|---|---|---|---|---|---|
| Booking create | Serializable | **STRONG_ATOMIC** | via unit lock + queue recompute | `runSerializable` P2034 | none found |
| Booking cancel / expire | Serializable | **STRONG_ATOMIC** | promoteNextInQueue is convergent | yes | none found |
| Booking unit reassign | Serializable | **STRONG_ATOMIC** | yes | yes | none found |
| **Booking queue reorder** (`updatePriority`) | Read Committed for the shuffle; **none** for the status sync | **PARTIAL** | convergent but not transactional | no | **BOOK-001** — priority writes commit, then `syncQueueStatus` issues N separate un-wrapped updates |
| Proposal create / submit | default | ATOMIC | — | — | not a financial write |
| Proposal approve | Serializable | STRONG_ATOMIC | yes | yes | none found |
| **Proposal → Contract** | Serializable | **STRONG_ATOMIC** | pre-check + in-txn re-check + P2002 resolves to winner | yes | none found |
| Contract direct create | Serializable | **STRONG_ATOMIC** | live-contract guard re-checked inside txn | via `serializable` | governance gap only (INT-003), not atomicity |
| **Contract activate** | Serializable | **STRONG_ATOMIC** | outbox `eventKey: contract:{id}:activated`; safe to re-run | P2034 → resolve to winner | none — schedule build is inside the txn |
| Contract terminate: initiate | default txn | ATOMIC | no | no | low |
| Contract terminate: complete | default txn | ATOMIC | `status === COMPLETED` guard | no | low |
| Contract terminate: cancel | default txn | ATOMIC | restores captured `preTerminationUnitStatus` | no | low |
| Fitout create | Serializable | **STRONG_ATOMIC** | `contractId @unique` + pre/in-txn existence check | yes | none found |
| Fitout stage advance | Serializable | **STRONG_ATOMIC** | same-status returns as-is; stale-status detected and rejected | P2034 | none found |
| Billing schedule generation | inherits caller's txn | **ATOMIC** | upsert on `@@unique([contractId, period])`; invoiced entries never overwritten or deleted | — | none found |
| Invoice creation (schedule / periodic / slot / parking) | Serializable | STRONG_ATOMIC | deterministic invoiceNumber per source (`INV-SCHEDULE-{id}` etc.) + unique constraint | yes | none found |
| Invoice creation (manual) | none (single write) | ATOMIC | `invoiceNumber @unique` only | no | random 5-digit number → collision surfaces as an error, not a duplicate |
| **Revenue-share invoice generation** | Serializable | **STRONG_ATOMIC** *(fixed 2026-09-06)* | existence check re-evaluated inside every retry; P2002 → ALREADY_BILLED | P2034 ×3 | BILL-002 closed — DB partial unique index backs the app check |
| **Payment creation** | Serializable | **STRONG_ATOMIC** *(fixed 2026-09-06)* | **yes** — per-intent idempotency key from both UIs + in-transaction balance invariant | P2034 ×3, then a deterministic 409 | BILL-001 and PAY-001 closed — see below |
| Payment reversal | Serializable | STRONG_ATOMIC | `reversedAt` guard | yes | none found |
| SAP posting | none needed | ATOMIC | `SapIntegrationLog.idempotencyKey` upsert | no | manual-trigger only; see SAP-001 for the currency gap |

## The two atomicity defects in detail

### BOOK-001 — queue reorder is not atomic with its status sync

`BookingService.updatePriority` (booking.service.ts:804-845):

```ts
await this.prisma.$transaction(async (tx) => {   // default isolation
  await tx.unitBooking.updateMany(...);          // shift the others
  await tx.unitBooking.update({ where: { id }, data: { priority: newPriority } });
});
// transaction has COMMITTED here
await this.syncQueueStatus(booking.unitId, userId);   // no transaction at all
```

`syncQueueStatus` (:1291-1308) then loops the queue and issues one
`this.prisma.unitBooking.update(...)` per row that needs ACTIVE/PENDING corrected.

Two consequences, only the first of which needs concurrency:

1. **Plain failure.** If the process dies or `syncQueueStatus` throws after the
   priority transaction commits, the queue order and the ACTIVE/PENDING statuses
   disagree — the booking now ranked #1 is still PENDING while the demoted one is
   still ACTIVE. Nothing repairs this; no later call re-runs the sync unless a
   user reorders again.
2. **Concurrency.** Two simultaneous reorders on the same unit are not serialized
   (default isolation, and the sync is outside any transaction), so both can
   compute "index 0 → ACTIVE" against different snapshots and leave two ACTIVE
   bookings on one Unit — the exact invariant Phase 2 recorded as APP_ENFORCED.

Every *other* booking path is Serializable. This one method is the exception.

### BILL-001 — FIXED 2026-09-06

The decision now lives entirely inside the retryable transaction:

```ts
return await this.runSerializableTransaction(async (tx) => {
  const current = await tx.invoice.findUnique({          // ← via tx, not this.prisma
    where: { id: invoiceId },
    include: { payments: { where: { reversedAt: null } } },
  });
  // status / cancelled / currency / balance — ALL re-evaluated here,
  // therefore re-evaluated on every P2034 retry.
  const { balance } = this.financials(current);
  if (dto.amount > balance) throw new BadRequestException({
    code: 'PAYMENT_EXCEEDS_REMAINING_BALANCE', invoiceId,
    attemptedAmount: dto.amount, remainingBalance: balance,
  });
  payment = await tx.payment.create({ ... });
  await this.recomputeInvoiceStatusFromPayments(invoiceId, tx);
});
```

Only one read remains outside: `findOneInvoice` for the TENANT authorization
check. Nothing the payment decision depends on is read through `this.prisma`.

Exhausting the retry budget no longer leaks `P2034` — it surfaces as a
`PAYMENT_CONCURRENT_MODIFICATION` conflict carrying `invoiceId` and
`attemptedAmount`, and increments `payment_serialization_exhausted_total`.

Proven by `billing.payment-concurrency.spec.ts` (18 tests). Removing the
in-transaction balance guard makes 4 of them fail with two 60-payments committed
against a 100 invoice — i.e. the suite genuinely detects the original defect.

### PAY-001 — client-side idempotency, FIXED 2026-09-06

The server-side invariant is only half of payment safety; the client must send a
stable key per intent for the `idempotencyKey` unique constraint to mean
anything.

Both payment dialogs are rendered unconditionally by their parent and never
unmount, so `useState(() => crypto.randomUUID())` produced **one key per page
load**, not per intent. Tenant Portal sent no key at all. Replaced with
`usePaymentIntentKey(invoiceId, isOpen)`, which regenerates on dialog open and
on invoice change, and is stable across re-renders and retries.

This closes the *duplicate payment* case that survived BILL-001: two partial
payments that each fit the remaining balance.

### BILL-001 — the original defect (retained for context)

`BillingService.recordPayment` (billing.service.ts:1159-1240):

```ts
const { balance } = this.financials(invoice);        // read BEFORE the txn
if (dto.amount > balance) throw ...                  // checked BEFORE the txn
...
return this.runSerializableTransaction(async (tx) => {
  payment = await tx.payment.create({ ... });        // only this is retried
  await this.recomputeInvoiceStatusFromPayments(invoiceId, tx);
});
```

`runSerializableTransaction` (:703-721) retries **only the callback**. The balance
check is not part of it. Two concurrent payments, each individually within the
balance, both pass the pre-check; the second aborts on the write-write conflict
against the invoice row, is retried, and then commits — without the balance ever
being re-evaluated. Result: `sum(payments) > invoice total`, invoice marked PAID,
excess silently absorbed (`recomputeInvoiceStatusFromPayments` uses `>=`).

The `idempotencyKey` protects only *identical repeated* payloads, so it does not
cover two genuinely different concurrent payments. `BillingPage.tsx:116` does send
a key (double-click from that screen is safe); `TenantPortalPage.tsx:439` calls
`recordPayment(invoice.id, data)` with **no key at all**.

Recommended fix (recorded, not applied): move the balance computation and the
`dto.amount > balance` check inside the transaction callback so the retry
re-evaluates it.

## Positive atomicity findings

Worth stating plainly, because they are the reason no P0 was found in this phase:

- **Contract activation is exemplary.** Status change, event, outbox enqueue and
  the entire billing schedule build are one Serializable transaction with an
  in-transaction re-read, a stable outbox `eventKey`, P2034 resolution to the
  winner, and success/failure metrics plus structured logs. "Contract ACTIVE but
  no billing schedule" is not reachable through this path — the invalid state
  §11 asks about is genuinely prevented.
- **The Proposal→Contract conversion** closes its own TOCTOU window explicitly and
  resolves the unique-constraint race to an idempotent outcome instead of an error.
- **Billing schedule regeneration cannot resurrect billed periods**: entries with
  an `invoiceId` or status `INVOICED` are skipped on upsert and excluded from the
  orphan `deleteMany`, and regeneration is refused entirely unless the contract is
  ACTIVE or EXPIRING.
- **Fitout stage advance** detects that the project moved since validation and
  refuses with a "refresh and retry" message rather than overwriting.
