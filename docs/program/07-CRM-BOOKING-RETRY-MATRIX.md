# 07 — CRM & Booking Retry Matrix

**Date:** 2026-08-19. "Unknown outcome" scenario (commit → network drop →
client retry) for every listed flow.

| Flow | Same-request retry outcome | Verified by |
|---|---|---|
| Lead create | Not hardened this phase — `CrmService` lead creation was not in this phase's named scope (Booking create/update/cancel were), and no reliability question was raised against it in Phase 2's findings. **Not claimed safe or unsafe** — flagged for a future pass if a concrete risk is ever found. | Not tested |
| Booking create | **Safe.** Serializable transaction + P2034 retry; concurrent creates for the same unit resolve to distinct queue positions, never two ACTIVE bookings. | `booking-reliability.spec.ts` |
| Booking update (unit change) | **Safe.** Same mechanism; queue position always recomputed fresh inside the transaction. | `booking-reliability.spec.ts` |
| Booking cancel | **Safe, idempotent.** A retry against an already-CANCELLED booking returns the same success response instead of erroring. | `booking-reliability.spec.ts` |
| Booking reinstate | **Safe.** Same Serializable + retry mechanism as create. | `booking-reliability.spec.ts` |
| Booking expiry (scheduled) | **Safe.** Distributed lock prevents concurrent job runs; each booking's expiry re-validates eligibility inside its own transaction, and one booking's failure doesn't abort the batch. | `booking-reliability.spec.ts` |
| Proposal creation (from Booking) | **Safe** — pre-existing, hardened before this program began (Serializable transaction, `Proposal.bookingId @unique`). Re-confirmed unchanged. | Existing coverage, re-verified this phase by reading current code |

## Booking number generation — verified safe, not a `MAX(number)+1` risk in practice

`create()` computes `bookingNumber` via `count({ where: { bookingNumber: {
startsWith: 'BK-${year}-' } } })` inside the now-Serializable transaction
— under Serializable isolation, two concurrent creates racing on this
count are subject to the same conflict detection as the priority
computation, so a duplicate `bookingNumber` cannot commit (Postgres would
abort one side with `P2034`, retried by `runSerializable`). Not enforced
by a `@unique` constraint check at the number-generation level directly,
but `UnitBooking.bookingNumber String @unique` **is** a DB constraint —
if two transactions somehow both computed the same count value and both
committed (shouldn't happen under Serializable, but as defense in depth),
the second `create()` would hit a `P2002` unique-violation instead, which
today is **not specially caught** by `create()`'s error handling — it
would propagate as a raw Prisma error rather than being gracefully
resolved. Recorded as a minor, low-probability gap (reliability backlog
item 21) rather than fixed — Serializable isolation already makes the
scenario very unlikely to be reached in practice, and adding P2002
handling here would be defending against an error class the isolation
level should already prevent.
