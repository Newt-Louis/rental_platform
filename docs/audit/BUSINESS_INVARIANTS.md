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

## Reporting currency (audited 2026-09-06 — proposed, NOT yet enforced)

Established by `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md`. These are audit
findings, not implemented guarantees.

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| RPT-CUR-01 | Every monetary KPI exposed by Dashboard/Reports/Analytics carries explicit currency context | NONE | **VIOLATED** — 3 APIs, 14 UI sites |
| RPT-CUR-02 | Amounts in different currencies are never SUM/AVG together without an approved FX policy | PER-PATH | **VIOLATED** — `ai.service.ts:229` (SUM), `occupancy-analytics.service.ts:257` (AVG) |
| RPT-CUR-03 | Management APIs preserve the currency dimension through grouping and aggregation | NONE | **VIOLATED** — `/dashboard/cross-mall`, `/crm/pipeline/stats`, `/analytics/occupancy` |
| RPT-CUR-04 | Frontend presentation uses the currency supplied by the data source; never hardcodes VND for multi-currency data | NONE | **VIOLATED** — 4 of 14 sites sit over currency-less sources |
| RPT-CUR-05 | Monetary ranking across currencies requires explicit FX; without it results stay separated | NONE | **PARTIAL** — SalesPage turnover ranking |
| RPT-CUR-06 | A missing currency is never silently interpreted as VND | NONE | **VIOLATED** — `lib/currency.ts:26,43,56` default `'VND'` **and** `?? CURRENCIES.VND` |
| RPT-CUR-07 | A monetary chart series never mixes incompatible currencies | PER-PATH | **HOLDS today** via upstream VND-scoping; risk inherited from the aggregates |
| RPT-CUR-08 | A VND-scoped KPI must disclose that it is VND-scoped | NONE | **VIOLATED everywhere** — the systemic finding |

Positive findings worth protecting: `reports.service.ts:101-116` groups proposal
value by `(status, rentCurrency)`; `service-contracts.service.ts:277` groups by
`currency`; `billing.service.ts:850-869` keeps per-currency AR buckets. No code
anywhere attempts FX conversion — that restraint is correct and must be kept.

### Wave 1 status (2026-09-06) — partially enforced

The invariants above were audit findings. Wave 1 made three of them enforced on
a bounded surface: the Cross-Mall CEO screen and the three management APIs.

| ID | Status after Wave 1 |
|---|---|
| RPT-CUR-01 | **PARTIAL** — HOLDS for `/dashboard/cross-mall`, `/analytics/occupancy`, `/crm/pipeline/stats`. Still VIOLATED for the single-mall dashboard, reports, AI and compliance surfaces. |
| RPT-CUR-02 | **PARTIAL** — the `totalMonthlyBillingRevenue` SUM is fixed. `ai.service.ts:229` (SUM) and `occupancy-analytics.service.ts` `avgRentPerSqm` (AVG) still VIOLATE it; the AVG is deferred by decision, not by oversight, and is now flagged with `avgRentCurrencyMixed`. |
| RPT-CUR-03 | **HOLDS** for all three management APIs. Aggregation grouping now preserves currency end to end, including the cross-mall merge across malls. |
| RPT-CUR-04 | **PARTIAL** — the Cross-Mall CEO screen now renders the currency supplied by the source. Other screens unchanged. |
| RPT-CUR-06 | **VIOLATED still** — the shared formatters keep their `'VND'` default (out of scope). Mitigated locally: every Wave 1 call site passes the currency explicitly, so the default cannot fire on these screens. |
| RPT-CUR-08 | **PARTIAL** — a VND-scoped scalar now declares its scope via `revenueScalarCurrency` / `billingRevenueScalarCurrency` / `proposalValueCurrency` on the three fixed APIs. |

New enforced invariant introduced by Wave 1:

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-RPT-01** | A monetary field in a management API response either carries its currency, or explicitly declares that its currency is unknown or scoped — it is never left for the consumer to assume | PER-PATH + regression tests | **HOLDS** for `/dashboard/cross-mall`, `/analytics/occupancy`, `/crm/pipeline/stats` |

The "declares unknown" half matters: `pipelineValueCurrencyUnknown` (Lead) and
`revenueCurrencyUnknown` (SlotBooking) satisfy the invariant without inventing a
currency for data that genuinely has none. Removing either flag without first
adding the corresponding schema column re-violates MON-CUR-RPT-01.

