# ISSUE REGISTER — Leasing & Mall Operations Platform

Audit started 2026-09-05. Severity: P0 severe financial/data/security corruption
· P1 major process failure or integrity problem · P2 functional with workaround ·
P3 cosmetic.

Rule applied: **no P0/P1 without exact code evidence.** Items lacking verified
evidence are logged as UNVERIFIED and carry no severity until proven.

---

## CUR-001 — SalesTurnover has no currency; revenue-share invoice mixes scales

| Field | Value |
|---|---|
| ID | CUR-001 |
| Severity | **P1** |
| Domain | Finance / Billing |
| Backbone | 5 — Contract → Finance → SAP |
| Invariant violated | MON-CUR-01, MON-CUR-02 |
| Status | **FIXED 2026-09-06 — regression tests passing** |

**Resolution.** `SalesTurnover.currencyCode` added (nullable, **no default** —
a backfill was proven unsafe). Turnover must be reported in the Contract's
currency; a mismatch is rejected at entry *and* again at billing, never
converted. The revenue-share invoice carries the validated calculation currency,
and the hardcoded `VNĐ` in its notes, line description and the Sales UI is gone.
Rejections are returned to the caller (`rejected`, `rejectedCount`) instead of
being skipped silently, and one bad row no longer blocks the period's run.

Full detail, the write-path table and the data-risk classification:
`docs/audit/CURRENCY_AUDIT.md`.

**Production data.** Not mutated. Read-only classifier at
`prisma/scripts/sales-turnover-currency-reconciliation.sql`. Local dataset:
24 SAFE_TO_BACKFILL, 6 AMBIGUOUS, 0 already billed. Nothing auto-backfilled.

**Regression test.** `billing.revenue-share-currency.spec.ts` — 13 tests.
Verified to catch the defect: removing the currency guards makes a USD contract
fed VND-scale turnover emit a USD invoice again (5 tests fail).

**Invariants promoted to HOLDS:** MON-CUR-RS-01…04.

---

## RS-TERMINATED — Terminated contracts could not bill the periods they governed

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Finance / Contract execution |
| Status | **FIXED 2026-09-06 — regression tests passing** |
| Invariants | **CONTRACT-PERIOD-02**, **REVSHARE-02** |

**The gap.** The INT-002-SEED fix excluded `TERMINATING`/`TERMINATED` from
period resolution, on the correct reasoning that `Contract.endDate` is never
rewritten by a termination, so trusting it would over-claim coverage. But
excluding them entirely was also wrong: a contract terminated in September still
legally governed August's turnover.

**Termination lifecycle, as actually implemented.** `ContractTermination.status`
is a free-text column with exactly four values written by
`ContractTerminationService`:

| Status | Written by | Effect on the contract period |
|---|---|---|
| `INITIATED` | `initiate()` | pending — provisional end |
| `IN_PROGRESS` | `update()` (DTO restricts to INITIATED/IN_PROGRESS) | pending — provisional end |
| `COMPLETED` | `complete()`, gated on the handover checklist; sets Contract → TERMINATED, Unit → VACANT | **definitive end** |
| `CANCELLED` | `cancel()`, restores contract and unit status | **none** — original `endDate` applies |

There is **no** approved / withdrawn / rejected state in this platform.
`effectiveDate` is written once at `initiate()` and is not editable afterwards.

**Rule implemented.**
`effectiveContractEndDate = min(Contract.endDate, termination.effectiveDate)`
for COMPLETED **and** pending terminations; unchanged for CANCELLED, an
unrecognised status, or no termination. Pending terminations shorten
*provisionally* on purpose: a period ending on or before the planned date
belongs to the contract whichever way the termination resolves (cancelling only
ever extends coverage), while a period beyond it is genuinely undecidable and
must not be billed.

**Outcomes across a termination effective 15 Sep:**
August → billed · September → `AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED` ·
October → `NO_CONTRACT_FOR_TURNOVER_PERIOD`. **No daily proration is
introduced** — there is no approved business rule for allocating monthly
turnover across days, and a test asserts the failure carries no allocation.

**Termination is read through `Contract.termination`**, the authoritative
relation, never inferred by unit. Tenant consistency from REVSHARE-01 is
unchanged.

**REVSHARE-02 — batch observability.** `calculateRevenueShare` previously
`continue`d silently in four places (no contract, no revenue-share percentage,
share below base rent, already invoiced). It now records exactly one outcome per
examined row — `INVOICE_CREATED` / `NO_AMOUNT_DUE` / `SKIPPED_WITH_REASON` /
`REJECTED` — and logs an error if the ledger count ever diverges from the number
of rows examined. `rejected` remains an operator **action list** (genuine data
problems only); ordinary non-billing outcomes go to `skipped`. Both are always
present in `outcomes`.

**Regression tests.** `contract-termination-period.spec.ts` (19) covering all of
T1–T12, and `billing.revenue-share-outcomes.spec.ts` (12) proving the ledger
accounts for every row of a mixed batch exactly once and that Sales and Billing
resolve the same contract. Verified to catch the defect: making the resolver
ignore terminations fails 9 tests.

**Production data.** Not mutated. `contract-period-resolution-reconciliation.sql`
now reports termination status, effective date, derived effective end date and a
`TERMINATED_BEFORE_PERIOD` classification.

---

## INT-002-SEED — Two live contracts on one unit + non-deterministic contract resolution

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Leasing core / Finance |
| Status | **FIXED 2026-09-06 — regression tests passing, verified against a re-seeded DB** |
| Invariants | **CONTRACT-PERIOD-01**, **REVSHARE-01** |

**Two problems, one root.** The seed wrote overlapping live contracts, *and*
revenue-share resolved its contract with an unordered `findFirst` — so the
overlap turned into non-determinism rather than an error.

**Business rule implemented.** The applicable Contract for a turnover period is
the one whose effective dates cover the **entire** period. Dates decide
applicability; status only decides membership of the eligible set
(ACTIVE, EXPIRING, EXPIRED). Nothing is ordered and nothing is picked when 0 or
>1 match.

**Resolver.** `common/finance/contract-period-resolver.ts` —
`resolveContractForPeriod` over `contractPeriodCandidateWhere`. Both
`BillingService.calculateRevenueShare` and `SalesService`'s currency validation
go through it, so submission and billing can never resolve different contracts
for the same turnover row. Period boundaries come from the pre-existing
`periodBounds`, lifted to `common/finance/period.util.ts` so turnover and
billing share one definition (`billing-addin.util` re-exports it; its 41 tests
still pass unchanged).

**Failure modes, all fail closed with diagnostics** (unit, tenant, turnover,
period, matching contract ids/numbers/currencies/statuses/dates):
`NO_CONTRACT_FOR_TURNOVER_PERIOD` (skipped quietly — an uncontracted unit is
ordinary), `AMBIGUOUS_CONTRACT_FOR_TURNOVER_PERIOD`,
`AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED`, `CONTRACT_TENANT_MISMATCH`.

**Seed fixed properly**, not by reordering a query: contracts 10–14 used
`units[i % 10]`, putting them back on units 0–4 with overlapping periods. There
are 30 seeded units and only 10 were used, so each contract now takes its own
(`units[i]`). USD/MMK coverage on contracts 0/1 is retained.

**Verified against the live re-seeded database:**
- units with more than one live contract: **0**
- turnover currency distribution: 24 VND / 3 USD / 3 MMK
- `contract-period-resolution-reconciliation.sql`: **30 rows, all `OK`**
- `sales-turnover-currency-reconciliation.sql`: **30 rows, all `OK`**
  (was 24 SAFE_TO_BACKFILL + 6 AMBIGUOUS)

**Production data.** Not mutated. Two read-only scripts under
`prisma/scripts/` classify existing rows.

**Regression tests.** `contract-period-resolver.spec.ts` (20) covering all of
T1–T10, plus T12: reversing the candidate list must not change the outcome —
the direct guard against reintroducing "pick the first". Six integration tests
in `billing.revenue-share-currency.spec.ts` prove revenue-share refuses to bill
the ambiguous, split-period and tenant-mismatch cases and asserts
`prisma.contract.findFirst` is not even present on the mock.

**Original description, retained:**

`prisma/seed.ts` creates both `CTR-2026-0001` (USD, ACTIVE) and `CTR-2026-0011`
(VND, EXPIRING) on unit **GF-A01**, and the same pattern on **GF-A02**
(MMK + VND). `ContractsService.create()` rejects a second live contract per unit
(INT-002), but seeded rows bypass the service.

Consequence beyond the seed being unrealistic: `calculateRevenueShare` selects
the contract with an **unordered `findFirst`**, so for such a unit it is not
deterministic which currency and which rent the revenue share is computed
against. The CUR-001 guard makes this fail closed rather than mis-bill, and the
reconciliation script classifies those rows AMBIGUOUS rather than guessing — but
the underlying non-determinism in contract selection remains.

**Recommended next step.** Decide the business rule for "the contract in force
for a period" (most likely: the one whose date range covers the turnover period)
and make the lookup deterministic. Then fix the seed.

**Original CUR-001 defect description, retained:**

**Description.** `SalesTurnover.grossSales` / `netSales` are bare `Float` with no
currency column anywhere in that model or its parents. Percentage-rent
("revenue share") invoices compute
`shareAmount = grossSales × pct% − contract.rent`, subtracting a
`Contract.currencyCode`-denominated rent from a currency-less turnover figure.
For any non-VND contract the two operands are different units of account, so the
resulting invoice amount is arithmetically meaningless. The generated invoice is
nonetheless persisted with `currencyCode: contract.currencyCode`, giving a wrong
number a valid-looking currency label.

**Evidence.**
- `apps/backend/prisma/schema.prisma:2174-2195` — model `SalesTurnover`, fields
  `grossSales Float`, `netSales Float`; no currency field.
- `apps/backend/src/modules/billing/billing.service.ts:1522` —
  `const shareAmount = Math.max(0, sale.grossSales * (pct / 100) - contract.rent);`
- `apps/backend/src/modules/billing/billing.service.ts:1546` —
  `currencyCode: contract.currencyCode` on the created invoice.
- `apps/backend/src/modules/billing/billing.service.ts:1553,1557` — `notes` and
  line `description` hardcode `VNĐ` for `grossSales`.

**Business impact.** Percentage-rent billing for a foreign-currency tenant is
incorrect; the invoice is issued to the customer and flows to AR and SAP.
**Financial impact.** Direct — wrong billed amount.
**Data impact.** Persisted invoice + invoice line with wrong value.

**Recommended fix.** Business decision required, not a relabel: either (a) add
`currencyCode` to `SalesTurnover` and require turnover to be reported in the
contract currency (reject mismatch), or (b) define an explicit FX conversion
policy with rate + rate date + source. The platform has no FX engine
(`docs/program/MULTI_CURRENCY_ARCHITECTURE.md`), so (a) is the lower-risk path.

**Regression test required.** Yes — revenue-share generation for a USD contract
must not silently produce an invoice from a VND-scale turnover figure.

---

## CUR-002 — Monetary fields with no currency of their own

