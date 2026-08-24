# 04 — Billing & Finance: Domain Map

**Date:** 2026-08-19. Extracted from `apps/backend/prisma/schema.prisma` and
the services that own each write path — not invented from the phase
brief's illustrative example. One structural correction to the brief's
assumed model, found immediately on reading the schema:

## There is no separate "Allocation" entity

`Payment.invoiceId` is a required, non-nullable foreign key
(`schema.prisma:2278`) — **one payment always belongs to exactly one
invoice.** There is no "split one payment across multiple invoices" or
"one invoice funded by many payments' partial allocations" table. A
partial payment is simply a `Payment` row whose `amount` is less than the
invoice's outstanding balance; "allocation" in this codebase is not a
distinct step or entity, it's implicit in the FK. Sections 17-19 and 41-42
of the phase brief (payment allocation, `SUM(payment) = SUM(allocated) +
SUM(unallocated)`) don't map onto an entity that exists — the actual
reconciliation invariant used below is the simpler one this schema
supports (per-invoice: outstanding = adjusted total − active payments),
not a cross-invoice allocation ledger. If multi-invoice payment
allocation is ever wanted, that's a new feature (new entity + migration),
not a hardening task.

## Entity inventory

| Entity | Source | Owner | Created By | Mutable | Financial Criticality |
|---|---|---|---|---|---|
| `BillingConfig` | `schema.prisma:2414` | Finance/Admin (settings) | Seeded (`getConfig()` auto-creates a default row if none exists) | Yes — `autoIssueInvoices`, `notifyTenantOnIssue` | Low direct (config only), but drives invoice-issue behavior for every invoice |
| `BillingScheduleEntry` | `schema.prisma:1595` | System (derived from `Contract`) | `BillingScheduleService.buildScheduleForContract` (on contract activation, or manual rebuild) | Only while `invoiceId IS NULL` — an invoiced period is protected from being pruned/regenerated (verified in `buildScheduleForContract`'s upsert-skip-if-invoiced logic) | High — the source of truth for "what should be billed" |
| `Invoice` | `schema.prisma:2136` | Finance | `BillingScheduleService.generateDueInvoices` (scheduled/from schedule) or `BillingService.createInvoice`/`createInvoiceFromPending` (manual, from a pending receivable) | Lines/totals mutable only while `DRAFT`; `status` transitions via `issueInvoice`/payment recompute/`cancelInvoice` | Critical — the billed amount of record |
| `InvoiceLine` | `schema.prisma:2264` | Finance | Alongside `Invoice` creation, or `addInvoiceLine` while `DRAFT` | Only while parent `Invoice` is `DRAFT` | Critical — sums into `Invoice.subtotal` |
| `Payment` | `schema.prisma:2276` | Finance | `BillingService.recordPayment` | Append-only in practice — no direct field mutation found outside `reversedAt`/`reversedById`/`reversalReason` (soft-reversal, never hard-deleted or amount-edited) | Critical — the collected amount of record |
| `InvoiceAdjustment` | referenced in `billing.adjustment.spec.ts`, not yet in this map's schema excerpt | Finance | `BillingService` adjustment methods (credit note / adjustment) | Append-only (adjustments layer on top, don't rewrite `Invoice.totalAmount` directly — `adjustmentAmount` is a running total) | Critical — changes `adjustedTotal` in every outstanding-balance calculation |
| `ArDunningPolicy` | `schema.prisma:2233` | Finance/Admin (settings) | Admin-configured | Yes | Low direct — drives reminder cadence, not amounts |
| `ArDunningLog` | `schema.prisma:2251` | System | `ArDunningService.runDunning` (cron) | Append-only, `@@unique([invoiceId, policyId])` — one log row per invoice per policy level, prevents re-sending the same level twice | Low direct — audit trail for reminders sent |
| `SapIntegrationLog` | `schema.prisma:2300` | System | `SapService` on each push attempt | Append-only | Medium — the record `SapReconciliationRecord` reconciles against |
| `SapReconciliationRecord` | `schema.prisma:2421` | Finance/Admin | `SapReconciliationService.reconcilePending` | Append-only, `idempotencyKey @unique` | Medium — external-system agreement record, not itself authoritative for internal AR |
| `UnifiedDocument` (entityType `INVOICE`) | referenced in `files.controller.ts` | Finance | Invoice-document upload flow (not traced in this pass — out of scope, no correctness question raised about it) | N/A for this phase | Low-Medium — attached PDFs/receipts, not the financial record itself |

## Money rules — what's centralized, what isn't

