# 06 — Backbone Reconciliation

**Date:** 2026-08-19. Unlike the rest of this gate's docs, this one is
**live-data evidence**, not code review or reasoning — every result below
came from actually running read-only SQL against the running local
Postgres instance (`leasing-db`, the dev/UAT-local database this
environment's Docker Compose stack manages), via a new reusable script:
`scripts/backbone-reconciliation.mjs`.

## How to run it

```bash
node scripts/backbone-reconciliation.mjs
```

Every check is a `SELECT` — nothing is mutated. Exits non-zero if any
check finds rows, so it's safe to wire into a CI/ops job later (not done
in this gate — that would be new infrastructure, out of scope; the script
itself is the deliverable this gate calls for).

## Result, as of this gate (2026-08-19)

```text
[FOUND] ACTIVE/EXPIRING contracts without any BillingScheduleEntry — 12 rows
[CLEAN] ACTIVE/EXPIRING contracts without any FitoutProject
[CLEAN] Multiple Contracts per Proposal (duplicate conversion)
[CLEAN] Multiple FitoutProjects per Contract (duplicate auto-create)
[CLEAN] Multiple ApprovalWorkflows per Proposal (duplicate submit)
[CLEAN] TERMINATED/TERMINATING contracts whose FitoutProject is not at a terminal-ish stage
[CLEAN] Active invoices whose Contract is soft-deleted
[CLEAN] FitoutProject at OPENED but its Unit is not OCCUPIED (handover/unit-status desync)
[CLEAN] Orphan ApprovalWorkflow (PROPOSAL/FITOUT_SUBMITTAL entityType with no matching owner record)

Summary: 8/9 clean, 1 found issues, 0 errored.
```

8 of 9 invariants hold with zero violations against live data — including
the two duplicate-prevention checks (Contract-per-Proposal,
FitoutProject-per-Contract) that this program's Phase 3/5 work specifically
added protection for, which is a meaningful positive signal: the
atomicity/idempotency fixes aren't just unit-tested in isolation, the
invariants they're supposed to guarantee actually hold in a real database.

## The one finding — root-caused, not just reported

**12 of 12 `ACTIVE`/`EXPIRING` contracts in this database have zero
`BillingScheduleEntry` rows.**

Root cause, confirmed by reading `apps/backend/prisma/seed.ts` directly:
the seed script calls `prisma.billingScheduleEntry.deleteMany()` at
startup (clearing the table), then inserts contracts via
`prisma.contract.create({ data: { status: ContractStatus.ACTIVE, ... } })`
— a raw Prisma insert, **not** a call to `ContractsService.updateStatus()`.
All 12 contracts share creation timestamps within 60ms of each other
(`07:21:30.067` – `07:21:30.125`), confirming a single seed-script batch
insert, not 12 independent app-level activations. Cross-checked: all 30
`Invoice` rows in this database have an empty `sourceId` (the
schedule-generation path always sets `sourceId: scheduleRow.id` — these
invoices were seeded directly too, bypassing `generateDueInvoices`
entirely).

**This is not a defect in Phase 3's activation-transaction hardening.**
The invariant ("an ACTIVE contract has a billing schedule") holds for
every contract that has ever gone through `ContractsService.updateStatus()`
— it's structurally guaranteed by that one transaction. It does not, and
cannot, hold for rows inserted directly into the database outside the
application layer, because no database-level constraint enforces
"`Contract.status = ACTIVE` implies a `BillingScheduleEntry` exists" — nor
should one: that would make routine schema/data seeding for tests
impossible without also fabricating a full billing history for every
sample contract.

**Severity: P3 (data-hygiene / seed-fidelity), not P0/P1.** Recorded as
`RELIABILITY_BACKLOG.md` item 18 — recommendation: either have
`prisma/seed.ts` also call `buildScheduleForContract` for the contracts it
seeds as `ACTIVE`/`EXPIRING` (so demo/dev data matches what a real
activated contract looks like), or leave a comment in the seed file
explicitly noting the gap so a future engineer doesn't mistake seeded data
for a template of "healthy" production state. Not fixed in this gate —
seed-script behavior change is exactly the kind of "broad feature
implementation" this gate explicitly excludes.

## What this result does and doesn't prove

**Proves:** the reconciliation script correctly detects a real,
independently-confirmed discrepancy — it isn't a script that trivially
returns clean on everything. **Proves:** duplicate-prevention invariants
(the two most safety-critical checks, matching Phase 3/5's hardening
work) hold with zero violations. **Does not prove:** the invariant holds
under production write volume/concurrency — this is one snapshot of a
small (15-contract) local dataset, not a load test. **Does not prove:**
every contract that *has* gone through `updateStatus()` in this dataset
has a schedule — in this dataset, *none* of the 12 ACTIVE/EXPIRING
contracts went through it, so this check has never actually exercised the
"positive" case here. Recommend re-running this script against the actual
UAT environment (where contracts are more likely to have been created
through the real API) before treating "12/12 clean" as the expected
baseline going forward.