| Field | Value |
|---|---|
| ID | CUR-002 |
| Severity | **P1** (aggregate) |
| Domain | Cross-cutting |
| Backbone | 1, 4, 5 |
| Invariant violated | MON-CUR-01 |
| Status | **PARTIALLY FIXED** — `Lead` (Wave 3) and `Customer` (Wave 4) resolved; the rest still CONFIRMED |

**Description (original finding, retained for history).** Beyond CUR-001, these
models held monetary values with no currency column and no currency-bearing
parent: `Lead.expectedRent/estimatedValue`, `Customer.budgetMin/budgetMax`,
`UnitSlot.pricePerDaySqm/pricePerHour/pricePerSqmMonth`,
`SlotBooking.baseAmount/totalAmount`, `ParkingShift.cashRevenue/nonCashRevenue`,
`SapReconciliationRecord.ourAmount/sapAmount`,
`OccupancySnapshot.revenuePerSqm`, `InventoryItem.averageCost`,
`InventoryTransaction.unitCost`.

`Lead.expectedRent` is the entry point of Backbone 1; `SlotBooking` is an entire
short-term revenue stream; `SapReconciliationRecord` compares `ourAmount`
against `sapAmount` with no currency on either side.

**Current state per model — do NOT read the list above as today's status.**

| Model | Status |
|---|---|
| `Lead.expectedRent` / `estimatedValue` | **FIXED 2026-09-06 (Wave 3)** — `Lead.currencyCode` (nullable, no default), enforced on every write path, CRM aggregates grouped by currency, UNKNOWN never rendered as VND |
| `Customer.budgetMin` / `budgetMax` | **FIXED 2026-09-06 (Wave 4)** — `Customer.currencyCode` (nullable, no default), Lead→Customer copy carries the currency, `CUSTOMER_CURRENCY_CONFLICT` on a cross-currency sync |
| `UnitSlot.pricePerDaySqm` / `pricePerHour` / `pricePerSqmMonth` | **OPEN** |
| `SlotBooking.baseAmount` / `totalAmount` | **OPEN** — RPT-CUR-006; declared as `revenueCurrencyUnknown` on the Cross-Mall API since Wave 1, but the schema is unchanged |
| `SapReconciliationRecord.ourAmount` / `sapAmount` | **OPEN** — tracked as SAP-004 |
| `OccupancySnapshot.revenuePerSqm` | **OPEN** |
| `ParkingShift.cashRevenue` / `nonCashRevenue` | **OPEN** — parking module, outside the audited scope |
| `InventoryItem.averageCost`, `InventoryTransaction.unitCost` | **OPEN** — inventory module, excluded from this audit by instruction |

`Lead` and `Customer` are no longer currency-less and must not be described as
such. The aggregate issue stays open until the remaining models are resolved.

**Evidence.** `apps/backend/prisma/schema.prisma` — model definitions; full table
in `docs/audit/MODULE_INVENTORY.md` §9.

**Recommended fix.** Per model: add currency, or document and enforce a
single-currency constraint. Deferred to Phase 7 for per-model severity.

**Regression test required.** Yes, per model once policy is set.

---

## CUR-003 — Every currency column defaults to VND

| Field | Value |
|---|---|
| ID | CUR-003 |
| Severity | UNVERIFIED (candidate P2) |
| Domain | Cross-cutting |
| Invariant violated | MON-CUR-04 (candidate) |
| Status | CONFIRMED (schema) / impact UNVERIFIED |

**Description.** All seven chain columns plus `CategoryMallPricing` are declared
`@default(VND)`. Any insert path that omits the currency silently produces a VND
row rather than failing. This is the database-level form of the
`currencyCode ?? 'VND'` pattern the audit brief flags.

**Evidence.** `schema.prisma:203, 1239, 1441, 1605, 1665, 2219, 2348`.

**Next step.** Phase 7 — enumerate every create path for these models and check
whether currency is always supplied explicitly.

---

## MALL-001 — Optional `mallIds` filter can be bypassed by omission

| Field | Value |
|---|---|
| ID | MALL-001 |
| Severity | UNVERIFIED (candidate P0 if reachable) |
| Domain | Security / Multi-Mall |
| Backbone | all |
| Invariant | MALL-01, MALL-03 |
| Status | UNVERIFIED |

**Description.** Service-layer mall scoping is implemented as an **optional**
parameter, e.g. `routes(mallIds?: string[], q?: any)`. When the parameter is
`undefined` the `where.mallId` filter is not applied and the query returns rows
across all malls. Whether any controller path reaches these services without
computing `mallIds` is not yet established.

**Evidence.** `apps/backend/src/modules/patrol/patrol.service.ts:95`,
`apps/backend/src/modules/parking/parking.service.ts:52,391`.

**Explicitly NOT claimed.** `patrol` and `parking` controllers make zero
`mallAccess.*` calls, but this is *not* evidence of a leak — both scope at the
service layer. Counting only controller-level assertions would produce a false
positive.

**Next step.** Phase 6 — for every endpoint, trace whether `mallIds` is always
computed from the authenticated user before reaching the service.

---

## SCOPE-001 — Six endpoints self-declared as unenforced

| Field | Value |
|---|---|
| ID | SCOPE-001 |
| Severity | UNVERIFIED (candidate P0/P1) |
| Domain | Security / Multi-Mall |
| Status | CONFIRMED that the declaration exists; leakage UNVERIFIED |

**Description.** The code annotates 6 endpoints with
`EnforcementStatus.GAP` — the project's own record of unenforced mall scope —
across `announcements`, `sales`, `spaces`, `tickets` controllers. A further 9
carry `PENDING_BUSINESS_CONFIRMATION`.

**Evidence.** `grep -r "EnforcementStatus.GAP" apps/backend/src` → 6 hits in
4 controllers; 121 `ENFORCED`, 9 `PENDING_BUSINESS_CONFIRMATION`.

**Next step.** Phase 6 — reproduce each as an actual cross-mall read/write.

---

## CUR-004 — Parking→AR boundary discards an existing currency, forcing VND

| Field | Value |
|---|---|
| ID | CUR-004 |
| Severity | **P2** (P1 if a non-VND parking contract is reachable in the UI) |
| Domain | Finance / AR |
| Backbone | 5 — Contract → Finance → SAP |
| Invariant violated | MON-CUR-02, MON-CUR-04 |
| Status | CONFIRMED |

**Description.** The core pending-receivables funnel merges four sources into one
AR view. For the PARKING source it hardcodes `currencyCode: 'VND'` with the
comment *"ParkingCustomerContract currency is out of scope"* — but that model
**does** carry a currency column. A parking contract set to USD therefore enters
the core AR list labelled VND and is counted in the VND bucket of the AR summary,
overstating VND receivables.

The same funnel hardcodes VND for the SLOT source, but there the comment is
accurate — `SlotBooking`/`UnitSlot` genuinely have no currency field (CUR-002),
so that one cannot be fixed by relabelling.

**Evidence.**
- `apps/backend/src/modules/billing/billing.service.ts:340` —
  `currencyCode: 'VND' as CurrencyCode, // ParkingCustomerContract currency is out of scope`
- `apps/backend/prisma/schema.prisma` model `ParkingCustomerContract:17` —
  `currency String @default("VND")` — the field exists.
- `apps/backend/src/modules/billing/billing.service.ts:315` — the SLOT
  equivalent, where the "no currency field" justification does hold.
- Aggregation that consumes the mislabelled value:
  `billing.service.ts:850-869` — `byCurrency[row.currencyCode ?? 'VND']`.

**Mitigating context (verified, not assumed).** The surrounding billing code is
otherwise currency-disciplined and this is a narrow defect, not a systemic one:
- `billing.service.ts:379-380` — `vndOnly()` filter keeps non-VND rows out of the
  legacy single-currency summary.
- `billing.service.ts:850-869` — per-currency buckets; currencies are never
  summed together. Covered by tests `billing.receivables.spec.ts` T01–T04
  ("each currency totals independently, never summed together").
- `billing.service.ts:1154-1156` — cross-currency payment is explicitly rejected:
  *"Hệ thống chưa hỗ trợ thanh toán chuyển đổi ngoại tệ."*
- `billing.service.ts:918-926` — invoice currency is resolved **server-side** from
  the Contract, never taken from the caller.

**Fix.** One line; the helper already exists and is already used for exactly this
String→enum bridging at `:293` and `:468`:
`currencyCode: toCurrencyCode(row.contract.currency)`.

**Regression test required.** Yes — a USD parking contract must not land in the
VND AR bucket.

**Scope note.** In scope only via the direct-dependency exception (parking → core
AR). The rest of the parking module remains out of scope.

---

## OBS-001 — `createInvoice` fails closed on an unknown contractId (positive finding)

| Field | Value |
|---|---|
| ID | OBS-001 |
| Severity | none — recorded as verified-correct behaviour |
| Status | CONFIRMED |

Checked because the receivables funnel carries a `contractId` that, for PARKING
rows, is a `ParkingCustomerContract` id rather than a leasing `Contract` id — a
potential cross-domain id collision. `billing.service.ts:918-926` looks the id up
in `prisma.contract` and **throws** if it does not resolve, rather than creating a
mis-linked invoice. Fail-closed. No issue.

---

## LIFE-001 — Handover is not modelled; activation has no handover gate

| Field | Value |
|---|---|
| ID | LIFE-001 |
| Severity | UNVERIFIED (candidate P1) |
| Domain | Contract execution |
| Backbone | 3 — Contract → Fitout → Handover |
| Status | CONFIRMED (modelling) / enforcement UNVERIFIED |

**Description.** Handover exists only as nullable date attributes. There is no
`Handover` model, no handover state in `UnitStatus` or `ContractStatus`, and no
`FitoutStatus` enum. The unit lifecycle therefore admits
`UNDER_FITOUT → OCCUPIED` with no modelled precondition that a handover occurred,
was inspected, or was approved.

**Evidence.** `schema.prisma` — no `model *Handover*`; `UnitStatus` has 9 values,
none of them handover; only `Proposal.handoverDate:1443`, `:1861`,
`ContractTermination.handoverDate/handoverCondition:2982-2983`.
`UnitStatus.LIQUIDATED`'s comment relies on a handover gate that has no
corresponding state.

**Next step.** Phase 3 — determine whether `UnitStatusService.transition()`
enforces any handover precondition in code. If not, tenant activation can occur
without evidence of legitimate handover.

---

## FIT-001 — `FitoutProject.status` is unconstrained free text with a false FK comment

| Field | Value |
|---|---|
| ID | FIT-001 |
| Severity | UNVERIFIED (candidate P1 — write reachability not yet proven) |
| Domain | Contract execution / Fitout |
| Backbone | 3 — Contract → Fitout → Handover |
| Status | CONFIRMED (schema) / reachability UNVERIFIED |

**Description.** Every other core lifecycle status is a Prisma enum
(`ContractStatus`, `InvoiceStatus`, `ProposalStatus`, `BookingStatus`,
`UnitStatus`, `WorkflowStatus`, `StepStatus`). `FitoutProject.status` is
`String @default("CONTRACT_SIGNED")` with the inline comment
`// FK to FitoutStageConfig.code`. **There is no `@relation` on that field** —
the model's only relations are `contract`, `tenant`, `unit`, `operationManager`.
`FitoutStageConfig.code` is `@unique`, so an FK was possible; it was never
declared. There is also no CHECK constraint. The database will accept any string.