Still true: no FX conversion exists anywhere in the platform.

### Wave 2 status (2026-09-06) — AI assistant financial context

| ID | Status after Wave 2 |
|---|---|
| RPT-CUR-01 | **PARTIAL** — additionally HOLDS for the AI assistant context: every monetary figure now carries its currency, declares its scope, or declares the currency unknown. |
| RPT-CUR-02 | **PARTIAL, one violation removed.** The confirmed cross-currency SUM in `ai.service.ts` is gone — turnover is grouped by `currencyCode` and growth is computed within a currency. The remaining violation is `avgRentPerSqm` (AVG), deferred by decision. |
| RPT-CUR-06 | **HOLDS for the AI path** — a NULL `SalesTurnover.currencyCode` becomes an explicit UNKNOWN bucket that the prose refuses to label, and is never read as VND. Still violated by the shared frontend formatters, which are out of scope. |
| RPT-CUR-08 | **PARTIAL** — the AI's VND-filtered AR block now declares its scope in the generated context. |

New invariants introduced by Wave 2:

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-AI-01** | Financial context handed to a language model is grouped by currency and never contains a total spanning currencies | PER-PATH + regression tests | **HOLDS** for `buildContext()` |
| **MON-CUR-AI-02** | A period-over-period change is computed only between two amounts in the same unit of account; when one side is absent, a semantic state is emitted rather than a fabricated percentage | PER-PATH | **HOLDS** |
| **MON-CUR-AI-03** | The generated context carries an explicit instruction that amounts in different currencies must not be summed, compared or converted | CHOKEPOINT | **HOLDS** — emitted whenever any monetary block ran, plus a matching line in `SYSTEM_PROMPT` |

MON-CUR-AI-02 covers the UNKNOWN bucket specifically: two unknown-currency sums
from different periods are not guaranteed to share a unit, so no percentage is
produced for them at all (`CURRENCY_UNKNOWN_NOT_COMPARABLE`).

Still true: no FX conversion exists anywhere in the platform, and the model is
never asked to perform one.

### Wave 3 status (2026-09-06) — Lead monetary currency model

| ID | Status after Wave 3 |
|---|---|
| MON-CUR-01 | **PARTIAL, improved** — `Lead` monetary fields now carry a currency. `Customer.budgetMin/Max`, `SlotBooking`, `SapReconciliationRecord` and `OccupancySnapshot.revenuePerSqm` still do not. |
| MON-CUR-04 | **HOLDS for `Lead`** — the new column has no `@default`, matching the `SalesTurnover` precedent. |
| RPT-CUR-01 | **PARTIAL** — additionally HOLDS for the CRM pipeline surfaces. |
| RPT-CUR-06 | **HOLDS for the Lead path** — a NULL `Lead.currencyCode` becomes an UNKNOWN bucket and renders as "chưa rõ ĐVT", never VND. |

New invariants introduced by Wave 3:

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-LEAD-01** | A Lead may not be persisted with a monetary amount and no unit of account | CHOKEPOINT (`assertLeadCurrency` on create and update) + DTO `@IsEnum(CurrencyCode)` | **HOLDS** for every production write path |
| **MON-CUR-LEAD-02** | A Lead currency is supplied explicitly; it is never inherited, defaulted or inferred | PER-PATH | **HOLDS** — no inheritance rule exists, because `Lead` has no mandatory monetary parent |
| **MON-CUR-LEAD-03** | CRM monetary aggregates are grouped by currency and never produce a total spanning currencies | PER-PATH + regression tests | **HOLDS** for `/crm/pipeline/stats` and the CRM UI |
| **MON-CUR-LEAD-04** | A monetary value copied out of a Lead carries its currency, or the destination is treated as currency-unknown | CHOKEPOINT | **VIOLATED** at `Customer.budgetMin` — see CUR-002-CUSTOMER. This is the one invariant this wave introduced and could not satisfy. |

MON-CUR-LEAD-02 is a deliberate non-implementation: the wave brief permitted
deterministic inheritance from "a proven business parent … mandatory and
stable", and no such parent exists on `Lead`. The reference data confirms it —
one lead links to an MMK Proposal and a VND UnitBooking at once.

Still true: no FX conversion exists anywhere in the platform.

### Wave 4 status (2026-09-06) — Customer budget currency