- **Currency:** VND only, no multi-currency field found on `Invoice`/`Payment`. `Proposal.rentCurrency` exists (front-half, Phase 2) but doesn't propagate into a currency field on `Invoice`/`Payment` — not a bug (single-currency deployment), just noted as a constraint, not something to fix.
- **Precision/type:** every financial field (`Invoice.totalAmount`, `subtotal`, `vatAmount`, `adjustmentAmount`, `refundedAmount`, `Payment.amount`, `BillingScheduleEntry.rentAmount`/`camAmount`/`subtotal`) is Prisma `Float` (IEEE-754 double), not `Decimal`. **Not fixed in this phase** — VND has no fractional subunit in practice (amounts are whole numbers), which sidesteps the classic float-rounding-cents problem that would matter for a currency like USD. A `Float → Decimal` migration is a large, cross-cutting schema change with no correctness bug currently observed to justify it (`Math.max(0, ...)` guards are already used defensively at every outstanding-balance computation site) — flagged for awareness, not queued as backlog, per the phase's own "no migration unless truly needed" rule.
- **VAT/tax:** `Invoice.vatRate` (default 10%) × `subtotal` = `vatAmount`; `totalAmount = subtotal + vatAmount`. Centralized in `BillingService.recalculateTotals` (called before every issue) and `BillingScheduleService.generateDueInvoices` (at creation, same formula, both hardcode `vatRate = 10` at generation time even though `Invoice.vatRate` has a schema default of 10 — consistent today, but two separate hardcoded `10`s is a minor duplication, not a bug, not fixed here per "no blind cleanup").
- **Outstanding-balance formula — verified consistent but duplicated in 5 places**, not 1: `BillingService.recomputeInvoiceStatusFromPayments`/`financials()` (canonical), `ArDunningService.runDunningUnlocked`, `CollectionKpiService`, `PenaltyInterestService`, all independently compute `adjustedTotal = max(0, totalAmount + adjustmentAmount)`, `netPaid = max(0, sum(active payments) − refundedAmount)`, `outstanding = max(0, adjustedTotal − netPaid)`. **Verified mathematically identical across all four** (direct code comparison, not assumed) — this satisfies section 40's actual requirement (no two *different* answers for outstanding AR exist today), but the duplication is a real consistency *risk*: a future change to the formula in one place (e.g. adding a new deduction type) could silently diverge from the other three. Recorded as a **low-urgency refactor candidate** (extract to one shared pure function), not fixed in this pass — five call sites across four services is more surface area than justified without an actual observed divergence, and risks introducing a bug into currently-correct code for a purely preventive gain.
- **Rounding:** no explicit `Math.round`/`toFixed` found in the VAT/total calculation path — amounts stay as raw floats through storage and display (`toLocaleString('vi-VN')` formats for display only, doesn't round the stored value). Not flagged as a bug (VND has no subunit to round to), but worth knowing if a future non-VND currency is ever added.

## AR aging date basis — verified

`dueDate` is the consistent basis across every overdue/aging computation
checked: `recomputeInvoiceStatusFromPayments` (`invoice.dueDate < now →
OVERDUE`), the `invoice-overdue-mark` cron
(`notifications/contract-expiry.scheduler.ts:331`), and `ArDunningService`
(`daysOverdue(invoice.dueDate, asOf)`). No mixing of `issuedAt`/posting
date as the aging clock was found in any of these three. Not independently
re-verified inside `CollectionKpiService`'s aging-trend bucket logic beyond
the earlier grep — flagged as unverified rather than assumed identical.

## Background jobs (actual, not invented)

| Job | Schedule | File | Lock/Ledger |
|---|---|---|---|
| `monthly-billing-generate` | `0 6 1 * *` (06:00, 1st of month) | `billing-scheduler.ts` | `SchedulerLockService` + `JobExecution` ledger |
| `ar-dunning-check` | `0 10 * * *` (daily 10:00) | `ar-dunning.service.ts` | Same |
| `invoice-overdue-mark` | `0 9 * * *` (daily 09:00) | `notifications/contract-expiry.scheduler.ts` — lives outside the `billing` module, marks `OVERDUE` only; dunning owns the notification | Same |
| `email-delivery` | `*/15 * * * * *` (15s) | `email-delivery.service.ts` | Same |
| `transactional-outbox` | `*/10 * * * * *` (10s) | `outbox.service.ts` | Same |

No dedicated "AR aging" or "reconciliation" cron exists — aging is computed
on-demand (`CollectionKpiService`, `PenaltyInterestService`, both
read-only report queries, no cron decorator found on either), and SAP
reconciliation (`SapReconciliationService.reconcilePending`) has **no
scheduled trigger found anywhere in the codebase** (re-confirmed this
phase, matching Phase 2's "likely manual-only" flag) — it's invocable only
via whatever `sap.controller.ts` route exposes it. Not invented as a job
that doesn't exist.

## Gate

Domain map reflects actual code as of 2026-08-19. Proceed to
`04-BILLING-CONCURRENCY.md` and `04-BILLING-FAILURE-MATRIX.md` for the
transition-level analysis.
