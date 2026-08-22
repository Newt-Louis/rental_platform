# XMOD-xxx — [Source] → [Destination]

> Cross-module contract. Catalog entry lives in
> `docs/system-truth-templates/05-CROSS-MODULE-CONTRACTS.md`; this is
> the per-contract fillable format, verified at Gate 3
> (`docs/ai-governance/05-E2E-QUALITY-GATES.md`).

## SOURCE
(Originating module/service.)

## DESTINATION
(Receiving module/service.)

## TRIGGER
(What causes this contract to fire — event, direct call, scheduled job.)

## PRECONDITIONS
(What must be true of the source data before this contract can execute.)

## INPUT
(Exact shape of data passed.)

## DATA PROPAGATION
(Which fields are copied vs. referenced vs. transformed.)

## SNAPSHOT DATA
(Any data captured at a point in time that must NOT later be re-derived
from the live source — e.g. contract currency snapshotted onto an
invoice at creation time.)

## GUARANTEED OUTPUT
(What the destination is guaranteed to have after this contract executes
successfully.)

## UNIQUENESS
(What prevents duplicate application — e.g. natural key, idempotency key.)

## TRANSACTION
(Is source-write and destination-write atomic together? If not, what's
the recovery path for partial completion?)

## IDEMPOTENCY
(Behavior if this contract executes twice with the same input.)

## FAILURE
(What happens if the destination is unavailable or rejects the input.)

## RETRY
(Retry policy — count, backoff, dead-letter behavior.)

## EVENT
(If event-driven: event name, payload schema, delivery guarantee.)

## AUTHORIZATION
(Does this cross-module call carry/re-verify Mall/Tenant scope, or does
it trust the source's prior authorization check?)

## OBSERVABILITY
(How a failure or delay in this contract becomes visible to an operator.)