The comment asserting an FK that does not exist is itself the hazard: a reader
(or a future change) may assume referential safety that the schema does not
provide.

**Evidence.** `apps/backend/prisma/schema.prisma` — model `FitoutProject`,
`status String @default("CONTRACT_SIGNED") // FK to FitoutStageConfig.code`;
model `FitoutStageConfig`, `code String @unique`.

**Next step.** Phase 3 — determine whether any write path accepts a client-
supplied status string, and whether stage transitions are validated against
`FitoutStageConfig` at the service layer. Severity is deliberately withheld until
that is answered, per the schema-weakness rule.

---

## FIT-002 — Unit status transitions are driven by mutable configuration rows

| Field | Value |
|---|---|
| ID | FIT-002 |
| Severity | UNVERIFIED (candidate P1) |
| Domain | Contract execution / Governance |
| Status | CONFIRMED (schema) / impact UNVERIFIED |

**Description.** `FitoutStageConfig` carries `triggersUnitStatus String?`
("UnitStatus cần chuyển khi vào stage này") and `setsField String?`
("Field trên FitoutProject cần set now()"). The unit state machine is therefore
**data-driven and runtime-mutable**: editing a configuration row changes which
fitout stage moves a Unit to which status, and which timestamp field is stamped.

Both columns are unconstrained `String?` — `triggersUnitStatus` is not typed to
the `UnitStatus` enum, and `setsField` names a `FitoutProject` column by string.

This is a legitimate design (the fitout module was deliberately rebuilt as a
config-driven pipeline), so it is not a defect on its own. What it means for the
audit is that **the unit lifecycle cannot be established by reading code alone** —
the effective state machine lives in database rows. Phase 3 and Phase 8 must
account for that.

**Evidence.** `apps/backend/prisma/schema.prisma` — model `FitoutStageConfig`
fields `code`, `order`, `phaseGroup`, `roleColumn`, `meetingRequired`,
`triggersUnitStatus String?`, `setsField String?`, `isActive`.

**Next step.** Phase 3 — who can write `FitoutStageConfig` (RBAC), is the write
audited, and is `triggersUnitStatus` validated against the enum before use.

---

## INT-001 — Invoice ownership FKs are all nullable

| Field | Value |
|---|---|
| ID | INT-001 |
| Severity | UNVERIFIED (structural risk) |
| Domain | Finance |
| Backbone | 5 — Contract → Finance → SAP |
| Status | CONFIRMED (schema) / impact UNVERIFIED |

**Description.** `Invoice.contractId?`, `tenantId?`, `billingPartyId?` and
`mallId?` are **all four nullable**. The database permits an invoice owned by
nothing.

Partly intentional: the AR funnel issues invoices for sources with no leasing
Contract (short-term `SlotBooking`, parking statements, periodic charges), and
`billingPartyId` is an alternative counterparty to `tenantId`. Nullability is a
deliberate polymorphic-source design, not an oversight.

The consequence that matters for Phase 6 is that an `Invoice` with
`mallId = NULL` cannot be mall-filtered by its own column. The codebase already
recognises this and fail-closes in at least one place — `ai/ai.service.ts:203-207`
notes that an `{ in: mallIds }` filter "also correctly excludes any invoice with
no resolvable mallId at all, matching the fail-closed default." Whether every
other invoice query behaves the same way is unproven.

**Evidence.** `apps/backend/prisma/schema.prisma` model `Invoice`;
`apps/backend/src/modules/ai/ai.service.ts:203-207`.

**Next step.** Phase 6 — enumerate invoice read paths and confirm each either
filters on a non-null `mallId` or derives the mall through `contract → unit`.

---

## INT-002 — No DB uniqueness for "one active booking / one live contract per Unit"

| Field | Value |
|---|---|
| ID | INT-002 |
| Severity | UNVERIFIED (structural risk) |
| Domain | Leasing core |
| Backbone | 1, 2 |
| Status | CONFIRMED (schema) / app enforcement partly verified |

**Description.** The two most business-critical exclusivity rules in the leasing
core have **no database constraint**:
- at most one ACTIVE `UnitBooking` per `unitId` — `UnitBooking` has only
  `bookingNumber @unique`;
- no two live `Contract`s with overlapping periods per `unitId` — no unique or
  `EXCLUDE` constraint on `Contract.unitId`.

Both are defended in application code rather than by neglect. The booking queue
runs inside `runSerializable()` with P2034 retry
(`booking.service.ts:38-48,126`), which is a correct concurrency design under
Postgres Serializable isolation. The duplicate-contract-per-unit case was fixed
previously in the booking→proposal pipeline work and is expected to have a guard,
but that guard has not yet been re-verified in this audit.

Recorded so that the audit does not later mistake app-level enforcement for
absence of enforcement, and so that any future code path that bypasses
`runSerializable()` is recognised as removing the only protection that exists.

**Evidence.** `apps/backend/prisma/schema.prisma` models `UnitBooking`,
`Contract`; `apps/backend/src/modules/booking/booking.service.ts:38-48,126`.

**Next step.** Phase 3 — confirm every booking/contract create path goes through
the serializable wrapper and the per-unit live-contract guard.

---

## INT-003 — `Contract.proposalId` nullable → a Contract can exist with no approval linkage

| Field | Value |
|---|---|
| ID | INT-003 |
| Severity | UNVERIFIED (candidate P1 — high business relevance) |
| Domain | Governance / Contract execution |
| Backbone | 2 — Proposal → Approval → Contract |
| Status | CONFIRMED (schema) / reachability UNVERIFIED |

**Description.** `Contract.tenantId` and `Contract.unitId` are NOT NULL — so an
ACTIVE contract without a tenant or a unit is genuinely DB-prevented, a real
strength. But `Contract.proposalId` is nullable, and `ApprovalWorkflow` attaches
to the **Proposal** (`ApprovalWorkflow.proposalId`), not to the Contract.

Therefore a Contract created without a Proposal has, structurally, no approval
record at all — the discount-routing workflow (≤5% Leasing Manager / 5–10% Mall
Director / >10% CEO) has nothing to hang from. The schema also does not tie
`Contract.tenantId`/`unitId` to the Proposal's tenant/unit when a proposal *is*
present, so a Contract may reference a different tenant or unit than the one that
was approved.

This is the highest-value Phase 3 question in the governance backbone.

**Evidence.** `apps/backend/prisma/schema.prisma` models `Contract`
(`proposalId String? @unique`), `ApprovalWorkflow` (`proposalId String? @unique`).

**Next step.** Phase 3/9 — does `ContractsService.create()` permit a contract with
no proposal, who can call it, and is the approved proposal's tenant/unit
re-validated against the contract being created.

---

## LIFE-001 addendum (Phase 2) — "Tenant accepted premises" has no representation

Phase 2 resolved the structural half of LIFE-001. Of the five entry-handover
states, the schema can distinguish:

| State | Representation | Distinguishable |
|---|---|---|
| Fitout work completed | a value of free-text `FitoutProject.status` | by convention only |
| Fitout approved | `FitoutSubmittal`, `FitoutDocument`, `FitoutDocumentStatus` enum, `ApprovalWorkflow` entityType FITOUT_SUBMITTAL | **yes** |
| Physical handover completed | `FitoutProject.handoverDate DateTime?` — date only, no actor, no evidence link | weakly |
| **Tenant accepted premises** | **none** | **NO** |
| Unit became occupied | `UnitStatus.OCCUPIED` + `FitoutProject.actualOpenDate?` | yes |

A global schema search found **no** `acceptanceDate`, `acceptedAt`, `acceptedBy`,
`inspectionDate` or `tenantAccepted*` field anywhere. Tenant acceptance of the
premises is not modelled at all.

Note the asymmetry: `ContractTermination.handoverDate` + `handoverCondition`
(`schema.prisma:2982-2983`) model the **move-out** handover with a condition
record — the schema models handover on exit more richly than handover on entry.

Enforcement (whether activation is gated in code) remains Phase 3.

---

---

## SEM-001 — `rentFree` unit split between billing and approval

| Field | Value |
|---|---|
| ID | SEM-001 |
| Severity | **P1** |
| Domain | Finance / Governance |
| Backbone | 2, 5 |
| Status | **FIXED — cross-layer regression test passing** (2026-09-06) |

**Description.** `Proposal.rentFree` / `Contract.rentFree` is a single `Int`
column that was read as **months** by billing and as **days** by approval
routing, with three mutually inconsistent `totalContractValue` formulas layered
on top.

**Evidence (pre-fix).**
- `billing-schedule.util.ts:120` — `monthIdx < contract.rentFree` → MONTHS.
- `approval-policy.util.ts:47` + `seed.ts:251` — `RENT_FREE_DAYS > 60` → DAYS.
- `create-booking.dto.ts` — `'Số ngày miễn phí thuê'` → DAYS.
- `vi/spaces.json:265` "Rent-free (tháng)" vs `vi/bookings.json:341`
  "Rent-free (ngày)" — the two conversion dialogs labelled the same field with
  different units.
- `ProposalsPage.tsx:590` — label key `freeRentMonths` rendered with the `days`
  suffix on the same line.

**Business impact.** The seeded rule *"Mall Director on rent free > 60 days"*
compared a month-denominated value against 60, so it **could never fire**: the
Mall Director escalation for long rent-free periods was dead, and a Leasing
Executive could grant an unlimited rent-free concession with no escalation.
Separately, `prisma/seed.ts` planted `rentFree: 30`, which billing reads as a
30-month concession on a 36-month lease.

**Resolution.** Canonical unit is MONTHS. One calculator
(`common/finance/rent-calculation.util.ts`) now serves proposal valuation and
billing schedule through a shared per-month primitive. `RENT_FREE_MONTHS > 2`
replaces the dead rule; persisted `RENT_FREE_DAYS` rows still evaluate through a
logged deprecation shim rather than being silently dropped. Full detail and the
field parity matrix in `docs/audit/RENT_FREE_DATA_RISK.md`.

**Production data.** Not mutated. Read-only reconciliation script at
`apps/backend/prisma/scripts/rent-free-reconciliation.sql`; non-zero `rentFree`
rows require business review before rollout.

**Regression test.** `rent-calculation.util.spec.ts` →
*"SEM-001 CROSS-LAYER: one value, one unit, four layers"*. Proves valuation,
approval routing, contract and billing schedule all read one value as months.
Would have failed at the approval layer before the fix.

---

# PHASE 3 RESULTS

## Matrix E — STRUCTURAL FINDING RESOLUTION