| ID | Status after Wave 4 |
|---|---|
| MON-CUR-01 | **PARTIAL, improved again** — `Customer.budgetMin/Max` now carry a currency. `SlotBooking`, `SapReconciliationRecord` and `OccupancySnapshot.revenuePerSqm` still do not. |
| MON-CUR-04 | **HOLDS for `Customer`** — no `@default` on the new column. |
| MON-CUR-LEAD-04 | **NOW HOLDS.** The one invariant Wave 3 introduced and could not satisfy: money copied out of a Lead carries its currency. |

New invariants introduced by Wave 4:

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-CUST-01** | A monetary value copied from Lead to Customer preserves its unit of account | CHOKEPOINT (`customerDataFromLead`) | **HOLDS** |
| **MON-CUR-CUST-02** | A Customer budget currency copied from a Lead equals the source Lead's currency; a mismatch fails closed and is never converted | CHOKEPOINT (`assertLeadCustomerCurrencyCompatible`, `CUSTOMER_CURRENCY_CONFLICT`) | **HOLDS** for `syncFromLead` |
| **MON-CUR-CUST-03** | A Customer with budget values never silently defaults to VND | CHOKEPOINT (`assertCustomerBudgetCurrency`) + DTO `@IsEnum(CurrencyCode)` | **HOLDS** for every production write path |
| **MON-CUR-CUST-04** | Customer monetary aggregates never combine currencies without FX | PER-PATH | **HOLDS vacuously** — no Customer budget aggregate exists in the product; `groupCustomerBudgetByCurrency` provides the safe shape so the next one cannot be written as a bare sum |
| **MON-CUR-SCORE-01** | A score derived from a monetary amount is computed only on a scale defined for that amount's currency | CHOKEPOINT (`scoreFinancialCapacity`) | **HOLDS** — VND only. The value returned for any other currency means "not evaluated", not "medium capacity"; a scale for USD/MMK is a pending business decision (CRM-SCORE-CUR-001), not an FX conversion |

MON-CUR-CUST-02 deliberately does **not** require `Customer.currencyCode` to
equal every related Proposal's currency. A customer's budget is its own monetary
context and may legitimately differ from what a specific deal was quoted in.

Still true: no FX conversion exists anywhere in the platform.

### Wave 5 status (2026-09-07) — UnitSlot / SlotBooking currency

| ID | Status after Wave 5 |
|---|---|
| MON-CUR-01 | **PARTIAL, improved again** — `UnitSlot` and `SlotBooking` now carry a currency. `SapReconciliationRecord`, `OccupancySnapshot.revenuePerSqm`, `ParkingShift` and inventory still do not. |
| MON-CUR-04 | **HOLDS for both new columns** — neither has a `@default`. |
| RPT-CUR-01 | **PARTIAL** — additionally HOLDS for the Dashboard SHORT card on `/dashboard` and `/dashboard/cross-mall`. |
| RPT-CUR-06 | **HOLDS for the slot path** — a NULL slot-booking currency becomes an explicit UNKNOWN bucket, never VND. |

New invariants introduced by Wave 5:

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-SLOT-01** | A SlotBooking persists the currency that governed its amount at booking time, and that snapshot is never re-derived from the slot | CHOKEPOINT (`createBooking` writes it with the amount; `updateSlotBooking` refuses a re-price that would change it, `SLOT_BOOKING_CURRENCY_CONFLICT`) | **HOLDS** |
| **MON-CUR-SLOT-02** | UnitSlot monetary pricing carries explicit currency context | CHOKEPOINT (`assertSlotPricingCurrency` on create and update) + DTO `@IsEnum(CurrencyCode)` | **HOLDS** |
| **MON-CUR-SLOT-03** | All operands in a SlotBooking amount calculation share one currency | PER-PATH, structural | **HOLDS** — `calculatePrice` has exactly one monetary operand; everything else (area, duration, multiplier, discount %) is dimensionless |
| **MON-CUR-SLOT-04** | Dashboard SHORT revenue aggregates by currency only | PER-PATH + regression tests | **HOLDS** for `/dashboard` and `/dashboard/cross-mall` |
| **MON-CUR-SLOT-05** | A SlotBooking to Invoice crossing preserves the booking currency | CHOKEPOINT (`createDueInvoiceFromSource`) | **HOLDS** — and refuses to invoice a booking with no currency |

MON-CUR-SLOT-03 is stated as *structural* deliberately: it holds because no
second monetary operand exists in the formula, not because a check enforces it.
Adding a tax, fee or deposit term to slot pricing would break it, and that is the
change to watch for.

