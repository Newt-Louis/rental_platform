# 06 — Backbone Retry Matrix

**Date:** 2026-08-19. Covers the required "unknown-outcome" scenario
(client sends request → server commits → network drops before response →
client retries) for every listed flow. Detail per-flow already exists in
each phase's own docs; this table is the cross-module summary, not a
re-derivation.

| Flow | Same-request retry outcome | Verified by |
|---|---|---|
| Proposal submit | **Safe.** In-transaction re-check rejects a stale DRAFT assumption; a genuine double-submit resolves via `ApprovalWorkflow.proposalId @unique` + P2002 repair — the retrying client gets the same `workflowId` either way. | Phase 3 test: `proposals.service.spec.ts` (race case) |
| Approval completion | **Safe.** `ApprovalsService.approve/reject` — Serializable transaction; a step already `APPROVED` would fail the sequential-order guard on a literal duplicate call (by design — approving twice is treated as a new, invalid request, not a replay, since there's no natural "same approval" idempotency key beyond the step itself already being terminal). | Pre-existing engine, unchanged this program |
| Contract creation (Proposal→Contract) | **Safe.** Pre-check + in-tx re-check + P2002 repair — retry returns the same Contract. | Phase 3 test: `proposal-contract-conversion.spec.ts` |
| Contract activation | **Safe.** In-transaction re-read; same-status retry re-attempts the outbox-enqueue and billing-schedule build (idempotent), doesn't re-write status/event. Concurrent race resolves via P2034 repair. | Phase 3 test: `contract-activation.spec.ts` |
| Billing schedule (re)build | **Safe, with a new guard.** Upsert-based, safe to re-run; now additionally rejects non-`ACTIVE`/`EXPIRING` contracts outright (Phase 4). | Phase 4 test: `billing-schedule.service.spec.ts` |
| Invoice generation (scheduled) | **Safe.** Deterministic `invoiceNumber`; P2002 repair links the retry to the already-created invoice. | Pre-existing, re-verified Phase 2/4 |
| Invoice issue | **Safe.** In-transaction re-read; same-invoice retry (already ISSUED) is an idempotent replay — returns the existing invoice, re-enqueues the notification (safe no-op via deterministic `eventKey`), no error. | Phase 4 test: `billing.invoice-issue.spec.ts` |
| Payment recording | **Safe — gold standard.** `idempotencyKey` + hash-verified replay; genuine concurrent double-submit closed at the DB unique-constraint level too. | Pre-existing, re-verified Phase 3/4 |
| Fitout auto-create | **Safe.** Pre-check + in-tx re-check + P2002 repair on `FitoutProject.contractId @unique`. | Phase 5 test: `fitout-lifecycle.spec.ts` |
| Fitout stage advance | **Safe.** In-transaction re-read; exact-match retry (double-click) is an idempotent no-op; stale-read retry (project moved to a *different* status) is rejected with a clear conflict message rather than silently misapplied; genuine race resolves via P2034 repair. | Phase 5 test: `fitout-lifecycle.spec.ts` |

## Not naturally idempotent by design — noted, not treated as a defect

- **Approval decision (approve/reject) itself**: a literal duplicate
  "approve step N" call after step N is already `APPROVED` fails the
  sequential-guard check (the step is no longer the "current" pending
  one in the same way) — this surfaces as an error to the retrying
  client rather than a silent success. Judged correct: unlike "submit a
  proposal" or "issue an invoice," there is no meaningful single
  business action being retried here if the workflow already moved past
  that step by the time the retry lands — the UI's own optimistic
  update plus a page refresh is the expected recovery, not a
  transparent idempotent replay.
- **Fitout-submittal create/resubmit**: not specifically retry-hardened
  this program (out of the three known Fitout findings) — inherits
  whatever guarantees the shared `ApprovalWorkflow` creation transaction
  already provides for the workflow-creation half, but the `FitoutSubmittal`
  row itself has no dedicated idempotency key. Not flagged as urgent —
  no evidence of double-submission being a real operational problem for
  submittals, and creating a genuinely duplicate submittal (two rows for
  the same document) is recoverable by an operator obsoleting one, unlike
  a duplicate Contract or Invoice.