| Issue | Phase 2 status | Phase 3 result | Reachable | Severity |
|---|---|---|---|---|
| INT-001 | nullable Invoice ownership FKs | **PARTIALLY CONFIRMED** — no ownerless invoice reachable (DTO requires contract+tenant); 2 paths persist `mallId = NULL` | yes, `mallId` half | **P2** |
| INT-002 | no DB exclusivity for booking/contract per Unit | **APP_ENFORCED** for contracts (both paths, Serializable, double-checked); **partially violated** for bookings via queue reorder | reorder path only | see BOOK-001 |
| INT-003 | Contract without Proposal → no approval linkage | **CONFIRMED_REACHABLE** — executable 3-call path, no UI | API only | **P1** |
| FIT-001 | `FitoutProject.status` unconstrained String | **SERVICE_BLOCKED / STRICTLY_VALIDATED** — all 3 write sites derive it server-side from active stage config | no | **P3** (misleading comment only) |
| FIT-002 | stage config drives the Unit state machine | **INTENTIONAL_DESIGN with a validation gap** — ADMIN-only, fails closed, but unvalidated, unaudited, global | yes (ADMIN) | **P2** |
| LIFE-001 | handover not modelled | **CONFIRMED_REACHABLE** — manual status route reaches OCCUPIED with no handover evidence | yes, via UI | **P1** |

---

## INT-003 — CONFIRMED: an ACTIVE Contract can be created with no approval

| Field | Value |
|---|---|
| Severity | **P1** |
| Domain | Governance |
| Backbone | 2 — Proposal → Approval → Contract |
| Status | **CONFIRMED_REACHABLE** (API only — no UI path) |

**Executable path.** Three calls, all available to a single `LEASING_MANAGER`
(also ADMIN, MALL_DIRECTOR):

1. `PATCH /api/spaces/units/:id/status` `{"status":"NEGOTIATING"}`
   — `@Roles(...MODULE_ROLES.spacesManage)` = ADMIN, MALL_DIRECTOR, LEASING_MANAGER.
   `VACANT → NEGOTIATING` is allowed (unit-status.service.ts:14).
2. `POST /api/contracts` `{tenantId, unitId, startDate, endDate, term, rent, deposit}`
   — `@Roles(...CONTRACT_EDIT_ROLES)` = ADMIN, LEASING_MANAGER, MALL_DIRECTOR, LEGAL
   (contracts.controller.ts:21,153). `CreateContractDto.proposalId` is
   `@IsOptional()`. `NEGOTIATING → CONTRACTED` is allowed.
   `ContractsService.create` checks the unit exists, the transition is legal, and
   no live contract exists — **it never checks for a Proposal or an approval**.
3. `PATCH /api/contracts/:id/status` `{"status":"ACTIVE"}`
   — `@Roles(...CONTRACT_STATUS_ROLES)` = ADMIN, LEASING_MANAGER, MALL_DIRECTOR.
   `getActivationReadiness` (contracts.service.ts:78-116) checks tenant/unit are
   active, the unit is CONTRACTED, dates are ordered and amounts non-negative.
   **No approval check exists in it.**

Result: an ACTIVE Contract, with a billing schedule generated, and no
`ApprovalWorkflow` anywhere — `ApprovalWorkflow` attaches to `Proposal`, and there
is no proposal.

**Business impact.** The platform's central governance control is the
discount-based approval routing (≤5% Leasing Manager, 5–10% Mall Director, >10%
or rent-free >60 days CEO, with Finance and Legal always added). A LEASING_MANAGER
executing this path signs a contract at any rent, any deposit, any rent-free
period, with no Mall Director, CEO, Finance or Legal involvement, and the contract
proceeds to billing normally. This is not a data-integrity bug; it is a complete
bypass of the approval matrix by the role the matrix exists to constrain.

**Reachability qualification (required by §21).** `contractsApi.createContract`
exists in `apps/frontend/src/api/contracts.ts:7` but **no page calls it** — the UI's
only contract-creation action is Proposal → Convert. The endpoint is reachable
via direct API call and via Swagger (mounted whenever `NODE_ENV !== production` or
`SWAGGER_ENABLED=true`). It is not reachable by clicking through the app.

**Evidence that this is deliberate functionality, not an oversight.**
`contract-currency-propagation.spec.ts:91` — *"uses the client-supplied
currencyCode for a direct contract with no proposalId"* — an existing test
asserts the direct path's behaviour. The path is intended; what is missing is any
governance on it.

**Recommended fix (not applied).** Business decision first: if direct contracts
are legitimate (data migration, legacy paper contracts), they need their own
authorization — a dedicated role or an explicit `ApprovalWorkflow` created for the
Contract entity. If they are not, `proposalId` should become required.

**Regression test required.** Yes — activating a contract with no approved
proposal must be rejected, or must be provably restricted to an authorised role.

---

## CONT-001 — Direct-create accepts a client `proposalId` with no consistency check

| Field | Value |
|---|---|
| Severity | **P1** |
| Domain | Governance / Data integrity |
| Status | **CONFIRMED — REACHABLE_MISMATCH** (API only) |

**Description.** `ContractsService.create()` accepts `proposalId`, `tenantId` and
`unitId` as three independent client-supplied values. It uses the proposal for
exactly one thing — reading `rentCurrency` (contracts.service.ts:266-278) — and:

- does **not** check `proposal.unitId === dto.unitId`;
- does **not** check `proposal.tenantId === dto.tenantId`;
- does **not** check `proposal.status === APPROVED`;
- silently ignores the proposal if the id does not resolve (`if (proposal)`).

A caller can therefore attach an approved Proposal for Unit A / Tenant A to a
Contract for Unit B / Tenant B, with entirely different rent and deposit. The
contract then displays and reports as originating from an approved proposal —
`ContractsService.findOne` includes the proposal and its lead/booking chain, and
the UI renders that linkage.

This is the more serious face of INT-003: not merely "a contract with no
approval", but **a contract that appears approved and is not**. It launders an
unapproved deal through a legitimate approval record.

Contrast with the correct path: `createContractFromProposal` derives `tenantId`
and `unitId` *from* the proposal (proposals.service.ts:707-708) and refuses any
proposal that is not APPROVED (:664-668).

**Constraint that limits blast radius.** `Contract.proposalId @unique` means a
proposal already converted cannot be reused — the target must be an approved but
not-yet-converted proposal.

**Recommended fix (not applied).** In `ContractsService.create`, when `proposalId`
is present: require `proposal.status === APPROVED`, and either derive
`tenantId`/`unitId` from the proposal or reject a mismatch — the same rule the
convert path already applies.

**Regression test required.** Yes.

---

## LIFE-001 — CONFIRMED: a Unit reaches OCCUPIED with no handover evidence

| Field | Value |
|---|---|
| Severity | **P1** (upgraded from UNVERIFIED) |
| Domain | Contract execution |
| Backbone | 3 — Contract → Fitout → Handover |
| Status | **CONFIRMED_REACHABLE**, UI-reachable |

**Description.** Two paths set `UnitStatus.OCCUPIED`.

The *fitout* path is properly gated: role OPERATION/MALL_DIRECTOR/ADMIN, contract
must be ACTIVE or EXPIRING, strictly the next configured stage, and
`checkGateRequirements()` must pass — with override restricted to
ADMIN/MALL_DIRECTOR, a mandatory written reason, and an AuditLog entry
(fitout.service.ts:197-300). No complaint about that path.

The *manual* path has no such gate. `PATCH /api/spaces/units/:id/status`
`{"status":"OCCUPIED"}`, roles ADMIN / MALL_DIRECTOR / LEASING_MANAGER
(spaces.controller.ts:344-351 → spaces.service.ts:571-583). `updateUnitStatus`
blocks exactly one target — LIQUIDATED — and passes everything else to
`transition()`, whose only relevant check is that a live Contract exists.

`CONTRACTED → OCCUPIED` is an allowed transition (unit-status.service.ts:22).
So a Unit can be marked occupied with:

- no `FitoutProject` at all,
- no `handoverDate`,
- no fitout gate requirements met,
- no inspection,
- no tenant acceptance (which, per Phase 2, has no field to record it in).

**Business impact.** Occupancy is the trigger for operational billing readiness,
occupancy reporting and revenue recognition inputs. A unit can be reported as
occupied and generating rent before the tenant has taken possession, with no
record of who decided that or on what evidence beyond a `UnitHistory` row reading
"Manual status update".

**The asymmetry that makes this a defect rather than a design choice.** The same
codebase enforces the move-**out** handover rigorously:
`ContractTerminationService.complete()` (contract-termination.service.ts:145-149)
refuses to release the unit unless `accessCardReturn`, `signageRemoved` and
`keysReturned` are all true. The platform has a handover checklist concept; it
simply is not applied on the way in.

**Recommended fix (not applied).** Either gate the manual OCCUPIED transition on
fitout completion evidence, or restrict manual OCCUPIED to a break-glass role with
a mandatory reason and audit entry — mirroring the fitout override pattern that
already exists in this codebase.

**Regression test required.** Yes — CONTRACTED → OCCUPIED via the manual route
without fitout evidence must be rejected or must be provably break-glass.

---

## BILL-001 — Concurrent payments can overpay an invoice

| Field | Value |
|---|---|
| Severity | **P1** |
| Domain | Finance |
| Backbone | 5 |
| Status | **FIXED 2026-09-06 — concurrent regression test passing** |

**Resolution.** The balance decision moved inside `runSerializableTransaction`.
`recordPayment` now re-reads the invoice and its non-reversed payments through
`tx` and re-evaluates cancellation, payable status, currency and balance on
**every** attempt, so a P2034 retry re-decides rather than blindly re-inserting.
Only the TENANT authorization lookup remains outside the transaction.

- Rejection carries `code: PAYMENT_EXCEEDS_REMAINING_BALANCE` with `invoiceId`,
  `attemptedAmount`, `remainingBalance`.
- Retry-budget exhaustion surfaces as `PAYMENT_CONCURRENT_MODIFICATION` instead
  of a raw Prisma `P2034`, and increments
  `payment_serialization_exhausted_total`.
- Reversal semantics unchanged and verified: `financials` excludes reversed
  payments, so a reversal frees the balance.

**Regression test.** `billing.payment-concurrency.spec.ts` — 18 tests including
60+60 → one succeeds, 40+60 → both succeed totalling exactly 100, 100+1 → only
100 succeeds, idempotent replay, different keys still bound by the balance, and
the P2034 retry re-evaluating the balance. Verified to fail against the pre-fix
code (two 60-payments committed against a 100 invoice).

**Invariants promoted to HOLDS:** PAY-02, TX-03.

---

## PAY-001 — Payment idempotency key was not scoped to a payment intent

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Finance |
| Status | **FIXED 2026-09-06 — duplicate-intent regression test passing** |
| Invariant | **PAY-03** — a single user payment intent must not create more than one committed Payment |

**Two distinct defects, both closed.**

**(a) Tenant Portal sent no key at all.** `TenantPortalPage` called
`billingApi.recordPayment(invoice.id, data)` with no third argument, and the
backend does not generate one — `idempotencyKey` is optional and its unique
constraint only binds when a key is present. A tenant double-clicking created
two Payment rows for a single intent. BILL-001 blocks the *overpayment* form of
this, but two partial payments that each fit the remaining balance would both
commit.

**(b) `useState(() => randomUUID())` is per-MOUNT, not per-intent.** This
correction supersedes the earlier claim that `BillingPage` was already safe —
it was not. Both dialogs are rendered *unconditionally* by their parent
(`TenantPortalPage` returns `null` when idle; `BillingPage` takes an `open`
prop), so neither ever unmounts and the `useState` initialiser ran **once per
page load**. One key served every payment in the session.