There is deliberately **no** invariant requiring `UnitSlot.currencyCode` to equal
`Unit.currencyCode`. The codebase does not state that rule, so asserting it here
would be inventing one.

Still true: no FX conversion exists anywhere in the platform.

#### Wave 5 closure cleanup (2026-09-07)

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-SLOT-06** | A positive-value SlotBooking cannot enter a revenue-recognised or invoice-eligible state without an explicit currency | CHOKEPOINT (`confirmBooking`) | **HOLDS** — CONFIRMED is that boundary; the currency may be supplied during the transition so legacy rows are not stranded |

MON-CUR-SLOT-04 strengthened: Dashboard SHORT no longer emits a mixed-currency
scalar at all. `monthlyRevenue` is null unless exactly one known currency governs
the period, and the cross-mall `totals` merges per-currency buckets rather than
summing scalars across malls.

Zero-value exception, recorded deliberately: a SlotBooking with `totalAmount = 0`
may be confirmed with no currency. It recognises no revenue and can be invoiced
for no amount, so it has no unit of account to be missing.

MON-CUR-SLOT-03 now has a structure test guarding it. The invariant is not
enforced by a runtime check — it holds because `calculatePrice` has exactly one
monetary operand — so the test scans that method for money-shaped vocabulary and
fails when a second one appears.

### Wave 6 status (2026-09-07) — OccupancySnapshot monetary semantics

| ID | Status after Wave 6 |
|---|---|
| MON-CUR-01 | **PARTIAL, improved again** — `OccupancySnapshot.revenuePerSqm` now carries a currency. `SapReconciliationRecord`, `ParkingShift` and inventory still do not. |
| MON-CUR-04 | **HOLDS for the new column** — no `@default`. |
| MON-CUR-02 | Unchanged and never violated on this path: the snapshot's source aggregate has always been single-currency. |

New invariant introduced by Wave 6:

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **MON-CUR-OCC-01** | A historical monetary snapshot carries the unit of account that governed its calculation when the snapshot was created, and that unit is never re-derived from current configuration | CHOKEPOINT (writer records the same named constant its source is filtered to; the read path returns the persisted value verbatim) | **HOLDS** |

Promoted from candidate to proven because snapshot history genuinely exists:
`OccupancySnapshot` is a monthly series keyed by
`(mallId, floorId, category, leaseTermType, period)`, appended each period.

Two deliberate non-decisions recorded here so they are not mistaken for
oversights:

- **The VND scope was not widened.** The source query has always filtered to VND,
  which is why the arithmetic was safe. Making the KPI multi-currency changes its
  business meaning and is a business decision, not a remediation.
- **SHORT records no currency.** Its `revenuePerSqm` is 0 because SHORT revenue
  is not computed in this writer at all, not because it earned zero dong. A zero
  has no unit of account to claim.

Still true: no FX conversion exists anywhere in the platform.

#### Wave 6.1 (2026-09-07) — OCC-CRON-001

| ID | Invariant | Enforcement | Status |
|---|---|---|---|
| **OCC-SNAP-01** | At most one mall-level OccupancySnapshot exists per `(mallId, leaseTermType, period)` | **DB + CHOKEPOINT** | **HOLDS** — partial unique index `OccupancySnapshot_mall_scope_period_key WHERE floorId IS NULL AND category IS NULL`, plus an in-writer existence check whose P2002 branch adopts the winner of a race |
| **OCC-SNAP-02** | Re-running the monthly snapshot for a period rewrites its measures and never its identity | CHOKEPOINT | **HOLDS** — `update` is keyed by row id and carries measures only; `mallId`, `period` and `leaseTermType` are never in the update payload |

The `@@unique([mallId, floorId, category, leaseTermType, period])` declared on the
model does **not** enforce OCC-SNAP-01 and never did: Postgres treats NULLs as
DISTINCT, so mall-level rows (floorId and category both NULL) never collided.
That was demonstrated by dropping the partial index inside a rolled-back
transaction and successfully inserting a duplicate. The model-level unique is
retained because it does hold for a future per-floor or per-category snapshot,
where those columns are NOT NULL.

MON-CUR-OCC-01 was correct after Wave 6 but unreachable in practice, because the
writer could not persist anything. With OCC-SNAP-01 in place it is enforced on a
path that actually runs.
