# 06 — Backbone Concurrency Matrix

**Date:** 2026-08-19. Per-module concurrency already covered in
`02-E2E-WORKFLOW.md`, `04-BILLING-CONCURRENCY.md`,
`05-FITOUT-CONCURRENCY.md`. This is the cross-module set specifically
requested by this gate, marked honestly by evidence class — code review is
not the same as a test, and a test is not the same as live data
confirmation.

| # | Scenario | Result | Evidence class |
|---|---|---|---|
| 1 | Approval completion vs. duplicate completion (same workflow's completion event processed twice — e.g. outbox redelivery) | Safe — `onApprovalWorkflowCompleted`'s `handleProposalFullyApproved` re-checks `Proposal.status === APPROVED` before acting, and `createContractFromProposal`'s own idempotency check means a second call is a no-op returning the existing contract | **REASONED SAFE** (code-reviewed: both guard checks read directly, not simulated under load) |
| 2 | Contract activation vs. retry | Idempotent replay / P2034 repair | **VERIFIED TESTED** (`contract-activation.spec.ts`) |
| 3 | Invoice-generation worker vs. contract termination (a scheduled `generateDueInvoices` run is mid-batch for a contract that gets terminated in the same window) | `generateDueInvoices` queries `Contract.status IN (ACTIVE, EXPIRING)` once, at the start of its run, then iterates the fetched list — a termination that commits *after* that query but *before* that contract's iteration completes could still generate one invoice for a period that, strictly, occurred after termination. Not a corruption risk (the invoice is real, for a real period that was due) but a timing edge case worth naming. No lock exists between these two flows beyond each one's own internal transaction. | **REASONED — ACCEPTED WINDOW** (not tested; same class of gap as Billing's dunning-vs-payment scenario, and Fitout's SLA-vs-completion scenario — a single-batch-read-then-act pattern that this program has consistently classified as low-severity and left undisturbed rather than redesigning the job-batching architecture) |
| 4 | Payment vs. dunning | Documented in `04-BILLING-CONCURRENCY.md` #5 | **REASONED — ACCEPTED WINDOW** (unchanged this gate) |
| 5 | Fitout stage completion vs. SLA job | Documented in `05-FITOUT-CONCURRENCY.md` #6 | **REASONED — ACCEPTED WINDOW** (unchanged this gate) |
| 6 | Contract termination vs. billing-schedule processing | `ContractTerminationService.initiate()` moves status to `TERMINATING` in its own transaction; `buildScheduleForContract` (both the auto-activation path and the manual-rebuild endpoint) now requires `ACTIVE`/`EXPIRING` (Phase 4). A termination that commits *between* `generateDueInvoices`'s status-filter query and its per-contract `buildScheduleForContract(contract.id)` call would hit the new guard and throw for that one contract — **was unsafe (would have aborted the whole batch), now fixed this gate** (see Finding D) | **WAS UNSAFE — FIXED THIS GATE** |
| 7 | Contract termination vs. fitout progress | Finding C in `06-BACKBONE-CONSOLIDATION.md` — no guard exists at all | **VERIFIED — confirmed 0 live occurrences, but code-level gap confirmed by direct reading, not by a concurrency test** |

## Finding D (new) — scenario 6's guard fix has an uncaught-exception side effect

`BillingScheduleService.generateDueInvoices()` loops over every fetched
`ACTIVE`/`EXPIRING` contract and calls `await
this.buildScheduleForContract(contract.id)` (line 126) **before** its own
try/catch (which only wraps the later per-invoice `$transaction` at line
158). If a contract in that batch transitions to `TERMINATING` between the
batch's initial fetch and this specific line — a narrow but real window —　
`buildScheduleForContract`'s Phase 4 guard now throws `BadRequestException`
for that contract, **uncaught at this call site**, which would abort the
*entire* `generateDueInvoices` run for every contract still left in the
loop after it, not just the one that got terminated mid-run.

**Severity: P1** (a single mid-run termination could silently stop
same-night invoice generation for every other, unrelated contract later in
the iteration order). **Precision on origin, verified by reading the code
directly:** the uncaught-exception *shape* of this bug is not new — line
162's call was never wrapped in a try/catch, and the pre-existing
`isActive` soft-delete guard could already throw here before Phase 4 for a
contract that was somehow soft-deleted while still `ACTIVE`/`EXPIRING`.
What Phase 4 changed is the *likelihood*: soft-delete-while-still-active is
an anomalous state that should rarely occur, while a contract terminating
mid-batch-run is a realistic, everyday operational event — Phase 4's new
status guard turned a rare theoretical trigger into a plausible one.
**Fixed as part of this gate** — unlike the other cross-module findings,
this one is a narrow, well-understood, low-risk defensive fix (wrap the
call in a try/catch, log and skip that one contract, continue the loop)
directly addressing a regression risk this program's own Phase 4 work
introduced, so it was judged in-scope rather than deferred: a batch job
silently stopping for unrelated contracts because of one contract's status
change is exactly the "silent disappearance" section 11 says is not
acceptable for a business-critical handoff. `BillingScheduleService.
generateDueInvoices()` — test:
`billing-schedule.service.spec.ts` ("skips a contract whose schedule
rebuild fails instead of aborting the whole batch"). Recorded as
`RELIABILITY_BACKLOG.md` item 17, **RESOLVED**.
