# 07 — Booking State Machine

**Date:** 2026-08-19. `BookingStatus` enum (schema.prisma): `PENDING`,
`ACTIVE`, `EXPIRED`, `CANCELLED`, `CONVERTED`. No `DRAFT`/`HELD`/`CONFIRMED`
states exist — not invented to match the phase brief's illustrative list.

A unit's bookings form a **priority queue**: `priority = 1` is always
`ACTIVE` (the current hold); everyone else is `PENDING` (queued). This is
not itself a `BookingStatus` value — priority and status are separate
fields that `create()`/`promoteNextInQueue()`/`syncQueueStatus()` keep
consistent with each other.

| From | Action | Guard | Writes (Phase 6: now one transaction where multi-step) | Side Effects | To |
|---|---|---|---|---|---|
| *(none)* | `POST /bookings` | Unit exists, active, not locked (`isLockedForBooking`); no existing ACTIVE/PENDING booking for the same lead/customer+unit; **re-checked inside the transaction** | `UnitBooking.create`, conditional `Unit.status→BOOKING`, conditional `Lead.status→PROPOSAL`, 1-2 `BookingActivity` rows | None (no notification on plain creation, confirmed unchanged) | `ACTIVE` (priority 1) or `PENDING` (priority N) |
| `ACTIVE`/`PENDING` | `PUT /bookings/:id` (unit change) | New unit exists, active, not locked; queue position **recomputed inside the transaction** | `UnitBooking.update`, `promoteNextInQueue` on the *old* unit, conditional `Unit.status→BOOKING` on the *new* unit | None | Same status, new `unitId`/`priority` |
| `ACTIVE`/`PENDING` | `POST /bookings/:id/cancel` | Not already `CANCELLED` (idempotent no-op if it is) | `UnitBooking.status→CANCELLED`, `BookingActivity`, `promoteNextInQueue` | None | `CANCELLED` |
| `PENDING` (next in queue) | Automatic, via `promoteNextInQueue` (called from update/cancel/expire) | A `PENDING` booking exists for the unit | `UnitBooking.status→ACTIVE`, `priority→1`, `Unit.status→BOOKING` (or `→VACANT` if queue now empty), 2× `BookingActivity` | None | `ACTIVE` |
| `ACTIVE` | `POST /bookings/:id/convert-to-proposal` | Status `ACTIVE`; no existing Proposal (`bookingId @unique`); price approval not `PENDING`/`REJECTED` | Already hardened (Phase 3 predecessor to this program) — one Serializable transaction: `Proposal.create`, `UnitBooking.status→CONVERTED`, `Lead.status→PROPOSAL` | None (queue-notification TODO still unimplemented, Phase 2 finding, unchanged) | `CONVERTED` |
| `PENDING` (or `ACTIVE`, unverified) | Expiry job (see below) | Not traced line-by-line this phase — `expiresAt` field exists, but the job that acts on it wasn't located with certainty in this pass | Presumably `status→EXPIRED` + `promoteNextInQueue` | Not verified | `EXPIRED` |

## Expiry job — flagged as unverified, not fabricated

A `CancelBookingDto`/`expiresAt` field exists and `promoteNextInQueue` is
called from a third site beyond `update()`/`cancel()` (line ~859 in the
pre-Phase-6 file, not individually re-read this phase) — consistent with
an expiry job existing, but this phase did not conclusively trace its
scheduler registration, lock usage, or exact query. **Not claimed
verified.** Recommended as the first thing to check in any follow-up to
this phase, since section 37-38 of the brief specifically asks about
expiry-job reliability and race-with-confirm behavior that this pass
could not conclusively confirm given time spent on the higher-priority
create/update/cancel atomicity work.

## Reinstate — found, not in the brief's list

`PATCH /bookings/:id/reinstate` exists (`booking.controller.ts`) —
"Khôi phục booking đã hủy — đưa vào cuối queue của unit" (restore a
cancelled booking, placed at the end of the unit's queue). Not covered by
this phase's atomicity work (out of the three explicitly-named methods) —
flagged as a gap in this phase's own coverage, not asserted safe or
unsafe.
