# Backbone Consolidation Gate — Result

**Date:** 2026-08-19

## Cross-module P0: 0

No P0 finding — no data corruption, tenant-isolation break, or financial-
correctness defect found at any module boundary. All three
duplicate-prevention invariants this program's atomicity work depends on
(one Contract per Proposal, one FitoutProject per Contract, one
ApprovalWorkflow per Proposal) were verified with **zero violations
against live data** (`06-BACKBONE-RECONCILIATION.md`), not just by code
review.

## Cross-module P1: 0 (2 found, both fixed same-day)

- **Finding B / backlog item 15** — `FitoutService.handleContractActivated`
  swallowed a genuine `createFromContract` failure with no retry.
  **Fixed**: now rethrows, so the outbox's existing retry/backoff picks it
  up — safe because creation is idempotent (Phase 5).
- **Finding D / backlog item 17** — `generateDueInvoices`'s per-contract
  loop had no try/catch around `buildScheduleForContract`; Phase 4's new
  status guard turned a rare trigger into a realistic one (a contract
  terminating mid-batch-run), which would have silently aborted invoice
  generation for every other contract later in the loop. **Fixed**: now
  catches, logs, and skips the failing contract, continues the batch.

One additional finding (Finding C / backlog item 16 — Fitout stage advance
never checks `Contract.status`) was reclassified **P2** during this gate's
own severity review, not P1: nothing fails silently and no manual repair
is required unless the edge case actually occurs (verified 0 live
occurrences). Left open, recommended as the top candidate for an
immediate follow-up given how directly it parallels the Billing-side gap
Phase 4 already fixed — but does not block this gate.

## Proposal → Contract

Re-confirmed atomic, idempotent, and duplicate-free — both by re-reading
the Phase 3 code (unchanged) and by live-data reconciliation (0 duplicate
Contracts-per-Proposal, 0 duplicate ApprovalWorkflows-per-Proposal in the
current database).

## Contract → Billing

Structurally coupled (same transaction, Phase 3) for the activation path.
One new cross-module concurrency gap found and fixed this gate (Finding
D/item 17, above). One live-data finding, root-caused and classified P3,
not a defect: 12 of 12 seeded `ACTIVE`/`EXPIRING` contracts have no
billing schedule because `prisma/seed.ts` inserts them directly,
bypassing the activation transaction entirely — the invariant holds for
every contract that actually goes through the app, just not for
directly-seeded rows (`06-BACKBONE-RECONCILIATION.md`).

## Contract → Fitout

Deliberately **asymmetric** by design, confirmed and documented (not
previously stated this plainly anywhere in the program): Billing is
transactionally coupled to activation; Fitout is async/best-effort via the
outbox. This gate closed the one real gap that asymmetry created (Finding
B/item 15 — the swallowed failure). Also found: Fitout stage advance has
no awareness of Contract termination at all (Finding C/item 16, P2, open).

## Billing

Invoice generation, issue, and payment recording all re-confirmed safe,
unchanged. The one batch-resilience gap found this gate (item 17) is
fixed.

## Fitout / Handover

Stage-advance atomicity/concurrency (Phase 5) re-confirmed via live-data
check: 0 occurrences of a `FitoutProject` at `OPENED` with its `Unit` not
`OCCUPIED` — the handover invariant holds. Contract-termination awareness
gap (item 16) is the one open item from this branch.

## Retry safety

Every flow in `06-BACKBONE-RETRY-MATRIX.md`'s required list — Proposal
submit, approval completion, contract creation, contract activation,
billing schedule, invoice generation, invoice issue, payment recording,
Fitout create, Fitout stage advance — resolves to a safe, single logical
outcome under the "commit, then network drops, then client retries"
scenario. All backed by existing or new automated tests, not just
reasoning.

## Concurrency

7 cross-module scenarios evaluated (`06-BACKBONE-CONCURRENCY.md`): 1
verified tested (contract activation vs. retry, pre-existing Phase 3
coverage), 1 fixed this gate (item 17), 1 confirmed via live data (item
16's absence), 3 reasoned-and-accepted as low-severity eventual-consistency
windows (matching this program's consistent handling of the equivalent
per-module cases in Phases 4-5), 1 reasoned safe from code
(approval-completion-vs-duplicate).

## Tenant isolation

Re-verified via the module role-list comparison
(`06-BACKBONE-CONSOLIDATION.md` "Cross-module authorization") — no new
gap found beyond the one Phase 4 already fixed (invoice documents). Not
re-tested with new cross-tenant API calls this gate (existing per-module
tests from Phases 3-5 already cover Contract/Invoice/Fitout-document
tenant scoping individually) — reasoned as sufficient rather than
duplicating coverage.

## File security backbone

Re-confirmed unchanged: Contract, Billing, and Fitout documents all route
through the authenticated `FilesController`, none reachable by storage
path alone (Phase 0's original P1 fix, never re-broken by anything in this
program).

## Orphan / duplicate scan

**Live-data evidence, not just reasoning** — `scripts/backbone-
reconciliation.mjs`, a new reusable read-only script, ran 9 invariant
checks against the actual running dev database: 8 clean, 1 found (the
seed-data billing-schedule gap above, P3). Full detail and honest caveats
about what this snapshot does and doesn't prove in
`06-BACKBONE-RECONCILIATION.md`.

## Observability

`OperationalMetricsService`'s counters (Phase 3-5) and the `JobExecution`
ledger (pre-existing) cover the scheduled jobs touched by this program.
No new observability gap found beyond what's already tracked (item 15's
fix improves this indirectly — a failed Fitout auto-create is now a
visible `OutboxEvent` row with `status=FAILED`, where before it left no
trace at all beyond a log line).

## Tests

**PASS.** Full backend suite: 66/66 suites, 339/339 tests (Phase 5 ended
at 337; +2 net from this gate's two new tests). 0 regressions. Build
(`tsc --noEmit`) clean throughout.

## Reliability backlog

**14 tracked → 19 tracked** (5 new rows this gate: 15, 16, 17, 18, plus
10b was already present from Phase 4). **9 resolved → 10 resolved** net
this gate is actually **+2 resolved this gate (15, 17)** against a backlog
that also grew by 4 new findings (15, 16, 17, 18) — net open count went
from 5 to 9, but that's new findings surfacing, not existing ones going
unaddressed. See `RELIABILITY_BACKLOG.md` for the full, current table.

## Phase 6 readiness: **GO**

Cross-module P0 = 0. Cross-module P1 critical workflow blockers = 0 (both
found-this-gate P1s fixed same-day). Remaining open items (P2/P3, plus the
not-yet-started Booking phase's own pre-existing findings) do not block
Phase 6 and are all tracked with an owner.

## Blocking issues

None.

## Recommended next

**Phase 6 (CRM & Booking)** may proceed. Two small, well-scoped items are
worth picking up early in Phase 6 or immediately before it, given how
cheap and low-risk they'd be to close now that the pattern is proven three
times over (Proposal, Contract, Fitout all already use it):
- Item 16 — add a `Contract.status` guard to `FitoutService.advanceStatus`
  (mirrors Phase 4's `buildScheduleForContract` guard almost exactly).
- Item 18 — either update `prisma/seed.ts` to also seed billing schedules
  for its `ACTIVE`/`EXPIRING` contracts, or leave an explicit comment
  documenting the gap so it isn't mistaken for a template of healthy
  production state.

Neither is required before Phase 6 starts — both are P2/P3, tracked, and
owned.
