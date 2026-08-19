# 07 — CRM & Booking Concurrency Matrix

**Date:** 2026-08-19.

| # | Scenario | Result | Evidence class |
|---|---|---|---|
| 1 | Two booking creates for the same unit | One becomes `ACTIVE` (priority 1), the other `PENDING` (priority 2) — never two `ACTIVE` | **VERIFIED TESTED** (`booking-reliability.spec.ts`) + **VERIFIED live-data** (reconciliation script: 0 units with >1 ACTIVE booking) |
| 2 | Booking update (unit change) vs. booking create — both targeting the same new unit | Serializable isolation orders them; whichever commits first gets priority 1, the other correctly recomputes to priority 2 inside its own transaction | **REASONED SAFE** (same mechanism as #1, not independently test-simulated as a cross-method race) |
| 3 | Two updates to the same booking simultaneously | Second write's transaction re-reads current booking state fresh (via `tx.unitBooking.update` inside the Serializable transaction) — no stale-data overwrite of unit/priority/status fields; non-conflicting field edits (e.g. `notes`) don't race meaningfully | **REASONED SAFE** — no optimistic-concurrency/version field exists for arbitrary field edits (e.g. two staff editing `notes` at once still last-write-wins on those specific fields), which is a low-severity UX-level concern (lost edit to a notes field), not a data-integrity one, and out of this phase's atomicity scope |
| 4 | Cancel vs. proposal creation (cancel a booking while it's being converted to a Proposal) | `convertToProposal()` requires `status === ACTIVE` and no existing Proposal, checked inside its own pre-existing Serializable transaction; `cancel()` requires `status IN (ACTIVE, PENDING)`. Whichever transaction commits first wins; the other's precondition check fails against the now-updated status, producing a clear `BadRequestException` rather than both succeeding into a contradictory state (a CANCELLED booking with a CONVERTED status, or a CONVERTED booking that's also CANCELLED) | **REASONED SAFE** (both paths use Serializable transactions with status preconditions re-checked at commit time; not independently test-simulated as a cross-method race this phase) |
| 5 | Booking→Proposal duplicate request (double-click "Convert to Proposal") | Pre-existing hardening (before this program): `Proposal.bookingId @unique` + Serializable transaction — a second request resolves via the same P2002-repair pattern used throughout this program | **VERIFIED** (pre-existing test coverage, re-confirmed unchanged by reading current code) |
| 6 | Expiry job vs. confirm/cancel (a booking is expired by the hourly job at the same moment a user acts on it) | Each expiry candidate is re-validated inside its own transaction immediately before being force-expired; if the user's cancel/update commits first, the expiry job's re-check sees the booking is no longer an eligible candidate and skips it | **VERIFIED TESTED** (`booking-reliability.spec.ts` — "skips a booking that was already changed by someone else") |

## Live-data verification

`scripts/backbone-reconciliation.mjs` (extended this phase) checked, against
the actual dev database, after re-seeding: 0 units with multiple `ACTIVE`
bookings, 0 `ACTIVE`/`PENDING` bookings referencing an inactive unit, 0
units locked as `BOOKING`/`NEGOTIATING` with no corresponding booking, 0
`Proposal.bookingId` references to a missing or non-`CONVERTED` booking.
13/13 checks clean.