That is worse than a missing key: after paying one invoice, the next payment
sent the same key, the backend saw `existing.invoiceId !== invoiceId` and
returned *"Idempotency key was already used with a different payment payload"*.
A finance user could not record a second payment without reloading the page.

**Fix.** `apps/frontend/src/hooks/usePaymentIntentKey.ts` — one key per payment
intent, regenerated when the dialog opens or when the invoice changes while
open, and stable across re-renders, retries and in-flight state. Both call sites
now use it. Backend idempotency semantics unchanged.

`disabled={mutation.isPending}` is retained on both submit buttons as a UX
guard only; correctness rests on the key.

**Regression tests.** `usePaymentIntentKey.test.tsx` (6) and
`TenantPortalPayment.test.tsx` (6). Verified to catch the defect: stubbing the
hook back to naive per-mount behaviour fails 6 tests, including
*"paying two invoices in one page session does not reuse a key"*.

Backend side already covered: same key + same payload → one Payment
(`billing.payment-concurrency.spec.ts` T4, `billing.payment-transaction.spec.ts`);
same key + different payload → `ConflictException`.

**Original defect description, retained:**

**Description.** `BillingService.recordPayment` computes the invoice balance and
rejects `dto.amount > balance` **before** entering its Serializable transaction
(billing.service.ts:1159-1161). `runSerializableTransaction` (:703-721) retries
only the callback, which creates the payment and recomputes the invoice status.
The balance check is never re-evaluated.

Two concurrent payments, each individually within the balance, both pass the
pre-check. The second loses the write-write conflict on the invoice row, is
retried, and commits. `sum(payments) > totalAmount`; the invoice is marked PAID
because `recomputeInvoiceStatusFromPayments` tests `totalPaid >= adjustedTotal`
(:1254). The surplus is recorded but not flagged.

**Partial existing mitigation.** `idempotencyKey` is `@unique` and hash-verified,
so *identical repeated* payloads are safe. It does not cover two different
concurrent payments. `BillingPage.tsx:116` supplies a key;
`TenantPortalPage.tsx:439` calls `recordPayment(invoice.id, data)` with none.

**Recommended fix (not applied).** Move the balance read and the over-payment
check inside the transaction callback so the retry re-evaluates them.

**Regression test required.** Yes. `billing.payment-transaction.spec.ts` exists
but does not cover the concurrent-overpay case.

---

## BOOK-001 — Queue reorder is not atomic and can break booking exclusivity

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Leasing core |
| Status | **CONFIRMED** |

**Description.** `BookingService.updatePriority` (booking.service.ts:804-845)
commits the priority shuffle in a default-isolation `$transaction`, then calls
`syncQueueStatus` (:1291-1308) **outside any transaction**, which issues one
un-wrapped `unitBooking.update` per row needing correction.

Two failure modes:

1. **No concurrency needed** — if `syncQueueStatus` fails after the priority
   transaction commits, the queue order and the ACTIVE/PENDING statuses
   permanently disagree. Nothing re-runs the sync.
2. **Concurrency** — two simultaneous reorders on one unit are not serialized and
   can each promote a different booking, leaving two ACTIVE bookings on the same
   Unit.

Every other booking mutation in the service is Serializable via `runSerializable`
(create :126, reassign :583, cancel :876/:942, expiry :1128). This one method is
the exception, and it is the one that rewrites the queue.

**Recommended fix (not applied).** Run the shuffle and `syncQueueStatus` inside a
single `runSerializable` call, as the sibling methods do.

**Regression test required.** Yes.

---

## SAP-001 — No currency is transmitted to SAP

| Field | Value |
|---|---|
| Severity | **P1** |
| Domain | Finance / SAP |
| Backbone | 5 |
| Status | **FIXED 2026-09-06 — regression tests passing** |
| Invariants | **FIN-11**, **FIN-18** |

**Resolution.** All SAP field mapping moved into one boundary,
`src/modules/sap/sap-invoice-payload.ts`. The payload now carries `currencyCode`
taken from `Invoice.currencyCode` — no VND default, no inference from amount
scale, no locale, no FX conversion. Amounts are untouched; currency is added
alongside them.

**Mall ownership fixed in the same change.** The payload forwarded
`mallId: invoice.mallId` verbatim, and that column is nullable. All six invoice
sources were traced first (five set it from the contract/unit; the manual-create
and revenue-share paths leave it null but always carry a `contractId`), which
justifies the precedence: `Invoice.mallId`, else `Contract → Unit → mallId`. If
both are present and disagree, or if neither resolves, the posting fails closed.
`mallId: null` can no longer leave the platform.

**Fail-closed conditions**, all evaluated before any network call and before any
log row is written, so a rejected posting never leaves a misleading SUCCESS
entry: `SAP_INVOICE_CURRENCY_MISSING`, `SAP_INVOICE_CURRENCY_UNSUPPORTED`,
`SAP_INVOICE_MALL_UNRESOLVED`, `SAP_INVOICE_MALL_INCONSISTENT`. Each carries
`invoiceId`, `contractId`, `tenantId`, `currencyCode`, `missingField` and every
`mallResolutionInputs` value the decision used.

**Stale queued payloads.** SAP is disabled, so every `syncInvoice` so far queued
a PENDING log holding a payload built by the old currency-less mapper.
`retryPending()` replayed those verbatim, which would have defeated this fix for
every already-queued invoice the moment SAP was enabled. It now rebuilds the
payload for INVOICE entities from current data, re-applying the fail-closed
checks.

**Idempotency unchanged** — `SapIntegrationLog.idempotencyKey`, the
`Idempotency-Key` header, the SUCCESS short-circuit and the circuit breaker are
untouched.

**Regression test.** `sap-invoice-payload.spec.ts` — 24 tests covering VND/USD/
MMK, missing and unsupported currency, mall derivation for both null-mallId
sources, unresolvable and inconsistent mall, and that amounts are unchanged by
currency mapping. Verified to catch the defect: reinstating the pre-fix payload
fails 6 tests.

**Full interface reconstruction:** `docs/audit/SAP_INTEGRATION_AUDIT.md`.

---

## SAP-002 — SAP currency field name is unverified

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Finance / SAP |
| Status | **OPEN — needs the SAP team** |

There is no field-mapping specification, sample payload or fixture anywhere in
the repository; `06-ERP-INTEGRATION-CATALOG.md` lists INT-001 (SAP) as an
unfilled template, and CLAUDE.md calls the module a mock. The pre-existing SAP
spec tests transport resilience only and never asserts payload content.

`currencyCode` was chosen to match the existing bespoke envelope's camelCase
convention and carries an ISO-4217 alphabetic code. A genuine S/4HANA OData
service would more likely expect `TransactionCurrency`, and would distinguish
document currency from company-code (local) currency. Also unverified: whether
amount precision differs per currency (all amounts are `Float`, with no
per-currency rounding rule).

Confirm before go-live. Renaming is a one-line change in the mapper; the
property this fix guarantees is that the currency is present and correct at
source.

---

## SAP-003 — No organizational finance dimensions are transmitted

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Finance / SAP |
| Status | **OPEN — business/integration decision** |

The posting carries no `companyCode`, `costCenter`, `profitCenter`,
`glAccount`, `postingDate` or `documentDate`, and no `contractId`/`invoiceId` —
only the human-readable `invoiceNumber`.

`SapEntityMapping.sapCompanyCode` **does** exist (default `'1000'`, alongside
`sapSystem: 'S4HANA'`) but is never read by the posting path. It was deliberately
**not** wired in during the SAP-001 remediation: whether SAP requires these
dimensions is an integration question, and defaulting a company code to `'1000'`
would be inventing a finance dimension — exactly the class of error SAP-001
exists to remove.

---

## SAP-004 — Reconciliation compares currency-less amounts

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Finance / SAP |
| Status | **OPEN** |

`SapReconciliationRecord.ourAmount` and `sapAmount` have no currency column, so
reconciliation compares two bare numbers. Part of CUR-002, tracked separately
because it sits on the SAP boundary and was not in SAP-001's scope.

---

## SAP-001 — original defect description, retained

| Field | Value |
|---|---|
| Status at discovery | CONFIRMED (Phase 3) |

**Description.** The invoice posting payload (sap.service.ts:94-109) sends
`amount`, `vatAmount`, `mallId`, `period`, `dueDate` and line items — and no
currency field. A search of the entire SAP module returns **zero occurrences of
"currency" or "currencyCode"**. `SapReconciliationRecord.ourAmount`/`sapAmount`
likewise have no currency (CUR-002).

The platform maintains currency correctly at every internal hop (see
`DATA_LINEAGE.md`) and then drops it at the outbound boundary. A USD invoice and
a VND invoice post to SAP as indistinguishable bare numbers, and reconciliation
compares two currency-less amounts.

**Mitigating context (verified).** Posting is **manual only** — `POST
/sap/sync/invoice`, roles ADMIN and FINANCE. `syncInvoice` is called from nowhere
outside the SAP controller: there is no cron, no outbox handler, no automatic
propagation. Only issued, non-cancelled invoices are accepted.

**Recommended fix (not applied).** Add `currencyCode: invoice.currencyCode` to the
payload and to `SapReconciliationRecord`, then agree the field mapping with the
SAP side. Requires coordination, not a one-line change.

---

## BILL-002 — Revenue-share invoice generation is non-atomic

| Field | Value |
|---|---|
| Severity | **P2** |
| Domain | Finance |
| Status | **FIXED 2026-09-06 — concurrency proven; DB constraint verified on real Postgres** |
| Invariants | **FIN-10** (now DB + CHOKEPOINT), **TX-04** |

**Business key, reconstructed rather than assumed.** Tracing the generator and
every predicate that reads it gives `(contractId, period)` for
`type = REVENUE_SHARE`, restricted to **live** invoices
(`isActive = true AND status <> 'CANCELLED'`).

Two decisions worth recording:
- **`tenantId` is excluded.** `Contract.tenantId` is NOT NULL, so the tenant is
  functionally determined by the contract. Including it would be redundant and
  would open a loophole — the same contract+period under a different tenantId
  would slip past.
- **Liveness is part of the key.** `voidInvoice()` sets `status = CANCELLED` and
  **keeps the row** (`isActive` stays true). A constraint over the bare triple
  would permanently block re-issuing a revenue-share invoice for a voided
  period — a regression, not a fix. The old application predicate also omitted
  this filter, so a voided period was already un-billable; that is fixed too.

**Transaction boundary (TX-04).** The existence check moved inside the same
`runSerializableTransaction` that commits the invoice, so a P2034 retry
re-decides against freshly committed data instead of reusing a stale answer.
Scoped per invoice, never around the batch: one tenant's conflict cannot roll
back another tenant's invoice.

**DB constraint.** Prisma's schema language cannot express a partial unique
index, so migration `20260906160000_revenue_share_unique_per_contract_period`
adds it as raw SQL:

```sql
CREATE UNIQUE INDEX "Invoice_revenue_share_contract_period_live_key"
  ON "Invoice" ("contractId", "period")
  WHERE "type" = 'REVENUE_SHARE' AND "isActive" = true AND "status" <> 'CANCELLED';
```

