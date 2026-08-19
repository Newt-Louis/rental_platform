# Data Integrity — Proposal → Contract

**Status:** RESOLVED (code + unit-verified) · 2026-08-19 · Sprint: Production
Hardening A

## Problem (Gate Review finding)

`ProposalsService.createContractFromProposal()` performed a sequence of
unwrapped, independent writes:

```text
Contract.create()
  → UnitStatusService.transition() (its own separate transaction)
    → UnitBooking.updateMany()
      → Proposal.update({status: CONVERTED})
        → Lead.update({status: WON})
          → CustomersService.createFromLead()
```

If any step after the `Contract.create()` threw — most plausibly
`UnitStatusService.transition()`, which validates the transition and can
legitimately reject it — the Contract row was already committed, but nothing
after it ran. Result: a Contract exists, but the Unit is still `VACANT`/
`BOOKING`, the old booking is still active, and the Proposal still reads
`APPROVED` instead of `CONVERTED` — a genuinely inconsistent state a user
could then act on again.

Separately, the existing idempotency guard (`const existing = await
prisma.contract.findFirst({ where: { proposalId } }); if (existing) return
existing;`) was a classic check-then-act race: two concurrent requests could
both read "no existing contract" before either committed. `Contract.proposalId`
is `@unique` in the schema, so a true duplicate contract was never actually
possible — but the loser of that race got a raw, unhandled Prisma `P2002`
error instead of the same graceful "here's the contract that already exists"
result the pre-check was meant to provide.

## Fix

1. **`UnitStatusService.transition()`** now accepts an optional 4th
   parameter — a Prisma transaction client — so callers that need this
   transition to be atomic with their own other writes can pass their `tx`
   through instead of the service opening a second, independent transaction
   (which Prisma doesn't support nesting into an outer interactive
   transaction anyway). Backward compatible: existing callers that don't
   pass a client keep the exact prior standalone-transaction behavior.

2. **`ProposalsService.createContractFromProposal()`** — Contract creation,
   the unit-status transition, booking cancellation, the Proposal status
   update, and the Lead status update all now run inside one
   `prisma.$transaction(async (tx) => {...}, { isolationLevel: Serializable
   })` — the same isolation level already used for approval decisions in
   `ApprovalsService`, for the same reason: this is a decision with
   side-effects, not a simple CRUD write. A failure at any point rolls back
   everything, including the Contract row.

3. **Race handling**: the pre-check is re-run *inside* the transaction
   (closing the original TOCTOU window under Serializable isolation), and a
   `P2002` unique-constraint error on the create is caught and resolved by
   looking up and returning the contract that now exists, rather than
   propagating a raw database error to the caller.

4. **Scope decision — what stays outside the transaction**:
   `CustomersService.createFromLead()` (a downstream CRM convenience,
   already idempotent on its own — returns the existing customer if the lead
   is already linked to one) and the tenant-portal invitation email
   (pre-existing best-effort pattern) are deliberately *not* inside the core
   transaction. A transient failure creating a CRM customer profile
   shouldn't roll back an otherwise-successful contract; it's logged and
   swallowed instead, matching the pattern already used for the invitation
   email elsewhere in the same method.

## Files

- `apps/backend/src/common/services/unit-status.service.ts`
- `apps/backend/src/modules/proposals/proposals.service.ts`
- `apps/backend/src/modules/proposals/proposal-contract-conversion.spec.ts` (new)

## Tests

New `proposal-contract-conversion.spec.ts`, 5 tests, all passing:
- Happy path: every dependent write happens inside one transaction, in
  order, and `unitStatus.transition` receives the transaction client rather
  than opening its own.
- **Rollback**: a failure partway through (simulated via
  `unitStatus.transition` rejecting) propagates, and nothing after that
  point in the sequence runs — proven by asserting the later mocks
  (`unitBooking.updateMany`, `proposal.update`, `lead.update`) were never
  called.
- **Idempotency**: calling with a proposal that already has a contract
  returns that contract directly without opening a transaction or touching
  any write.
- **Concurrent-race resolution**: simulates the P2002 unique-constraint path
  (both requests pass the pre-checks, the second `create()` hits the unique
  constraint) and asserts the caller gets back the winning contract instead
  of an exception.
- Existing guard (`must be APPROVED`) still rejects before any write.

Full backend suite: 298 passed / 7 failed (same 2 pre-existing failing
suites — `health.controller.spec.ts`, `proposals.controller.spec.ts` — as
every prior gate in this sprint, unrelated to this change). `npx tsc
--noEmit` — 0 errors.

## Not done in this pass

- No live end-to-end verification of a real Lead→Booking→Proposal→Approval→
  Contract run against the Docker stack — the unit tests directly exercise
  the rollback/idempotency/race branches that matter here, which a live
  click-through wouldn't meaningfully add to (triggering a real Postgres
  serialization conflict on demand isn't practical to script quickly). The
  Docker backend image was rebuilt with this change as part of the P1
  rebuild in this same session, so it's live in the running stack if you
  want to try the flow manually.
- Other multi-write flows flagged more generally in the original V2 audit
  (e.g. contract activation → Fitout/Billing kickoff, SAP sync) were **not**
  touched — this pass is scoped to the specific Proposal→Contract flow named
  in the Gate Review, not a project-wide transactional audit.
