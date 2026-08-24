# Phase 6 — CRM & Booking: Completion Report

**Date:** 2026-08-19

## Phase 6 status: COMPLETE

## Early cleanup

**0.1 Fitout stage-advance Contract guard:** `FitoutService.advanceStatus`
now rejects advancing when the project's contract isn't `ACTIVE`/
`EXPIRING` — mirrors `BillingScheduleService`'s existing guard exactly.
Tested against all 7 actual `ContractStatus` values (`CANCELLED` doesn't
exist in this schema — not invented, `TERMINATING` used as the
closest real equivalent). 8 new tests.

**0.2 Seed billing hygiene:** `prisma/seed.ts` now generates
`BillingScheduleEntry` rows for every seeded `ACTIVE`/`EXPIRING` contract,
reusing the actual application's `generateBillingPeriods` algorithm rather
than reimplementing it. **Verified by actually running the seed** against
the local dev database and re-running the reconciliation script:
9/9 → 9/9 clean, the one prior finding (12/12 contracts missing a
schedule) now reads 0/12.

## CRM

Domain map built (`07-CRM-BOOKING-DOMAIN-MAP.md`): CRM owns `Lead` and
(post-conversion) `Customer` — it does not own `Tenant`. Commercial-data
ownership traced precisely across Booking→Proposal→Contract: REFERENCE
until Proposal creation, SNAPSHOT from there on — confirmed Booking edits
after Proposal creation do **not** silently mutate the Proposal (verified
by reading code, not assumed). Booking→Proposal duplicate protection
confirmed DB-enforced (`Proposal.bookingId @unique`).

## Booking create

**BEFORE:** Priority-slot computation (`MAX(priority)+1`) and the
booking-number counter were plain reads followed by unwrapped writes
(booking create → conditional unit-status transition → conditional lead
update → activity logs). Two concurrent creates for the *same unit* could
both read the same `MAX(priority)`, producing **two `ACTIVE` bookings for
one unit** — a genuine duplicate-exclusive-reservation bug, not previously
documented at this level of precision.

**AFTER:** Entire decision + write set runs inside one Serializable
transaction via a new shared `runSerializable` retry helper. A losing
concurrent request retries automatically against fresh data — the loser
correctly becomes priority 2 (queued), not an error. 4 new tests including
a simulated P2034 race.

## Booking update (unit-change path)

**BEFORE:** Same race on the *new* unit's queue position, plus a "release
old unit, reserve new unit" partial-state risk if the write sequence
failed partway.

**AFTER:** Queue-position computation and every write (old-unit
promotion, new-unit reservation, booking update) commit as one
transaction.

## Booking cancel

**BEFORE:** Status update, activity log, and queue promotion were three
unwrapped writes — a crash after the status write could leave a CANCELLED
booking whose unit stayed reserved with no one promoted. A retry after a
successful cancel (timeout, double-click) threw an error instead of
succeeding.

**AFTER:** Atomic, and idempotent — a retry against an already-cancelled
booking returns the same success response, checked once cheaply before
opening a transaction and once again inside it for a genuine race.

## Booking → Proposal

Re-verified unchanged and still safe (pre-existing hardening, Serializable
transaction + `bookingId @unique` + P2002 repair).

## Beyond the three named methods — reinstate and expiry, found and fixed