A plain `@@unique([contractId, period, type])` was deliberately **not** used —
it is broader than the business key and would block legitimate re-billing.

**Verified against real Postgres** (not only mocks): the index rejects a second
live revenue-share invoice for the same contract+period, while still allowing
re-issue after a void and allowing a `MONTHLY_RENT` invoice on the same
contract+period.

**Concurrency result.** Exactly one invoice commits. The loser observes the
committed invoice after the serialization retry, or hits the index and has its
P2002 converted into the same idempotent outcome — `SKIPPED_WITH_REASON /
ALREADY_BILLED`. A raw P2002/P2034 never reaches the operator. The P2002 handler
checks `meta.target` so a random `invoiceNumber` collision is rethrown rather
than mistaken for a duplicate key.

**Invoice + lines atomicity — positive finding.** The lines were always created
through Prisma's nested `lines: { create: [...] }`, which runs in the same
transaction as the header. An invoice could never commit without its line. That
property is preserved, now inside an explicit Serializable transaction.

**Existing data.** Not mutated. `prisma/scripts/revenue-share-duplicate-reconciliation.sql`
classifies rows OK / DUPLICATE_KEY / MISSING_CONTRACT / MISSING_PERIOD /
UNCLASSIFIABLE and must be run before applying the migration — the index build
fails loudly (without corrupting anything) if duplicates exist. Local dataset:
**0 revenue-share invoices**, so this is *not* production evidence.

**Regression tests.** `billing.revenue-share-duplicate.spec.ts` — 15 tests
covering T1–T12. The honest regression proof is the last pair: with the index
disabled in the harness, the fixed flow still commits exactly one invoice, while
the pre-fix flow (read outside, create outside) commits **two**.

**Original description, retained:**

Duplicate prevention for revenue-share invoices is a `findFirst` check followed by
a `prisma.invoice.create` with no transaction and no unique constraint on
(contract, period, type) (billing.service.ts:1526-1540). Concurrent or retried
generation produces duplicate invoices for the same period. The same create also
omits `mallId` (INT-001) and carries CUR-001's currency defect.

---

## CUR-001 blast radius (Phase 3 update)

Required by §17. An incorrect revenue-share invoice **cannot reach SAP
automatically** — there is no automated posting path anywhere in the codebase.
Reaching SAP requires an ADMIN or FINANCE user to issue the invoice and then
explicitly call `POST /sap/sync/invoice`.

It does still reach the customer through the normal issue/email flow, and it is
counted in AR summaries. Severity stays P1; remediation urgency is reduced by the
absence of automatic downstream propagation.

---

## INT-001 (Phase 3 result) — narrowed to the mallId column

Downgraded to **P2**. No reachable path creates an ownerless invoice:
`CreateInvoiceDto` requires `contractId` and `tenantId` (both `@IsString()
@MinLength(1)`), the controller validates mall access via the contract, and all
internal paths derive ownership from a parent record.

What *is* reachable: two paths persist `Invoice.mallId = NULL` — the manual create
(billing.service.ts:936) and revenue-share generation (:1540). The mall stays
derivable through `contract → unit`, so this is a query-scoping concern, not lost
ownership. Carried to Phase 6, which must determine whether any invoice query
filtering on `mallId` fails open on these rows. `ai.service.ts:203-207` documents
one query that already handles it fail-closed.

---

## FIT-001 (Phase 3 result) — REFUTED at the application layer

Downgraded to **P3**. All three `FitoutProject` write sites derive the status
server-side:

- create — `status: firstStage.code` from `getOrderedActive()` (fitout.service.ts:141);
- advance — `newStatus` must match an **active** stage config (`newIdx === -1` →
  "Unknown fitout stage") and must be exactly the next one (`newIdx !== currentIdx + 1`)
  (fitout.service.ts:225-233);
- assign — writes only `operationManagerId`.

Arbitrary values such as `"TEST"` or `"OCCUPIED"` are **not** writable through any
reachable API. `deactivate` additionally refuses to retire a stage still in use.

Classification: **STRICTLY_VALIDATED**. The residual issue is documentation — the
schema comment `// FK to FitoutStageConfig.code` describes a foreign key that does
not exist, which invites a future writer to assume referential safety the database
does not provide. Recommended: correct the comment, or declare the real relation.

---

## FIT-002 (Phase 3 result) — ADMIN-only, fails closed, but unvalidated

Severity **P2**. `POST /fitouts/stage-configs` is `@Roles(Role.ADMIN)` and
`deactivate` has an in-use guard — the important controls are present. The gaps:

- **No DTO.** The handler takes `@Body() body: any`, so the global
  `ValidationPipe({ whitelist: true })` never engages — it only strips properties
  for a decorated class. Nothing is validated.
- **`triggersUnitStatus` is not checked against the `UnitStatus` enum.** A typo
  reaches `transition()` as an unknown status, where `canTransition` returns false
  and the call throws. **Fails closed** — it blocks the fitout pipeline at that
  stage for every project rather than corrupting anything.
- **`setsField` is not checked against an allowlist.** In practice
  `fitout.service.ts:250-255` compares it to `'startDate'` and `'actualOpenDate'`
  only, so an unexpected value is ignored. No arbitrary field write is reachable.
- **`order` is unvalidated**, and `advanceStatus` requires strictly consecutive
  ordering — a bad `order` value can make the pipeline unadvanceable.
- **No mall scoping.** The table is global; these routes carry no `@Scope`
  decorator. One ADMIN changes the unit lifecycle for every mall at once.
- Changes take effect immediately and are not versioned.

Recommended: a validated DTO with `triggersUnitStatus` typed to the `UnitStatus`
enum and `setsField` restricted to an allowlist.

---

## OBS-002 — Positive findings confirmed by execution tracing

Recorded so the audit's balance is accurate and so these are not accidentally
weakened by a later fix.

1. **`UnitStatusService` is a genuine chokepoint.** Every production write of
   `Unit.status` goes through it except merge/split. `sanitizeUnitDto` throws on
   any generic edit mentioning `status`; `bulkUpdateUnits` explicitly rejects bulk
   status changes; there is **no `force: true` anywhere in production code**. Its
   five guards are unconditional and `force` cannot skip them.
2. **"Committed status requires a live Contract"** (unit-status.service.ts:149-162)
   is the strongest invariant found — it makes "unit shown as occupied with no
   contract" structurally unreachable.
3. **Contract activation is exemplary.** One Serializable transaction covering the
   status change, event, outbox enqueue and the full billing schedule build, with
   an in-transaction re-read, a stable outbox `eventKey`, P2034 resolution to the
   winner, and success/failure metrics. "ACTIVE contract with no billing schedule"
   is not reachable.
4. **Proposal→Contract conversion** derives every field server-side, requires
   APPROVED, and resolves its unique-constraint race idempotently.
5. **Billing schedule regeneration cannot resurrect billed periods** and is
   refused outright for DRAFT/TERMINATED/EXPIRED contracts.
6. **Currency is server-resolved at every internal hop**, and `currencyCode` is
   deliberately absent from `CreateInvoiceDto` so the ValidationPipe strips any
   client attempt to set it.
7. **Move-out handover is checklist-gated.**
8. **Payment cross-currency is rejected, not coerced.**

---

## Test coverage gaps identified in Phase 3

Noted now rather than deferred to Phase 12, per §22.

| Invariant | Existing coverage | Gap |
|---|---|---|
| Direct contract without approval | `contract-currency-propagation.spec.ts:91` tests the path's *currency*, not its governance | **no test asserts approval is required** |
| Proposal/contract unit or tenant mismatch | `proposal-contract-conversion.spec.ts` covers the derived path | **no test for the direct path's mismatch** |
| Double live contract per unit | guarded in both paths | verify a test exists for the direct path |
| Booking exclusivity | `booking.unit-lock.spec.ts`, `booking-reliability.spec.ts` | **no test for the reorder race** |
| Fitout invalid status | validation exists | **no test asserting an unknown stage is rejected** |
| OCCUPIED without handover | — | **none** |
| Contract activation atomicity | `contract-activation.spec.ts`, `contract-lifecycle-atomicity.spec.ts`, `contract-write-atomicity.spec.ts` | good |
| Duplicate billing schedule | `billing-schedule.service.spec.ts` | verify the already-invoiced case |
| Payment concurrency | `billing.payment-transaction.spec.ts`, `billing.payment-currency.spec.ts` | **no concurrent-overpay test** |
| Revenue-share → SAP | — | **none** |

---

## Fixed during this session (pre-audit), retained for regression scope

These were found and fixed before the audit began; listed so their regression
tests are not lost and so the audit can verify no sibling instances remain.

| ID | Description | Fix commit |
|---|---|---|
| CUR-F01 | `Unit.categoryId` never written by Spaces UI → CategoryMallPricing lookups and the CEO/Director price-deviation approval check were inert for every unit | 963f125 |
| CUR-F02 | `Unit`/`CategoryMallPricing` had no currency at all; price-deviation check skipped entirely for non-VND deals | 25eab67 |
| CUR-F03 | Unit rate rendered as VND regardless of `unit.currencyCode` (Spaces grid, mall map) | c80822b |
| CUR-F04 | Approval + customer emails, price-approval queue, approve/reject audit notes, proposal PDF (MMK→"VND"), CompareModal, booking→proposal prefill guard | 887d2d6 |
| CUR-F05 | Booking detail "Giá cơ bản" hardcoded ₫/m² **and** booking `unit` select omitted `currencyCode` (two-layer failure) | 887d2d6 |

CUR-F05 is the pattern this audit must generalise: a frontend fix alone was
insufficient because the API had already stripped the field. Every currency
finding must be checked at **both** layers.

---

# MULTI-CURRENCY REPORTING AUDIT — 2026-09-06

Read-only audit. **No code, schema, migration, seed or production data changed.**
Full evidence: `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md`.

Context: the transactional chain is currency-correct after CUR-001/SAP-001. The
reporting layer is a separate problem, and it fails less by miscalculating than
by *omitting* — a dozen queries are explicitly scoped to `currencyCode: 'VND'`,
which is arithmetically safe but makes USD/MMK business invisible to management
with no disclosure on screen.

