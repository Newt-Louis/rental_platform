# 07 — Booking Failure Matrix

**Date:** 2026-08-19.

## `create()`

| Failure point | Pre-Phase-6 | Post-Phase-6 |
|---|---|---|
| Two concurrent creates for the same unit both read `MAX(priority)=0` | **Both could insert with `priority=1, status=ACTIVE`** — two active bookings for one unit, the exact "duplicate exclusive reservation" risk section 10 names. Verified reachable: no DB constraint prevented it. | Serializable isolation detects the conflict at commit; the loser retries automatically against fresh data and correctly becomes `priority=2, PENDING`. No error surfaces to the caller. |
| Booking row created, `Unit.status` transition fails | Persistent: a `UnitBooking` exists (possibly `ACTIVE`) while the `Unit` never shows `BOOKING` — the unit *looks* available while a booking silently holds it. | Rolled back entirely — no booking, no unit-status change. |
| Booking row created, `Lead.status` update fails | Persistent: booking exists, `Lead.status` never advances to `PROPOSAL` — the Lead looks stale/unprogressed in CRM despite an active booking existing. | Rolled back entirely. |

**Answers the brief's critical question** ("can a Booking fail halfway but
still block a Unit/Space?"): pre-Phase-6, yes, in the ways above. Post-
Phase-6, no — the whole write set is one atomic unit.

## `update()` (unit-change path)

| Failure point | Pre-Phase-6 | Post-Phase-6 |
|---|---|---|
| Booking record updated to the new unit, `promoteNextInQueue` (old unit) fails | **"Release Unit A, reserve Unit B" partial state** — old unit never gets its queue promoted/released, blocking it indefinitely for no active booking. | Rolled back together — booking stays on its original unit. |
| Booking updated, new-unit `Unit.status` transition fails | New unit shows no `BOOKING` status despite a booking now pointing at it. | Rolled back together. |
| Two updates changing the same booking to different units concurrently | Undefined — last-write-wins on the booking row, with each writer's queue-position math computed against data the other writer might also be changing. | Serializable transaction; queue position recomputed inside the transaction on every attempt. |

## `cancel()`

| Failure point | Pre-Phase-6 | Post-Phase-6 |
|---|---|---|
| Status set to CANCELLED, `promoteNextInQueue` fails | **The exact invariant violation section 16 names**: a CANCELLED booking's unit stays reserved (still `BOOKING` status) with no one promoted to take its place — inventory blocked for no active booking. | Rolled back together — booking stays in its pre-cancel status if promotion fails. |
| Retry after a successful cancel (network timeout, double-click) | `requireBooking`'s status guard threw `BadRequestException` for a booking already `CANCELLED` — the *caller* sees an error for an action that, from their point of view, already succeeded. | Idempotent replay — returns the same success message, no error, no duplicate side effect (checked twice: once before opening a transaction at all, once again inside it for a race). |

## `reinstate()` / `expireOverdueBookings()`

Same priority-computation race as `create()` (reinstate) and the same
"N unwrapped writes, no re-check" pattern as `cancel()` (expiry) — both
hardened this phase using the identical `runSerializable` mechanism.
`expireOverdueBookings()` additionally re-validates each booking's
eligibility *inside* its transaction before acting, so a booking that a
user confirmed/cancelled in the window between the job's batch fetch and
its per-item write is skipped rather than force-expired against stale
assumptions — and one booking's unexpected failure no longer aborts the
rest of that hour's expiry batch (same batch-resilience principle as the
Backbone Gate's `generateDueInvoices` fix).
