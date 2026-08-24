# CR-CONTRACT-CORRECTNESS-BACKLOG — Golden Contract follow-up

Status: PENDING CORRECTNESS REVIEW
Source program: Golden Contract
Golden Contract scope: explicitly excluded

This file records correctness risks found while implementing the approved
frontend-only Golden Contract workspace. It does not authorize a behavior,
API, schema, database, or lifecycle change.

## 1. Termination transaction boundaries

The current termination initiation/completion path updates more than one
business object, including Contract and Unit state. The reviewed service code
does not provide sufficient evidence that every related write is committed as
one atomic operation. A separate correctness CR must map concurrent writers,
failure recovery, retry/idempotency, and reconciliation before changing it.

Risk class: Tier 0/Tier 1 status and inventory correctness.
Golden Contract decision: display the existing process factually; do not alter
the backend behavior.

## 2. Amendment approval atomicity

The existing DRAFT → SUBMITTED → APPLIED lifecycle is authoritative and is
preserved by the UI. Approval applies amendment changes and status updates
through multiple writes whose atomicity requires a dedicated backend review.

Risk class: Tier 0 financial terms and contract-state correctness.
Golden Contract decision: require explicit UI confirmation; do not change the
approved lifecycle or implementation.

## 3. Direct Contract creation atomicity

The direct Contract creation path appears to have weaker transactional
guarantees than the proposal-driven path. The impact on Unit occupancy,
downstream Billing schedule creation, Fitout handoff, duplicate requests, and
retry behavior must be assessed together in a separate correctness CR.

Risk class: cross-domain Contract, Spaces, Billing, and Fitout consistency.
Golden Contract decision: no creation-flow or backend changes.

## Required follow-up gate

Before implementing any item above:

1. Create a dedicated Change Request and impact map.
2. Confirm authoritative business behavior with Contract, Spaces, Billing,
   and Fitout owners.
3. Define concurrency, idempotency, rollback, and reconciliation scenarios.
4. Run the relevant Golden E2E journeys and full backend regression suite.