| ID | Title | Class | Severity | Evidence |
|---|---|---|---|---|
| RPT-CUR-001 | AI assistant sums VND+USD+MMK turnover and labels it "VNĐ" | AGG-CUR + UI-HC | **P1** | `ai.service.ts:229-234`; live data 2,287,113,472 VND + 5,488.01 USD + 24,995,784.55 MMK summed to 2,312,114,744 |
| RPT-CUR-002 | `avgRentPerSqm` averages `Unit.baseRentPerSqm` across currencies | AGG-CUR (AVG) | **P1** | `occupancy-analytics.service.ts:243,257`; latent today (all units VND) but reachable via the Spaces currency selector |
| RPT-CUR-003 | Three management APIs return money with no currency dimension | API-CUR | **P1** | runtime-verified: `/api/dashboard/cross-mall`, `/api/crm/pipeline/stats`, `/api/analytics/occupancy` each return monetary keys and **zero** currency keys |
| RPT-CUR-004 | VND-scoped KPIs presented as total revenue without disclosure | reporting completeness | **P1** | `dashboard.service.ts:203,217`, `reports.service.ts:152,230`, `occupancy-analytics.service.ts:368`, `ai.service.ts:209-215`, `billing.service.ts:385` |
| RPT-CUR-005 | `Lead.expectedRent`/`estimatedValue` have no currency; summed into pipeline value | MODEL-CUR | **P2** | `crm.service.ts:621-623,669-671`; 20 leads, 15,800,000 total, no currency column |
| RPT-CUR-006 | `SlotBooking.totalAmount` has no currency; feeds Dashboard SHORT revenue | MODEL-CUR | **P2** | `dashboard.service.ts:283,348-349,472` |
| RPT-CUR-007 | Shared formatters silently default a missing currency to VND | FMT-CUR | **P2** | `lib/currency.ts:26,43,56` — default parameter **and** `?? CURRENCIES.VND` |
| RPT-CUR-008 | `estimatedLoss` uses a hardcoded `500000` VND/m²/month rate | HARDCODED_VND | **P3** | `occupancy-analytics.service.ts:447,452` |
| RPT-CUR-009 | Sales turnover ranking orders rows across currencies | COMPARE-CUR | **P3** | `SalesPage.tsx` — each row is labelled correctly; only the ordering is meaningless |

**RPT-CUR-004 is P1 despite involving no arithmetic error.** It is the finding
most likely to mislead a decision-maker: every executive revenue KPI silently
excludes non-VND business while presenting itself as complete.

**CUR-002 update — reachability now proven.** `Lead` and `SlotBooking` were
previously listed as currency-less models of unproven impact. Both are now
confirmed to feed live management KPIs (RPT-CUR-005, RPT-CUR-006).
`Customer.budgetMin/Max` and `OccupancySnapshot.revenuePerSqm` are reachable but
not aggregated into any KPI — low.

**No previously closed issue regressed.** SEM-001, FORM-001, BILL-001, PAY-001,
CUR-001, INT-002-SEED, RS-TERMINATED, SAP-001 and BILL-002 were all re-checked
against the reporting layer and none was found to have been undone.

**Remediation is NOT started.** Recommended order and the two business questions
that must be answered first are in §15 of the audit document.

---

## Remediation Wave 1 — reporting currency contract (2026-09-06)

Scope: **Cross-Mall CEO screen + the three management API response contracts.**
Nothing else in the reporting layer was touched. Full evidence and runtime
output in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §16.

| ID | Before | After Wave 1 |
|---|---|---|
| RPT-CUR-003 | Three management APIs returned monetary keys and **zero** currency keys | **FIXED.** `/api/dashboard/cross-mall` → `revenueByCurrency` + `revenueScalarCurrency` at every money-bearing level. `/api/analytics/occupancy` → `billingRevenueByCurrency` + `billingRevenueScalarCurrency`. `/api/crm/pipeline/stats` → `proposalValueCurrency` + `pipelineValueCurrencyUnknown`. |
| RPT-CUR-004 | Every executive revenue KPI silently excluded USD/MMK | **FIXED for the Cross-Mall CEO screen only.** The `currencyCode: 'VND'` filter is removed from `getCrossMallDashboard`; the screen renders one labelled line per currency and drops the "Doanh thu tháng tổng" framing. **Still open everywhere else** (single-mall dashboard, reports, AI, compliance) and **still P1** on those surfaces — see the split in the Wave 2 section below. Fixing the highest-visibility screen does not reduce the severity of the ones still misreporting. |
| RPT-CUR-002 | Cross-currency SUM *and* cross-currency AVERAGE | **SUM fixed** (`totalMonthlyBillingRevenue` grouped by `Unit.currencyCode`; no schema change needed — the column is NOT NULL). **AVERAGE deferred**: splitting `avgRentPerSqm` changes the field's meaning, a business decision the wave brief fenced off. Now disclosed via `avgRentCurrencies` / `avgRentCurrencyMixed`. Remains **P1** until the average is resolved. |
| RPT-CUR-005 | Currency-less Lead values summed into pipeline value, silently | **DEFERRED** — needs `Lead.currencyCode`. Now **declared**: `pipelineValueCurrencyUnknown: true`. Severity unchanged (**P2**). |
| RPT-CUR-006 | Currency-less `SlotBooking.totalAmount` shown as VND-looking revenue | **DEFERRED** — needs `SlotBooking.currencyCode`. Now **declared**: `revenueCurrencyUnknown: true`, empty `revenueByCurrency`, and the UI prints "Chưa xác định đơn vị tiền tệ". Severity unchanged (**P2**). |
| RPT-CUR-001, 007, 008, 009 | — | **UNCHANGED.** Out of scope for this wave. |

Files changed: `dashboard.service.ts`, `occupancy-analytics.service.ts`,
`crm.service.ts`, `CrossMallDashboard.tsx`, new
`components/dashboard/RevenueByCurrency.tsx`.

Tests added: `dashboard.cross-mall-currency.spec.ts` (T1–T10),
`occupancy-analytics.currency.spec.ts`, `CrossMallDashboard.currency.test.tsx`.
Each suite contains an explicit regression proof that reconstructs the pre-fix
behaviour and asserts it violates the contract.

**No FX was implemented. No schema was changed. No production data was
modified.** The two local-database mutations used for runtime verification
(period-`2026-09` invoice copies, and two units temporarily set to USD/MMK) were
both reverted and the reversal was verified.

---

## Remediation Wave 2 — AI assistant financial context (2026-09-06)