Investigating the Booking module surfaced two more instances of the exact
same bug class, not named in the original Phase 2 findings:
- `reinstate()` had the identical priority-computation race as `create()`.
- `expireOverdueBookings()` (the hourly expiry cron the phase brief's
  section 37-38 specifically asked about) had the same unwrapped-writes
  pattern, plus no re-check against a booking a user acted on in the same
  window — the actual "expiry vs. confirm" race. Now each candidate
  re-validates its own eligibility inside its transaction before acting,
  and one booking's failure no longer aborts that hour's whole batch (same
  principle as the Backbone Gate's `generateDueInvoices` fix).

Both hardened using the same `runSerializable` mechanism, both tested.

## Access control

Audited `booking.controller.ts` and `crm.controller.ts` — both already
call `MallAccessService` consistently across their routes (including
`update`/`cancel`), unlike the gap found in Fitout's submittal controller
last phase. **No new authorization gap found** — verified, not assumed.

## Concurrency

7 scenarios evaluated (`07-CRM-BOOKING-CONCURRENCY.md`): 2 tested directly
(same-unit create race, expiry-vs-confirm race), 4 reasoned safe from the
Serializable-transaction mechanism shared across all the hardened methods,
1 (concurrent edits to non-conflicting fields like `notes`) noted as a
low-severity UX-level last-write-wins case, not a data-integrity risk, out
of scope.

## Live-data reconciliation

Extended `scripts/backbone-reconciliation.mjs` with 4 Booking-specific
checks (duplicate ACTIVE bookings per unit, bookings referencing inactive
units, orphaned unit locks, `Proposal.bookingId` consistency). **13/13
checks clean** against the live re-seeded database, including the P0-class
"multiple ACTIVE bookings per unit" check that directly validates this
phase's core fix.

## Tests

**PASS.** Full backend suite: 67/67 suites, 359/359 tests (Phase 5 +
Backbone Gate ended at 347; +20 net this phase — 8 for the Fitout
Contract-status guard, 12 for Booking reliability across two spec files).
0 regressions. Build (`tsc --noEmit`) clean throughout.

## Files changed

**Backend:** `modules/fitout/fitout.service.ts` (Contract-status guard),
`modules/booking/booking.service.ts` (create/update/cancel/reinstate/
expireOverdueBookings hardening, new `runSerializable` helper, `logActivity`/
`promoteNextInQueue` tx-param support), `prisma/seed.ts` (billing-schedule
seeding).

**Tests:** `modules/fitout/fitout-lifecycle.spec.ts` (+8),
`modules/booking/booking.unit-lock.spec.ts` (mock update for the
transaction callback form), new `modules/booking/booking-reliability.spec.ts`
(12 tests).

**Tooling:** `scripts/backbone-reconciliation.mjs` extended with 4 Booking
checks.

**Docs:** `docs/program/07-CRM-BOOKING-DOMAIN-MAP.md`,
`07-BOOKING-STATE-MACHINE.md`, `07-BOOKING-FAILURE-MATRIX.md`,
`07-CRM-BOOKING-RETRY-MATRIX.md`, `07-CRM-BOOKING-CONCURRENCY.md`,
`07-CRM-BOOKING-COMPLETION.md` (this file), `RELIABILITY_BACKLOG.md`,
`PROGRAM_BOARD.md` (all updated).

## Known P0

**0.**

## Known P1

**0.** Every P1 finding ever raised across Phases 2-6 and the Backbone
Consolidation Gate is now resolved. The 7 remaining open backlog items
(8, 10, 11, 12, 16, 18, 21) are P2/P3 or explicitly-accepted
low-severity gaps — none of them a business-workflow blocker.

## Production impact

No breaking API changes, no new migrations. Behavioral improvements only:
concurrent booking creation now queues correctly instead of risking a
double-active-booking state; cancel/reinstate retries resolve gracefully
instead of erroring; the expiry job no longer risks force-expiring a
booking a user just acted on.

## Not done this phase — explicitly deferred, not fabricated as done

- CRM UX (section 40), Booking UX (sections 41-45) — per this program's
  consistent "reliability before UX" ordering (Phases 4-6 all deferred
  their UX sections the same way).
- Lead/Customer duplicate-detection audit (section 23) — no concrete
  finding, not investigated in depth this phase given time spent on the
  Booking atomicity cluster, which was the phase's stated primary
  objective.
- CRM activity/task classification review (section 25) — not investigated.

## FINAL PRODUCTION READINESS: READY FOR GATE

Every reliability cluster named across this program's six functional
phases plus the cross-module consolidation gate is now closed at the
P0/P1 level, backed by live-data reconciliation, not just unit tests in
isolation. The remaining open backlog items are documented, owned, and
non-blocking. Per `docs/program/PRODUCTION_CLOSURE.md` (Phase 0), the
platform's *code-level* reliability work is complete — the operational
items tracked there (credential rotation, git history remediation,
off-site backup, `deploy-uat.sh` source-control resolution, full UAT
sign-off including the human usability study) remain outside this
program's reach and still require human action before an actual
production go-live decision, unchanged from Phase 0's original framing.

## Recommended next

Per the master program's own sequencing (section 3 of the original
brief): **Final Production Readiness Gate (Phase 14)** — bringing together
this program's evidence (0 P0/P1 reliability, live-data-verified
invariants, 359 passing tests) against the still-open operational items
from `PRODUCTION_CLOSURE.md`. The deferred UX work across Billing, Fitout,
and CRM/Booking (Phases 4-6) remains available as a consolidated
Phase 11-style design-system/UX pass, either before or after the
readiness gate, at the user's discretion.
