# 04 — Billing & Finance: Failure Matrix

**Date:** 2026-08-19. Per-write-flow failure analysis, evidence-based
(traced against code + this phase's tests), not assumed.

## Invoice generation (`BillingScheduleService.generateDueInvoices`) — unchanged this phase, re-verified

| Failure point | Persistent state | User/operator sees | Recoverable | Risk |
|---|---|---|---|---|
| Invoice create fails mid-transaction | Rolled back — no invoice, `BillingScheduleEntry` stays `PENDING` | Job log shows the error for that period; period stays in the "pending receivables" list | Yes — next run (or manual `POST /billing/schedule/generate-due`) retries the same period | Low |
| Two workers race on the same period | One wins the insert; the other hits `P2002` on the deterministic invoice number, caught and repaired (links the winner's invoice to its own `BillingScheduleEntry` row) | Both see success; no duplicate invoice | Not applicable — self-resolving | None |
| `autoIssueInvoices` is on and the issue-status update inside the same transaction fails | Rolled back — no invoice at all, not "invoice created but stuck in DRAFT" | Same as "create fails" above | Yes — retry | Low |
| Notification enqueue fails (new this phase) | Since `enqueueInvoiceIssuedNotification` runs inside the same transaction as invoice creation, a failure there rolls back the **entire invoice**, not just the notification | Retry regenerates the period from scratch (deterministic invoice number, so it's still exactly-once) | Yes | **Traded off deliberately**: a broken email-template/DB issue could block invoice generation entirely, since the notification write is in-transaction. Judged acceptable — `EmailDeliveryService.enqueue` is a pure DB upsert (no network call at enqueue time; the actual SMTP send happens later, out-of-transaction, in the retryable cron), so this failure mode requires a database-level fault, not an email-provider fault. See "why in-transaction" note below. |

**Why the notification enqueue is inside the transaction, not fire-and-forget after:**
`EmailDeliveryService.enqueue()` only writes an `EmailDelivery` row (no SMTP call — that happens asynchronously via the existing 15s cron). Per rule 6 ("Invoice transaction → Outbox/delivery queue → COMMIT → Async delivery"), the write itself is cheap, local, and correctness-relevant (we want "invoice issued" and "notification intent recorded" to be atomic, exactly like Phase 3's contract-activation + billing-schedule fix) — it is not the actual email send, which stays fully out-of-transaction and retryable.

## Invoice issue (`BillingService.issueInvoice`) — hardened this phase

| Failure point | Persistent state (pre-Phase-4) | Persistent state (post-Phase-4) | User sees | Recoverable |
|---|---|---|---|---|
| Not DRAFT/ISSUED (e.g. CANCELLED) | No writes | No writes (unchanged) | `BadRequestException` | N/A — invalid request, not a failure |
| Totals recalc fails | Pre: partial — totals possibly updated, status still DRAFT (no transaction existed) | Post: fully rolled back — nothing changes | Error, safe retry | Post: yes, clean. Pre: yes too, coincidentally (recalc ran before status write, so a failure there never left an inconsistent status) |
| Status update fails | Pre: N/A (recalc and status update were two separate, sequential unwrapped calls — a status-update failure left recalculated totals with the invoice still DRAFT, "wrong" only in that the totals looked final on a still-editable invoice) | Post: fully rolled back — totals unchanged | Error, safe retry | Post: yes, clean. Pre: recoverable but slightly confusing intermediate state (harmless, since DRAFT invoices are still editable) |
| Notification enqueue fails | Pre: **not attempted at all — the flag was dead code, no notification ever sent regardless of failure.** | Post: rolled back with everything else — invoice stays DRAFT, no partial "issued but not notified" state | Error, safe retry | Post: yes |
| Double-issue (double-click/retry after success) | Pre: second call throws `BadRequestException('Invoice is not DRAFT')` — the *user* sees an error for a call that, from their perspective, should have been a no-op | Post: **idempotent replay** — returns the already-issued invoice, no error, notification re-enqueued (safe no-op via deterministic `eventKey`) | Post: success, same result both times | Post: yes, by design |

## Payment recording — re-verified, unchanged (gold standard, per `03-CONTRACT-PATTERN-REFERENCE.md` Pattern 1)

No new failure points introduced. Re-confirmed against current code this
phase: `Serializable` transaction, `idempotencyKey` + hash-verified replay,
`P2002` DB-level race resolution, mandatory-reason reversal, void blocked
if any active payment/adjustment exists. Used as the reference pattern for
the invoice-issue hardening above rather than re-derived.

## Billing schedule (re)build (`BillingScheduleService.buildScheduleForContract`) — new guard this phase

| Failure point | Pre-Phase-4 | Post-Phase-4 |
|---|---|---|
| Called on a `TERMINATED`/`TERMINATING`/`EXPIRED`/`DRAFT` contract via the manual rebuild endpoint | **No guard beyond the `isActive` soft-delete flag** — would regenerate the full period set through the contract's original `endDate`, including periods after the contract stopped being billable | `BadRequestException('Cannot build a billing schedule for a contract with status ...')` — rejected outright, no writes | 
| Called on an `ACTIVE`/`EXPIRING` contract (the only legitimate case) | Works | Works, unchanged |

Not attempted this phase: retroactively truncating/marking existing
`PENDING` schedule rows for already-terminated contracts. Investigated and
deliberately deferred — see `04-BILLING-FINANCE-COMPLETION.md` for the
reasoning (the schema can't distinguish "skipped because terminated" from
"skipped because rent-free" without a migration, and the guard above
already closes the actual reachable risk: those rows are permanently inert
once the contract can no longer pass this status check).

## Document access (`FilesController.downloadUnifiedDocument`, `INVOICE` case) — hardened this phase

| Failure point | Pre-Phase-4 | Post-Phase-4 |
|---|---|---|
| A non-tenant, non-billing staff role (e.g. `OPERATION`, `LEASING_EXECUTIVE`) requests an invoice document | **Allowed** — no role check existed for this branch, only the `TENANT`-ownership check | `ForbiddenException` unless the role is `ADMIN`/`FINANCE`/`MALL_DIRECTOR` (matching `role-permissions.ts`'s `billing` read-access list) |
| The owning tenant requests their own invoice document | Allowed | Allowed, unchanged |
| A different tenant requests the invoice | Rejected | Rejected, unchanged |