Scope: **RPT-CUR-001 only.** Evidence and runtime output in
`docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §17.

### RPT-CUR-001 — CLOSED

| | |
|---|---|
| Severity | was **P1** |
| Status | **FIXED 2026-09-06** |
| Invariant | RPT-CUR-02 now HOLDS for the AI path |

`buildContext()` handed the model `SUM(grossSales)` across every `SalesTurnover`
row and labelled it "VNĐ"; on live data that added VND, USD and MMK together.
Growth was derived from two such mixed sums, so both numerator and denominator
were meaningless.

Now `groupBy({ by: ['currencyCode'] })` for both periods, with growth computed
inside each currency. A NULL `currencyCode` becomes an explicit UNKNOWN bucket —
never VND — and carries a warning naming CUR-001 as its origin.

`CURRENCY_UNKNOWN_NOT_COMPARABLE` was added beyond the brief: two
unknown-currency sums from different periods are not guaranteed to be the same
unit, so the UNKNOWN bucket never produces a growth percentage either.

Every monetary source reaching the AI was traced before the fix
(§17.1). Only the turnover block was arithmetically unsafe, so remediation was
not broadened. Contract value, rent and pipeline value never enter the AI
context at all.

### RPT-CUR-002 — severity corrected to P2 (documentation only)

Runtime impact is **latent**: all 30 `Unit` rows currently carry
`currencyCode = 'VND'`, so the cross-currency average cannot fire on today's
data. The issue remains **CONFIRMED and reachable** — the Spaces UI can set a
unit to USD/MMK, and Wave 1's runtime check demonstrated exactly that by
producing `avgRentCurrencyMixed: true` on Ground Floor once two units were
switched. P2 reflects current exposure, not correctness. No code changed.

### RPT-CUR-004 — split, NOT downgraded

The Wave 1 entry above previously suggested a P2 downgrade for the remaining
surfaces. That was wrong and has been corrected: fixing the most visible screen
does not make the others less severe. The issue is split instead.

| Surface | Status | Severity |
|---|---|---|
| Cross-Mall CEO (`/dashboard/cross-mall`) | **FIXED** (Wave 1) | closed |
| AI assistant AR block | **DECLARED** (Wave 2) — still VND-filtered, scope now stated in the prompt | **P2** — mitigated, not fixed |
| Single-mall dashboard (`buildDashboard`) | open — VND-filtered, presented as total revenue | **P1** |
| `reports.service.ts` revenue endpoints | open | **P1** |
| `compliance.service.ts` subtotal | open | **P1** |
| `occupancy-analytics.service.ts` `revenue` / `revenuePerSqm` | open — VND-scoped | **P1** |

The blocking business question is unchanged and still unanswered: what should an
executive "total revenue" mean when no FX rate is approved?

No production data was mutated in this wave. The local dev-database rows created
for runtime verification were deleted and the table verified back at its
original 30 rows.

---

## Remediation Wave 3 — Lead monetary currency model (2026-09-06)

Scope: **RPT-CUR-005 + the reachable Lead subset of CUR-002.** Evidence and
runtime output in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §18.

### RPT-CUR-005 — fixed at the Lead surface, NOT closed

| | |
|---|---|
| Severity | **P2** (unchanged) |
| Status | **FIXED for the Lead model and every CRM surface; one closing condition outstanding** |
| Blocker | **CUR-002-CUSTOMER** (below) |

`Lead.currencyCode CurrencyCode?` added — nullable, **no `@default`**. All six
write paths were reconstructed first (§18.1); `assertLeadCurrency` now refuses
money-without-currency on create and update, evaluated against the merged state
so legacy rows stay editable. `pipelineValueByCurrency` /
`valueByStatusAndCurrency` replace the currency-less scalars. The CRM form has a
required currency selector; the toolbar, overview KPI, kanban card and lead
sheet all render the supplied currency, and a missing one shows as
**"(chưa rõ ĐVT)"** rather than VND.

**No inheritance rule was implemented, deliberately.** `Lead` has no mandatory
monetary parent, and the data disproves the tempting shortcuts: seeded lead
*Zara Vietnam* links to an MMK Proposal and a VND UnitBooking simultaneously,
and *KFC Vietnam* carries a VND-magnitude `expectedRent` against a USD Proposal.

Reconciliation before migration (20 active leads, all with money):
**9 SAFE_TO_INFER · 10 CURRENCY_UNKNOWN · 1 CONFLICT · 0 AMBIGUOUS ·
0 NO_MONETARY_VALUE.** 7 of the 9 would infer VND from a `@default(VND)` column
and are flagged `inference_is_vnd_default_risk`. No backfill rule exists, so the
column is nullable and **nothing was auto-backfilled**.

### CUR-002-CUSTOMER — NEW, opened by this wave

| | |
|---|---|
| Severity | **P2** |
| Domain | CRM |
| Status | **CONFIRMED, not fixed — out of Wave 3 scope by instruction** |

`CustomersService.customerDataFromLead` maps `budgetMin ← lead.expectedRent`
(`customers.service.ts:277`), and `Customer` has no currency column
(`budgetMin`, `budgetMax`). Before Wave 3 this copy lost nothing because neither
side carried a currency; now it **drops a currency that exists**. Reachable
through `POST /crm/leads/:id/customer-profile` and the WON transition, which
calls `createFromLead`. 11 Customer rows in the reference dataset already hold
copied budget figures.

Fixing it requires a `Customer` schema change plus the same
nullable/no-default/reconciliation treatment used here. The Wave 3 brief
directed that such a discovery be raised as a separate issue rather than
remediated inline, so no `Customer` code or schema was touched.

This is the single reason RPT-CUR-005 is not marked closed.

### CUR-002 — Lead subset only

| Model | Status |
|---|---|
| `Lead.expectedRent` / `estimatedValue` | **FIXED** — `currencyCode` added, enforced, aggregated and displayed |
| `Customer.budgetMin` / `budgetMax` | open — **CUR-002-CUSTOMER** |
| `SlotBooking.totalAmount` | open — RPT-CUR-006, declared in Wave 1, unchanged |
| `SapReconciliationRecord.ourAmount` / `sapAmount` | open — SAP-004 |
| `OccupancySnapshot.revenuePerSqm` | open |

**CUR-002 is not globally fixed.**

No production data was mutated. The local dev-database changes used for runtime
verification (one lead temporarily set to NULL currency, three probe leads via
the API) were removed and the table verified back at 20 leads / 18 VND / 1 USD /
1 MMK.

---

## Remediation Wave 4 — Customer budget currency integrity (2026-09-06)

Evidence and runtime output in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §19.

### CUR-002-CUSTOMER — CLOSED

| | |
|---|---|
| Severity | **P2** |
| Status | **FIXED 2026-09-06** |
| Invariants | **MON-CUR-CUST-01/02/03/04** |

`Customer.currencyCode CurrencyCode?` added — nullable, **no `@default`**.
`customerDataFromLead` now maps `currencyCode ← lead.currencyCode` alongside
`budgetMin ← lead.expectedRent`, so the copy no longer drops a currency that
exists. Direct writes fail closed on budget-without-currency (merged-state check,
so legacy rows stay editable). `syncFromLead` refuses a cross-currency move with
`CUSTOMER_CURRENCY_CONFLICT` carrying `leadId`, `customerId`, `leadCurrency`,
`customerCurrency` and `field` — including the case where the Lead's currency is
UNKNOWN and the Customer has an explicit one.

A NULL Lead currency is copied as NULL, never as VND. Rejecting instead would
block a legacy lead from being marked WON (`createFromLead` runs on that
transition), so the "legacy synchronisation" carve-out applies and the
destination explicitly means UNKNOWN.

Reconciliation before migration (10 active customers, all with a budget):
**0 SAFE_TO_INFER · 10 CURRENCY_UNKNOWN · 0 CONFLICT · 0 AMBIGUOUS ·
0 NO_MONETARY_VALUE.**

A linked Lead only supplies a currency when `lead.expectedRent = budgetMin` —
i.e. when the exact value being inferred is demonstrably the same business value.
`budget_equals_lead_rent` is false for all 10 rows: the budgets were written
directly by the seed and by `CustomersService.create`, not copied from those
Leads, so the Lead's currency describes a different number. **Nothing was
backfilled** and the column is nullable.

> **Correction.** The reconciliation SQL originally classified on the link alone
> and reported 10 SAFE_TO_INFER for this dataset. That label promised something
> the data did not support; the classification has been fixed in the script, with
> `linked_lead_currency` and `budget_equals_lead_rent` retained as diagnostics.

### CRM-SCORE-CUR-001 — NEW; arithmetic FIXED, scoring policy PENDING

| | |
|---|---|
| Severity | **P2** |
| Domain | CRM / Proposals |
| Status | **MITIGATED — BUSINESS POLICY PENDING** |
| Arithmetic cross-currency defect | **FIXED 2026-09-06** |
| Foreign-currency financial-capacity scoring policy | **BUSINESS DECISION REQUIRED** |

`DealScoringService.scoreProposal` computed
`financialCapacity = min(100, budgetMax / 1_000_000_000 × 100)`. The divisor is a
VND-scale constant, so a 40,000 USD budget — a large one — scored **0.004** and
dragged the deal grade down.

**What is fixed.** `scoreFinancialCapacity` refuses to apply the VND scale to a
USD, MMK or unknown-currency budget. The cross-currency arithmetic is gone.

**What is NOT fixed.** The neutral value returned instead means
**"financial capacity was not evaluated for this currency"** — it does **not**
mean "medium financial capacity, proven". A USD or MMK customer therefore
contributes nothing informative to this criterion, and any deal grade leaning on
it is weaker than its number suggests. Treating 50 as a real score would be a
second, quieter version of the original defect.

**What the business must decide.** A per-currency reference scale — what USD
budget, and what MMK budget, constitute full financial capacity. This is a
scale/threshold question, **not** an FX question: it must not be resolved by
converting foreign budgets to VND at a rate. No USD/MMK threshold was invented
here.

This issue stays **open** until that policy exists. Only the arithmetic half is
closed.

Raised and fixed in the same wave because it is a direct consumer of
`Customer.budgetMax`, which §9 of the wave brief put in scope.

### RPT-CUR-005 — CLOSED

The single blocking condition from Wave 3 ("downstream copy does not lose it")
is gone. Every confirmed monetary copy out of `Lead` now preserves its currency:

| Downstream | Behaviour |
|---|---|
| `/crm/deals` deal view | `resolveDealCurrency` — Lead currency when the Lead supplied the amount, Proposal currency when it fell back, `null` when neither can prove one |
| `Customer.budgetMin` | `currencyCode` travels with the amount; conflict fails closed |
| Booking / Proposal / Contract | no Lead money prefill exists — verified, not assumed |

An UNKNOWN Lead currency stays UNKNOWN through every hop.

### CUR-002 — still open globally

| Model | Status |
|---|---|
| `Lead.expectedRent` / `estimatedValue` | **FIXED** (Wave 3) |
| `Customer.budgetMin` / `budgetMax` | **FIXED** (Wave 4) |
| `SlotBooking.totalAmount` | open — RPT-CUR-006 |
| `SapReconciliationRecord.ourAmount` / `sapAmount` | open — SAP-004 |
| `OccupancySnapshot.revenuePerSqm` | open |

No production data was mutated. The local dev-database probe rows (3 customers
created via the API, 2 lead links) were removed and the table verified back at 10
customers / 10 linked leads.

---

## Remediation Wave 5 — UnitSlot / SlotBooking currency lifecycle (2026-09-07)

Evidence and runtime output in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §20.

### RPT-CUR-006 — CLOSED

| | |
|---|---|
| Severity | **P2** |
| Status | **FIXED 2026-09-07** |
| Invariants | **MON-CUR-SLOT-01 … 05** |

`UnitSlot.currencyCode` (pricing) and `SlotBooking.currencyCode` (an immutable
booking-time snapshot) added — both nullable, **no `@default`**. Both write paths
fail closed on money-without-currency, evaluated against the merged state so
existing rows stay editable. Dashboard SHORT revenue is grouped by the booking
snapshot on `/api/dashboard` and `/api/dashboard/cross-mall`; the legacy scalar
survives only as a declared cross-currency sum alongside
`revenueCurrencyUnknown`.

**Ownership is BOTH, and the snapshot is required rather than preferred.**
`updateSlot` edits prices without restriction and `deleteSlot` is a soft delete
whose comment says "keep booking history", so a booking amount outlives the price
that produced it. Reading currency from the slot at query time would relabel
every historical booking the moment a slot was re-denominated.

**No inheritance from `Unit.currencyCode`.** That column's own schema comment
scopes it to the Unit long-term rent fields; nothing ties slot pricing to it, and
`updateSlot` never reads the Unit. A slot priced differently from its Unit is
therefore accepted, not rejected — enforcing equality would have invented a
business rule the codebase does not state.

Reference dataset: the seed creates **no** SHORT unit, slot or booking, so every
classification is 0 and the defect was latent. The reconciliation script was
still written and exercised against purpose-built rows.

### SLOT-INV-CUR-001 — NEW, found and fixed inside Wave 5 scope

| | |
|---|---|
| Severity | **P1** |
| Domain | Billing / Slots |
| Status | **FIXED 2026-09-07** |

`BillingService.createDueInvoiceFromSource('SHORT_TERM_BOOKING')` created an
Invoice from a slot booking and **never set `currencyCode`**, so the invoice took
`Invoice.currencyCode`'s `@default(VND)` whatever the booking was priced in. Once
raised, that label travels into payments and on to SAP — real money carrying a
wrong currency, not just a mislabelled report. Rated P1 for that reason.

The invoice now carries `booking.currencyCode`, and a booking with no currency
cannot produce an invoice at all. Fixed in this wave rather than deferred because
it is a direct consequence of the SlotBooking currency loss, which §11 of the
wave brief put in scope.

### CUR-002 — still open globally

| Model | Status |
|---|---|
| `Lead.expectedRent` / `estimatedValue` | **FIXED** (Wave 3) |
| `Customer.budgetMin` / `budgetMax` | **FIXED** (Wave 4) |
| `UnitSlot` price fields | **FIXED** (Wave 5) |
| `SlotBooking.baseAmount` / `totalAmount` | **FIXED** (Wave 5) |
| `SapReconciliationRecord.ourAmount` / `sapAmount` | open — SAP-004 |
| `OccupancySnapshot.revenuePerSqm` | open |
| `ParkingShift.cashRevenue` / `nonCashRevenue` | open — parking module |
| `InventoryItem.averageCost`, `InventoryTransaction.unitCost` | open — inventory, excluded by instruction |

Two existing specs were updated rather than relaxed:
`dashboard.cross-mall-currency.spec.ts` T9b asserted the Wave 1 *deferred*
contract (SHORT always currency-unknown) and now asserts the Wave 5 grouped
contract; `slots.service.concurrency.spec.ts` gained a currency on its slot
fixture so it keeps exercising the Serializable path instead of tripping the new
guard.

No production data was mutated. The local dev-database rows created for runtime
verification were deleted and the tables verified back at 0 slots / 0 bookings /
0 SHORT units / 30 units.

### Wave 5 closure cleanup (2026-09-07)

RPT-CUR-006 was reported CLOSED after the first Wave 5 pass while Dashboard SHORT
still emitted `revenue = VND + USD + UNKNOWN` as a compatibility scalar. That was
premature: a mixed monetary scalar violates MON-CUR-02 whatever it is labelled,
and "kept for compatibility" is not a reason to keep a meaningless number. Three
corrections closed the gap.

1. **Mixed scalar removed.** `monthlyRevenue` / `collectedRevenue` on
   `byLeaseTerm.SHORT` are null unless exactly one known currency governs the
   period; `revenueScalarCurrency` names it and `revenueCurrencyMixed` explains a
   null. `revenueByCurrency` is authoritative. Cross-mall `totals` merges buckets
   instead of summing scalars; `compliance.service.ts` was carrying the same
   scalar into a `revenuePerSqm` division and is null on the same condition.
   Regression test: VND 15,000,000 + USD 750 + UNKNOWN 9,000,000 must never
   produce 24,000,750.
2. **MON-CUR-SLOT-06.** `confirmBooking` was a blind status update — a legacy
   PENDING booking with a positive amount and NULL currency could reach
   CONFIRMED, which is both revenue-recognised and invoice-eligible. Now refused;
   the currency may be supplied during the transition. Zero-value bookings may
   still confirm without one, documented and tested (T18).
3. **Calculation structure test.** MON-CUR-SLOT-03 holds structurally, so a test
   scans `calculatePrice` for a second monetary operand and fails when one
   appears.

**RPT-CUR-006 — CLOSED**, now against all seven conditions including "Dashboard
SHORT has no mixed scalar" and "billable state requires currency".

No production data was mutated; the verification rows were removed and the tables
verified back at 0 slots / 0 bookings / 0 SHORT units / 30 units.
