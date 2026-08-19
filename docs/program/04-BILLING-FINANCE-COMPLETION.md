# Phase 4 — Billing & Finance: Completion Report

**Date:** 2026-08-19

## Phase 4 status: CORE (reliability/correctness/security) COMPLETE — UX workspace review explicitly deferred, not fabricated as done

Per the phase's own priority ordering (financial correctness → data
integrity → idempotency → concurrency → auditability → security →
retry/notification → **UX last**), this pass fully executed everything
through security/retry, and deliberately stopped before the UX sections
(33-39: Finance workspace, invoice/payment detail, error UX, role-scoping
UX, config UX, reporting consistency). Given the volume of real,
test-verified correctness/security fixes this pass already produced, doing
a rushed UX pass on top would have risked exactly the kind of shallow,
unverified work the program's own "no fake completion" rule exists to
prevent. Recorded as explicitly open, not silently dropped — see
"Deferred" below.

## Financial correctness

**Domain corrected vs. the phase brief's assumption:** there is no
separate Payment-Allocation entity in this schema — `Payment.invoiceId` is
a fixed FK, one payment per invoice. Sections 17-19/41-42 of the brief
(cross-invoice allocation, `SUM(payment) = SUM(allocated) +
SUM(unallocated)`) don't apply to an entity that doesn't exist; the actual
per-invoice reconciliation invariant (`outstanding = adjustedTotal −
netPaid`) was verified consistent across its 5 independent implementations
instead. Full detail in `04-BILLING-DOMAIN-MAP.md`.

**Outstanding-AR formula:** verified mathematically identical across
`BillingService`, `ArDunningService`, `CollectionKpiService`,
`PenaltyInterestService` — no live inconsistency found. Flagged as a
duplication/consistency *risk* for a future refactor (reliability backlog
item 12), not fixed here — extracting a 5-site shared function is more
surface area than justified without an observed divergence.

## Billing schedule

**Contract activation → schedule:** unchanged from Phase 3, re-verified
still atomic.

**Contract termination → schedule (the item-10 investigation this phase
was asked to do):** found the class of risk was more severe than
originally scoped. Phase 3 only looked at `ContractTerminationService.
cancel()`'s restored-status path (low risk — a schedule already exists
from before termination). Phase 4 found the real exposure:
`BillingScheduleService.buildScheduleForContract` — reachable via `POST
/billing/schedule/:contractId/build` — had **no contract-status guard
beyond the `isActive` soft-delete flag**, so it could regenerate a full
billing schedule through a contract's original `endDate` for a contract
that was `TERMINATED`, `TERMINATING`, `DRAFT`, or `EXPIRED`. **Fixed**:
schedule (re)generation now requires `ACTIVE`/`EXPIRING` status, matching
`generateDueInvoices()`'s own filter — the same invariant class as Phase
3's "no half-active contract," applied here as "no billing schedule for a
contract that can't be billed."

