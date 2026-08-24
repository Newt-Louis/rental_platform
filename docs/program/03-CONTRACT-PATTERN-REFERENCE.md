# 03 — Contract Lifecycle: Pattern Reference

**Date:** 2026-08-19. Per the Phase 3 brief's rule 4: study the codebase's
own proven-good implementations before designing anything new. This
document is why Proposal-submit and Contract-activation hardening below
reused three existing patterns rather than inventing an architecture.

## PATTERN 1 — Idempotency key + hash-verified replay (Payment recording)

**Current good implementation:** `BillingService.recordPayment`
(`apps/backend/src/modules/billing/billing.service.ts:852`).

- Client supplies an `idempotencyKey` (body or `Idempotency-Key` header).
- Server computes a sha256 hash of the semantic payload and stores it
  alongside the key.
- A replay with the *same* key and *same* hash returns the original
  `Payment` (true no-op). A replay with the same key but a *different* hash
  (key reuse with different amount) throws `ConflictException` instead of
  silently applying a different payment under an old key.
- Wrapped in `runSerializableTransaction`; a genuine concurrent double-submit
  is closed a second time at the DB unique-constraint level (`P2002` caught
  and resolved the same way as the pre-check).

**Why it works:** protects against three distinct failure modes at once —
naive retry (safe replay), malicious/buggy key reuse (rejected, not
silently accepted), and true concurrency (DB constraint is the final
authority, not just application logic).

**Where reused in Phase 3:** *not* reused directly — Proposal submit and
Contract activation are **state transitions**, not value-bearing financial
writes with a client-supplied amount. They don't need a client idempotency
key; the proposal/contract's own status field is an adequate idempotency guard
(see Pattern 2), because "submit this exact proposal" and "activate this
exact contract" have no meaningful "same key, different payload" case the
way a payment amount does. Using this pattern here would have been
over-engineering — the simpler pattern below is a truer fit and is what
this codebase already uses for the structurally closest case
(Proposal→Contract).

## PATTERN 2 — Pre-check + in-transaction re-check + unique-constraint repair (Proposal→Contract conversion)

**Current good implementation:**
`ProposalsService.createContractFromProposal`
(`apps/backend/src/modules/proposals/proposals.service.ts:577`), already
hardened per `docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md` and
re-verified unchanged and correct during this phase.

- A cheap pre-check outside any transaction (`findFirst` for an existing
  contract) fails fast for the common non-racing case.
- Inside a **Serializable** `$transaction`, the same check re-runs (closes
  the TOCTOU window between the pre-check and here).
- All dependent writes (Contract create, Unit-status transition, stale
  Booking cancellation, Proposal/Lead status updates) happen inside that
  one transaction — one commit, or none.
- If two concurrent requests both pass the pre-check and both attempt to
  insert, the DB's own unique constraint (`Contract.proposalId @unique`)
  rejects the loser with `P2002`; the catch block resolves this to the
  winning contract instead of surfacing a raw database error.
- Best-effort, non-critical side effects (`CustomersService.createFromLead`,
  a tenant-portal invitation email) are deliberately kept **outside** the
  transaction — already idempotent on their own, logged-and-swallowed on
  failure, because the contract's correctness must not depend on them.

**Why it works:** the DB constraint is the actual source of truth for
"exactly one," not application-level locking — so even a bug in the
pre-check/re-check logic can't produce a duplicate; it can only produce a
recoverable `P2002` that's already handled.

**Where reused in Phase 3:**
- `ProposalsService.submit()`: `ApprovalWorkflow.proposalId` already has a
  DB-level `@unique` constraint (`schema.prisma:1488`) — this phase added
  the same pre-check→in-transaction-re-check→`P2002`-repair shape, so a
  double-submit (double-click, browser retry, concurrent API call) resolves
  to the one workflow that actually won, exactly like the Proposal→Contract
  case.
- `ContractsService.updateStatus()`: no natural unique constraint applies
  (there's nothing to double-insert — it's a status field mutation), so
  this phase used the transaction-isolation-level failure itself
  (`P2034`, Postgres's serialization-conflict error under `Serializable`
  isolation) as the signal, and resolved it the same way: re-fetch, and if
  the current state already matches the intended outcome, treat it as a
  successful idempotent replay rather than an error.

## PATTERN 3 — Serializable transaction + sequential state-machine guards (Approval-step decisions)

**Current good implementation:** `ApprovalsService.approve()`/`reject()`
(`apps/backend/src/modules/approvals/approvals.service.ts:206-331`).

- Every step decision runs inside
  `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }`,
  including the outbox-event insert for the two events that matter
  downstream (`approval.workflow.completed`/`.rejected`) — so "the decision
  was recorded" and "the event is now queued for reliable delivery" are
  guaranteed consistent with each other.
- State-machine guards run *inside* the transaction, not just at the
  controller layer: sequential-step enforcement (an earlier unapproved step
  blocks a later one), approver-role/approver-id matching.
- The module is deliberately entity-agnostic — it doesn't know what
  "PROPOSAL" or "FITOUT_SUBMITTAL" means; consumers subscribe to the
  emitted events. This keeps the hardening reusable rather than
  proposal-specific.

**Why it works:** `Serializable` isolation means the database — not
hand-rolled row locking — is what prevents two concurrent decisions on the
same step from producing an inconsistent result; the code only has to
handle the resulting conflict error gracefully, not implement locking
itself.

**Where reused in Phase 3:** both `ProposalsService.submit()`'s transaction
and `ContractsService.updateStatus()`'s transaction now use the same
`Serializable` isolation level, for the same reason — these are exactly the
same shape of problem (a state-machine transition with a possible
concurrent duplicate attempt) as approval-step decisions.

## What Phase 3 deliberately did NOT invent

Per rule 4 ("Không invent một architecture mới nếu những pattern hiện tại
đã giải quyết đúng vấn đề") and rule 15 ("Không làm workflow phức tạp nếu
synchronous DB transaction đủ an toàn"):

- **No new idempotency-key mechanism.** Proposal submit and Contract
  activation are state transitions with a natural DB-level idempotency
  guard already available (a unique constraint for the former, the target
  status itself for the latter) — adding a client-supplied key would
  duplicate protection that already exists at a stronger layer (the
  database), not add real safety.
- **No `ACTIVATING` intermediate status / saga / background-worker
  hand-off for billing-schedule generation.** The brief itself names this as
  an option only "if generate schedule có logic dài" (long-running logic).
  `BillingScheduleService.buildScheduleForContract` is pure DB reads/writes
  (period-math is in-memory, no external I/O) — it fits inside a normal
  DB transaction with no meaningful latency cost, so the simpler fix
  (make it join the caller's transaction) was correct and is what was
  built. Revisit this decision only if schedule generation later grows an
  external call (e.g. a SAP sync) that shouldn't hold a DB transaction open.
- **No new outbox topic for Proposal-submit or Contract-activation
  completion.** The existing outbox is reused as-is for the events it
  already owns (`contract.activated`); the newly-hardened writes don't need
  their own event — nothing downstream needs to react asynchronously to
  "a proposal was submitted" the way Fitout reacts to "a contract was
  activated."
