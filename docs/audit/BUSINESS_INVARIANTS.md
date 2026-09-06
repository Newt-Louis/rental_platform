# BUSINESS INVARIANTS — Phase 3 draft

Formal statement of what the platform must never allow, with the enforcement
point actually found in code. Phase 4 will formalise and complete this; Phase 3
populates it with what execution tracing established.

Enforcement: **DB** = database constraint · **CHOKEPOINT** = one service all paths
funnel through · **PER-PATH** = each caller enforces it separately · **NONE**.

## Unit exclusivity

| ID | Invariant | Enforcement | Where | Status |
|---|---|---|---|---|
| UNIT-01 | A Unit has at most one live Contract | CHOKEPOINT + PER-PATH | `transition()` guard 5 blocks committed states without a live contract; both create paths re-check inside a Serializable txn | **HOLDS in the application** — still **APP_ENFORCED, not DB-enforced**; direct writes (the seed) bypassed it, see INT-002-SEED |
| **CONTRACT-PERIOD-01** | For a Unit and a turnover/billing period, at most one eligible Contract covers the complete period | PER-PATH | `resolveContractForPeriod` refuses to choose when >1 covers; seed overlap removed | **HOLDS** — INT-002-SEED fixed 2026-09-06 |
| **REVSHARE-01** | Revenue-share resolves exactly one Contract by turnover period before any financial calculation | CHOKEPOINT | `calculateRevenueShare` and `SalesService` currency validation share one resolver | **HOLDS** |
| **CONTRACT-PERIOD-02** | Historical applicability follows the Contract's effective date range, including an effective early termination — not current `Contract.status` | CHOKEPOINT | `effectiveContractEndDate` = `min(endDate, termination.effectiveDate)` for COMPLETED and pending terminations; CANCELLED shortens nothing | **HOLDS** — RS-TERMINATED fixed 2026-09-06 |
| **REVSHARE-02** | Every turnover row a revenue-share batch evaluates produces an observable outcome; none is silently discarded | CHOKEPOINT | one-entry-per-row `outcomes` ledger: INVOICE_CREATED · NO_AMOUNT_DUE · SKIPPED_WITH_REASON · REJECTED, with a count assertion logged on mismatch | **HOLDS** |
| UNIT-02 | A Unit has at most one ACTIVE booking | PER-PATH | booking create/cancel/reassign are Serializable | **HOLDS except queue reorder** — BOOK-001 |
| UNIT-03 | A Unit in a committed status (OCCUPIED/CONTRACTED/UNDER_FITOUT/LIQUIDATED) always has a live Contract | CHOKEPOINT | unit-status.service.ts:149-162 | **HOLDS** — unconditional, `force` cannot bypass |
| UNIT-04 | A Unit with a live Contract cannot be set VACANT/OFFERING/BOOKING/NEGOTIATING | CHOKEPOINT | unit-status.service.ts:112-127 | **HOLDS** |
| UNIT-05 | Unit status changes only through the state machine | CHOKEPOINT | `sanitizeUnitDto` throws on `status`; bulk update rejects it; no `force: true` in production | **HOLDS** (merge/split are the two audited exceptions) |
| UNIT-06 | A Unit cannot go VACANT → OCCUPIED | CHOKEPOINT | not in `ALLOWED_TRANSITIONS[VACANT]` | **HOLDS** |

## Governance

| ID | Invariant | Enforcement | Where | Status |
|---|---|---|---|---|
| GOV-01 | A Contract created from a Proposal requires that Proposal to be APPROVED | PER-PATH | proposals.service.ts:664-668 | **HOLDS on that path** |
| GOV-02 | A Contract's tenant and unit match its Proposal's | PER-PATH | derived server-side on convert | **HOLDS on convert; VIOLATED on direct create** — CONT-001 |
| GOV-03 | Every ACTIVE Contract passed an approval workflow | NONE | — | **VIOLATED** — INT-003 |
| GOV-04 | Contract financial terms cannot change after ACTIVE except by Amendment | PER-PATH | `CONTRACT_AMENDMENT_ONLY_FIELDS` rejected post-activation | **HOLDS** |
| GOV-05 | Fitout stage advance is sequential and gate-checked | CHOKEPOINT | `advanceStatus` — unknown stage rejected, `newIdx === currentIdx + 1`, gate requirements, override audited | **HOLDS** |
| GOV-06 | Business-rule configuration changes are validated and audited | NONE | `POST /fitouts/stage-configs` takes `@Body() body: any` | **WEAK** — FIT-002 |

## Financial

