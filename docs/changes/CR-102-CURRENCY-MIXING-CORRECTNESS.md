# CR-102 — Currency Mixing Correctness

Status: **PARTIALLY COMPLETED** (Defect A fixed and tested; Defect B blocked pending business confirmation — both outcomes were the correct, instructed response to what the evidence supported).

## Problem

Two confirmed financial-integrity defects, independent of any business-policy question for the first:

- **Defect A**: `BillingService.findAllInvoices()`'s `summary` object aggregated invoice `balance`/`totalAmount` across every matching invoice with no currency dimension — a Mall/Tenant/period whose invoices spanned VND/USD/MMK produced a `summary.totalOutstanding` (and related bucket totals) that silently blended incompatible currencies into one meaningless number.
- **Defect B**: `BillingService.calculateRevenueShare()` computes `shareAmount = sale.grossSales * pct% - contract.rent`, where `SalesTurnover.grossSales` has no currency field (implicitly VND) and `contract.rent` is denominated in `contract.currencyCode` (can be USD/MMK) — a genuine unit-mismatch when the precondition holds.

## Root cause

- Defect A: the `summaryRows` Prisma query never selected `currencyCode`, and the aggregation loop had no per-currency bucketing — a straightforward implementation gap, not a design decision.
- Defect B: `SalesTurnover` was never given a currency field (undocumented gap, not found in any prior multi-currency audit's scanned model list), and `revenueSharePercent` has no currency-conditional validation anywhere, so the dangerous precondition (a non-VND contract with revenue share enabled) is reachable with no code-level barrier — but whether it is *actually reached* in production could not be determined from code.

## Before / After

**Defect A — before**: `summary.totalOutstanding` etc. summed `balance`/`totalAmount` across all currencies in the filtered set.
**Defect A — after**: `summary.totalOutstanding`, `.draft`, `.current`, `.partial`, `.overdue`, `.paid`, `.bySource` are VND-only (same field names and shape as before — backward compatible), plus a new `summary.currency: 'VND'` marker and a new `summary.byCurrency: Record<string, BucketSet>` field carrying every currency's own independent totals, so non-VND amounts are visible rather than dropped or blended.

**Defect B — before/after**: unchanged. No fix was implemented. See "Blocker" below.

## Invariant

`INV-CUR-001`: without an explicit FX engine, `SUM(amounts)` is financially valid only when every amount belongs to the same currency. VND+USD, VND+MMK, USD+MMK, and VND+USD+MMK sums are all invalid. No FX conversion, locale inference, or Mall-config-based currency inference was introduced.

## Affected modules

Billing (backend service + controller, unchanged controller — no new endpoint), Billing frontend page. Sales/ServiceContracts were investigated but not modified (Defect B blocked; a separately-discovered ServiceContracts issue, see "Additional findings," was investigated but not modified — explicitly out of this CR's authorization).

## API behavior / compatibility

Fully backward compatible. `GET /billing/invoices`'s response shape is unchanged for every existing field; `summary.currency` and `summary.byCurrency` are new, additive fields. No consumer other than `BillingPage.tsx` was found to read this endpoint's `summary` (confirmed via a repository-wide grep for `findAllInvoices` — one controller call site, one test file, no exports/reports/AI/SAP consumer). No API Decision was required — the fix was implementable backward-compatibly, so `CR-102 API DECISION REQUIRED` was not triggered.

## Tests

**Backend** (`apps/backend`, `npx jest`): 70 suites / 385 tests passed (baseline: 70/375 — 10 net new, zero regressions).
**Frontend** (`apps/frontend`, `npx vitest run`): 28/29 files passed, 216/225 tests passed — identical to baseline (1 pre-existing, unrelated failure in `BookingsPage.test.tsx`, not touched by this CR).
**New**: 10 tests in `apps/backend/src/modules/billing/billing.receivables.spec.ts`, `describe('CR-102 -- findAllInvoices currency-safe summary')`: T01 (VND only) through T10 (empty dataset) — see Step 7/Test Matrix below.
**TypeScript**: `npx tsc --noEmit` clean on both backend and frontend.
**Build**: `npx vite build` clean.
**Lint**: `npx eslint` clean on both changed backend files (no frontend lint script configured in this repo).

### Test Matrix (Defect A)

| ID | Scenario | Result |
|---|---|---|
| T01 | VND only | PASS |
| T02 | USD only | PASS |
| T03 | MMK only | PASS |
| T04 | VND + USD | PASS |
| T05 | VND + MMK | PASS |
| T06 | USD + MMK | PASS |
| T07 | VND + USD + MMK | PASS |
| T08 | Mall A isolation | PASS |
| T09 | Mall B isolation | PASS |
| T10 | Empty dataset | PASS |

### Test Matrix (Defect B) — NOT EXECUTED, blocked

T11–T16 were not implemented because Defect B itself was not implemented (see "Blocker" below). No partial/speculative test was written against unimplemented behavior.

## Golden E2E

No live database/Redis environment was available in this session (`docker ps` failed to connect). None of the following were executed as true end-to-end scenarios against a running stack — reporting honestly per instruction rather than claiming PASS for something not run:

| Scenario | Result | Note |
|---|---|---|
| GS-04 Contract → Billing | NOT EXECUTED | Proxy coverage: `contract-activation.spec.ts`, `billing-schedule.service.spec.ts` pass as part of the full suite (unit/integration level, not a live E2E run) |
| GS-06 Invoice → Payment | NOT EXECUTED | Proxy coverage: `billing.invoice-issue.spec.ts`, `billing.payment-transaction.spec.ts` pass |
| GS-11 VND lifecycle | NOT EXECUTED | Proxy coverage: existing currency-propagation specs pass |
| GS-12 USD lifecycle | NOT EXECUTED | Same |
| GS-13 MMK lifecycle | NOT EXECUTED | Same |
| GS-14 Mixed-currency reporting | **PASS** (at the unit level) | This is the one scenario this CR directly and newly exercises — T04/T05/T06/T07 in `billing.receivables.spec.ts` are a service-level implementation of exactly this scenario. Not a full E2E run (no live DB), but genuinely executed and passing, unlike the others above which rely on pre-existing proxy coverage only. |

## Reconciliation

Read-only, per instruction (no auto-repair). No live-data reconciliation query was run (no DB available this session). The reconciliation guarantee is instead established structurally by the T04–T07 tests: they assert `summary.totalOutstanding` never equals the sum of two different currencies' amounts (e.g. T04 explicitly asserts the result is NOT the blended `1_000_100` figure the old code would have produced for a VND+USD mix). A live reconciliation check (comparing `findAllInvoices`'s summary against `getArAging`'s per-currency totals for the same filter) is recommended as a follow-up once a live environment is available, per `docs/system-truth/18-SYSTEM-INTEGRITY-CHECKS.md`.

## Adversarial review

Performed by an independent agent (not self-certified), instructed to try to break the fix. Full findings below, classified honestly including where the reviewer found something genuinely important:

- **Most significant finding (RELATED BUT DIFFERENT CR, not a break of CR-102's own logic)**: `ServiceContractsService.transferPaymentToBilling()` (a *different* code path than anything CR-102 touched) creates an `Invoice` without setting `currencyCode`, defaulting to VND — and the reviewer confirmed this is **not hypothetical**: `ServiceContractsPage.tsx` genuinely exposes a live USD/MMK currency selector on service contracts and payments. An invoice created this way will carry a *wrong* `currencyCode`, and CR-102's fix — which correctly buckets by whatever `currencyCode` is *stored* — has no way to detect that the stored value is itself incorrect. **This is not a failure of Defect A's fix** (the fix's own logic, verified by T01–T10, never blends across whatever currencies are present); it is a pre-existing, separate defect (already identified pre-CR-102 as `CONTRA-010`/`XMOD-010`, tracked under `CR-103`/`ADR-105`) that limits how much protection CR-102 provides *in practice* for this one specific upstream path. Recorded here as a **known limitation**, not fixed — fixing it means touching `ServiceContractsService`, explicitly outside this CR's authorization.
- Latent (currently inert) VND-scoping gap in `getPendingReceivables`'s `SHORT_TERM_BOOKING`/`PARKING` `bySource` sums — not currency-filtered, but both sources are structurally VND-only today (no currency field exists on their models), so no live mixing is possible yet. Becomes relevant only if `CR-103` adds currency fields to those models. Not fixed (different code path than Defect A, and fixing it now would be pre-emptive work against a CR-103 schema change that hasn't happened).
- `ArAgingTab` (a different tab/component in the same `BillingPage.tsx`, consuming a different endpoint, `GET /billing/ar-aging`) has some KPI cards that are VND-scoped without an explicit "(VND)" label. This is a **pre-existing cosmetic inconsistency**, not a currency-mixing defect (the underlying `getArAging()` data was already correctly currency-bucketed before this CR) and not something this CR's Defect A touches — noted, not fixed, to avoid scope creep into general UI labeling consistency.
- Confirmed: no other backend consumer reads `findAllInvoices`'s summary; the new tests don't exercise a `null`/malformed `currencyCode`, but the reviewer independently confirmed this is unreachable in practice (Postgres enum column, `NOT NULL` per migration) — the `?? 'VND'` fallback in the code is defensive-only and not exercisable via a real `Invoice` row.
- Confirmed: `calculateRevenueShare` (Defect B) is untouched and still has the defect described above.

## Known limitations

1. Defect B (revenue-share currency mixing) is **not fixed** — see "Blocker" below.
2. CR-102's fix guarantees correct bucketing of whatever currency is *stored* on an Invoice; it does not and cannot guarantee the stored currency is *itself* correct. The ServiceContracts transfer-path bug (see Adversarial Review) is a live, UI-reachable way for an Invoice to carry a wrong `currencyCode`, undetected by this fix. This is explicitly deferred to CR-103.
3. `ArAgingTab`'s and Excel export's currency labeling inconsistencies are pre-existing and not addressed.
4. No live E2E/reconciliation run was performed (no database available this session) — see Golden E2E and Reconciliation sections above.

## Blocker — Defect B

Per Step 4's explicit instruction, VND-only business semantics for `SalesTurnover`/revenue-share were investigated and **could not be proven**:
- `docs/program/MULTI_CURRENCY_COMPLETION.md:50-52` only documents that the *output* invoice's `currencyCode` is correctly set to `contract.currencyCode` — it does not address (and appears unaware of) the *input* `grossSales` figure's undeclared unit.
- No other document anywhere in `docs/` establishes Sales/revenue-share as intentionally VND-only.
- The Sales module (backend and frontend) has zero currency-related code, validation, or comments of any kind.
- `revenueSharePercent` (the field that enables this calculation) is not currently exposed in any frontend UI found (only referenced in the Proposal DTO/backend) — meaning it may be admin/API-only today, which neither proves nor disproves VND-only intent.
- Hard-coded VND formatting elsewhere in the Sales UI does not, per explicit instruction, constitute proof of business semantics.

**Returning: `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`** for Defect B. This does not block Defect A, which is complete. See `docs/architecture-review/07-BUSINESS-CONFIRMATION-TRIAGE.md` BC-004/BC-005 for the pending business questions that would unblock this.

## Deferred to CR-103

- Adding a currency field to `SalesTurnover` (would enable Defect B's fix once BC-004/BC-005 resolve).
- Adding currency fields to `ParkingMonthlyStatement`/`.Line`/`.DebtPayment` and `UnitSlot`/`SlotBooking`.
- Fixing `ServiceContractsService.transferPaymentToBilling()`'s missing `currencyCode` (the adversarial review's most significant finding).
- `getPendingReceivables`'s latent `SHORT_TERM_BOOKING`/`PARKING` scoping gap (becomes relevant once the above schema changes land).

## Rollback

Trivial — this CR's changes are additive/logic-only (new query field selection, new response fields, new UI labels), with no schema migration, no data migration, and no breaking change to any existing field. Reverting the 3 changed files (`billing.service.ts`, `billing.receivables.spec.ts`, `BillingPage.tsx`) to their pre-CR-102 state (i.e., their state as of `docs/changes/CR-102-BASELINE.md`) fully reverses this change with no data cleanup required.