**Deliberately not implemented:** truncating/marking existing `PENDING`
schedule rows when termination is initiated. Investigated and rejected —
the schema has no way to distinguish "this period is SKIPPED because the
contract terminated" from "this period is SKIPPED because it's
legitimately rent-free" without a new field (migration), and the guard
above already closes the actually-reachable risk (those rows are
permanently inert once the contract can't pass the status check again).
Implementing it anyway risked a real regression (accidentally un-skipping
a legitimate rent-free period on termination-cancel) for a purely
cosmetic/data-hygiene gain. Reasoning captured in full in
`billing-schedule.service.ts`'s inline comment and
`RELIABILITY_BACKLOG.md` item 10b.

## Invoice generation

Re-verified against current code, not rewritten: `Serializable`
transaction per invoice, deterministic invoice numbers making concurrent
generation self-resolving via `P2002` repair, schedule-entry protection
(invoiced periods can't be pruned). Used as one of the three internal gold
standards this phase's hardening work modeled itself on (documented in
`03-CONTRACT-PATTERN-REFERENCE.md`, extended here).

## Invoice issue — hardened this phase

**Before:** `BillingService.issueInvoice()` did an unwrapped totals-recalc
then status-update, with **zero notification logic at all** — the
`BillingConfig.notifyTenantOnIssue` toggle existed in settings but was
never read anywhere (confirmed dead in Phase 2, reconfirmed here). A
same-invoice retry (double-click) threw a `BadRequestException` instead of
resolving gracefully.

**After:** one `Serializable` transaction covers totals recalculation,
status update, and — if the flag is on — a queued tenant notification via
the same retryable `EmailDeliveryService` already proven for AR-dunning
and fitout-SLA email (not a synchronous send, and the notification-queue
write itself is cheap/local so it's safe to keep inside the transaction —
full reasoning in `04-BILLING-FAILURE-MATRIX.md`). A same-invoice retry is
now an idempotent replay: returns the already-issued invoice, re-enqueues
the notification (safe no-op via a deterministic `eventKey`), no error.

**Auto-issue path also fixed**, not just the manual button:
`BillingScheduleService.generateDueInvoices()`'s auto-issue-on-generation
branch now calls the same notification method — the flag applies
consistently regardless of which code path transitions an invoice to
`ISSUED`.

## Tenant notification

Routed through `EmailDeliveryService` (existing retryable queue: 15s poll,
exponential backoff up to 30 min) — not a new delivery mechanism. Added
`EmailService.invoiceIssuedHtml()` template, matching the existing
`invoiceOverdueHtml()` style.

## Payment recording

Re-verified unchanged — the existing gold standard (idempotency key +
hash, `Serializable` transaction, `P2002` fallback, mandatory-reason
reversal, void-blocked-if-payments-exist). No code change; used as the
reference for the invoice-issue hardening above.

## Payment allocation

Not applicable to this schema (no separate allocation entity) — see
"Financial correctness" above.

## AR / reconciliation

Aging date basis verified consistent (`dueDate`, not `issuedAt`) across
the OVERDUE-marking cron, dunning, and penalty-interest calculation.
Outstanding-AR formula verified consistent (see above). SAP reconciliation
(`SapReconciliationService.reconcilePending`) reconfirmed to have no
scheduled trigger anywhere in the codebase (Phase 2's "likely manual-only"
flag stands, not resolved further — out of this phase's scope to add a
cron for a job whose intended cadence isn't specified anywhere).

## Security

**Fixed:** `FilesController.downloadUnifiedDocument`'s `INVOICE` case had
no role restriction for non-tenant users — any authenticated staff role,
including ones with zero Billing module access elsewhere in the platform,
could download invoice documents. Restricted to `ADMIN`/`FINANCE`/
`MALL_DIRECTOR`, matching `role-permissions.ts`'s own `billing` read-access
list. Tenant-ownership check (a tenant can only access their own invoices'
documents) was already correct, unchanged.

**Re-verified, not re-fixed:** the broader `/uploads` public-exposure P1
(Phase 0 baseline) was already remediated before this program started —
`main.ts`'s static mount now only serves genuinely public assets, and
`FilesController` requires authentication + per-record authorization for
everything else. Confirmed still true, not re-broken by this phase's
changes.

## Concurrency

7 scenarios analyzed in `04-BILLING-CONCURRENCY.md`. 2 newly test-covered
this phase (invoice double-issue, terminated-contract schedule rebuild); 4
re-confirmed already-safe from existing code/tests; 1 (dunning-vs-payment
timing) documented as an accepted, low-severity, non-repeating
eventual-consistency window rather than engineered away.

## UX

**Deferred, not done.** Per the phase's own priority ordering, this pass
prioritized correctness/security over the Finance-workspace UX review
(sections 33-39: needs-attention dashboard, invoice/payment detail
content, error UX copy, role-scoping UX, config-flag UX, reporting
consistency). Not claimed complete.

## Tests

**PASS.** Full backend suite: 65/65 suites, 328/328 tests (Phase 3 ended at
321; +7 net from this phase's new tests: 4 in `billing.invoice-issue.
spec.ts`, 1 in `billing-schedule.service.spec.ts`, 2 in `files.controller.
spec.ts`). 0 regressions.

## Build

**PASS.** `npx tsc --noEmit` clean throughout.

## Files changed

**Backend:**
`modules/billing/billing.service.ts` (issueInvoice hardening,
enqueueInvoiceIssuedNotification, recalculateTotals tx-client param,
constructor deps),
`modules/billing/billing-schedule.service.ts` (status guard,
generateDueInvoices notification call, constructor deps),
`modules/notifications/email.service.ts` (invoiceIssuedHtml template),
`files/files.controller.ts` (invoice-document role scoping).

**Tests:**
new `modules/billing/billing.invoice-issue.spec.ts`,
`modules/billing/billing-schedule.service.spec.ts` (+1 test, mock
updates), `modules/billing/billing.payment-transaction.spec.ts`,
`modules/billing/billing.receivables.spec.ts`,
`modules/billing/billing.adjustment.spec.ts` (constructor-signature mock
updates only, no behavioral change), `files/files.controller.spec.ts` (+2
tests).

**Docs:** `docs/program/04-BILLING-DOMAIN-MAP.md`,
`04-BILLING-CONCURRENCY.md`, `04-BILLING-FAILURE-MATRIX.md`,
`04-BILLING-FINANCE-COMPLETION.md` (this file),
`docs/program/RELIABILITY_BACKLOG.md` (updated).

No frontend files changed — UX review deferred, not performed.

## Remaining risks

- Item 10 (narrow): `cancel()`-restored contracts can carry a stale
  schedule if amended mid-termination — still open, low probability.
- Item 11: dunning-vs-payment timing window — documented, accepted,
  non-repeating.
- Item 12: outstanding-AR formula duplicated across 5 sites — documented
  consistency risk, not a live bug.
- SAP reconciliation trigger cadence — still unconfirmed/possibly
  manual-only, unchanged from Phase 2.
- Billing UX (sections 33-39) — not reviewed this pass.

## Reliability backlog

Before this phase: 9 → 7 remaining (2 resolved in Phase 3), + 1 low-risk
edge case (item 10) + 1 dead flag.
After this phase: **13 tracked items total** (9 original + item 10b, 11,
12, 13 found this phase) — **5 resolved** (Phase 3: 2; Phase 4: item 10b,
the dead flag, item 13), **8 open**, all with an assigned owning phase.
Full detail in `docs/program/RELIABILITY_BACKLOG.md`.

## Production impact

No breaking API changes, no new migrations, no removed routes/fields. Two
behavioral changes callers may notice: (1) `POST /invoices/:id/issue` on an
already-`ISSUED` invoice now returns success instead of a 400 error; (2)
`POST /billing/schedule/:contractId/build` now rejects non-`ACTIVE`/
`EXPIRING` contracts with a 400 instead of silently regenerating their
schedule. Both are correctness fixes, not contract-breaking for any
legitimate caller.

## Recommended next phase

Per the master program's sequencing: **Phase 5 (Fitout & Handover)** picks
up reliability-backlog items 6, 7, 9 (fitout non-atomicity, no-retry
fitout-project creation, submittal-email retry gap) — the most direct
continuation of this program's reliability work. The deferred Billing UX
review (sections 33-39 of this phase's own brief) is also available as a
fast-follow if preferred over jumping to Fitout.