| ID | Invariant | Enforcement | Where | Status |
|---|---|---|---|---|
| FIN-01 | An ACTIVE Contract has a billing schedule | CHOKEPOINT | schedule build is inside the activation transaction | **HOLDS** |
| FIN-02 | A schedule cannot be built for a non-billable contract | CHOKEPOINT | ACTIVE/EXPIRING only | **HOLDS** |
| FIN-03 | Regeneration never alters an already-invoiced period | CHOKEPOINT | invoiced entries skipped on upsert and excluded from cleanup | **HOLDS** |
| FIN-04 | One invoice per (contract, period) for scheduled rent | DB | `BillingScheduleEntry.invoiceId @unique` + `@@unique([contractId, period])` | **HOLDS** |
| FIN-05 | Payment currency equals invoice currency | PER-PATH | explicit rejection, never coercion | **HOLDS** |
| FIN-06 / **PAY-02** | Sum of non-reversed committed Payments never exceeds the invoice payable amount | CHOKEPOINT | checked inside the serializable transaction, re-evaluated on every retry | **HOLDS** — BILL-001 fixed 2026-09-06 |
| **TX-03** | Every precondition approving a concurrent financial write is evaluated inside the same retryable Serializable transaction | CHOKEPOINT | `recordPayment` re-reads status, cancellation, currency and balance via `tx` | **HOLDS** |
| **PAY-03** | A single user payment intent creates at most one committed Payment | DB + PER-PATH | `Payment.idempotencyKey @unique` + hash check; both UIs send one key per intent via `usePaymentIntentKey` | **HOLDS** — PAY-001 fixed 2026-09-06 |
| PAY-04 | A new payment intent uses a new key, so a second genuine payment is never rejected as a replay | PER-PATH | key regenerates on dialog open and on invoice change | **HOLDS** |
| FIN-07 | An invoice is owned by a contract and a tenant | DB (partial) + DTO | `CreateInvoiceDto` requires both; internal paths derive both | **HOLDS** — no ownerless invoice is reachable |
| FIN-08 | An invoice carries its owning mall | PER-PATH | 4 of 6 create paths set it | **VIOLATED (weakly)** — INT-001; mall stays derivable via contract |
| FIN-09 / **MON-CUR-RS-02** | Revenue share is computed in a single currency | PER-PATH | asserted before the calculation; mismatch rejected, never converted | **HOLDS** — CUR-001 fixed 2026-09-06 |
| **MON-CUR-RS-01** | Every SalesTurnover amount has an explicit currency | DTO + PER-PATH | `currencyCode` required on every write path; validated against the Contract | **HOLDS** |
| **MON-CUR-RS-03** | No FX conversion without an explicit policy | PER-PATH | no conversion code exists; mismatch fails closed | **HOLDS** |
| **MON-CUR-RS-04** | The revenue-share Invoice carries the validated calculation currency | PER-PATH | `currencyCode` taken from the validated pair | **HOLDS** |
| FIN-10 | At most one LIVE revenue-share invoice per `(contractId, period)` | **DB + CHOKEPOINT** | partial unique index `Invoice_revenue_share_contract_period_live_key` (WHERE type=REVENUE_SHARE AND isActive AND status<>CANCELLED) + in-transaction existence check | **HOLDS** — BILL-002 fixed 2026-09-06 |
| **TX-04** | The decision that a revenue-share invoice may be created is evaluated inside the same retryable Serializable transaction that commits it | CHOKEPOINT | existence check moved into `runSerializableTransaction`; P2002 on the partial index resolves to ALREADY_BILLED | **HOLDS** |
| FIN-11 | Amounts leaving the platform carry their currency | CHOKEPOINT | `buildSapInvoicePayload` emits `currencyCode` from `Invoice.currencyCode`; missing or unsupported fails closed before any network call | **HOLDS** — SAP-001 fixed 2026-09-06 |
| FIN-18 | No financial document leaves the platform without a resolved owning mall | CHOKEPOINT | `resolveSapInvoiceContext`: `Invoice.mallId` else `Contract → Unit`; unresolvable or inconsistent fails closed | **HOLDS** |
| FIN-12 | `rentFree` has one unit platform-wide (RENTFREE-01) | CHOKEPOINT | `common/finance/rent-calculation.util.ts` — MONTHS | **HOLDS** — SEM-001 fixed |
| FIN-13 | Billing, valuation, approval and UI use that same unit (RENTFREE-02) | CHOKEPOINT | billing and valuation share `baseRentForMonthIndex`; cross-layer test asserts it | **HOLDS** |
| FIN-14 | No implicit days↔months conversion (RENTFREE-03) | PER-PATH | the only conversion is the explicit, logged legacy-rule shim | **HOLDS** |
| FIN-15 | Approval thresholds are in the canonical unit (RENTFREE-04) | PER-PATH | `RENT_FREE_MONTHS > 2`; `RENT_FREE_DAYS` not creatable | **HOLDS** |
| FIN-16 | One canonical totalContractValue (FIN-CALC-01) | CHOKEPOINT | `computeContractValue`; 3 duplicate formulas removed | **HOLDS** |
| FIN-17 | A field a UI did not render never becomes a contractual value silently | PER-PATH | shared conversion form renders every DTO field; business defaults visible and submitted explicitly | **HOLDS** for the conversion path |

## Lifecycle

| ID | Invariant | Enforcement | Where | Status |
|---|---|---|---|---|
| LIFE-01 | A Unit becomes OCCUPIED only after handover | PARTIAL | enforced on the fitout path via gate requirements; **not** on the manual path | **VIOLATED** — LIFE-001 |
| LIFE-02 | A Unit returns to VACANT only after move-out handover | CHOKEPOINT | `complete()` requires accessCardReturn + signageRemoved + keysReturned | **HOLDS** |
| LIFE-03 | Termination rollback restores the exact prior Unit status | CHOKEPOINT | `preTerminationUnitStatus` captured at initiate | **HOLDS** |
| LIFE-04 | Fitout status is always a configured stage code | CHOKEPOINT | all three write sites derive it server-side | **HOLDS** — FIT-001 refuted at the application layer |
| LIFE-05 | Tenant acceptance of premises is recorded | NONE | no such field exists | **NOT MODELLED** |

## Multi-mall (deferred to Phase 6)

| ID | Invariant | Phase 3 observation |
|---|---|---|
| MALL-01 | A user only reads data from malls they can access | `MallAccessGuard` + `@Scope`; MALL-001/SCOPE-001 still open |
| MALL-02 | An operation never spans two malls | bulk unit update and merge both reject multi-mall sets explicitly; `expectedMallId` enforced in `transition()` |
| MALL-03 | Every core entity resolves to exactly one mall | holds structurally; `Invoice.mallId = NULL` rows resolve via contract instead — INT-001 |
