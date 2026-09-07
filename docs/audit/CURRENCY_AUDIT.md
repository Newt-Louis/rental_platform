# CURRENCY AUDIT

Status of every currency invariant found during the audit. Companion to
`DATA_LINEAGE.md`, which traces where currency travels.

## Invariants

| ID | Invariant | Status |
|---|---|---|
| MON-CUR-01 | Every monetary amount has an explicit currency | **PARTIAL** — the leasing chain holds; `Lead` and `Customer` fixed in Waves 3/4; `UnitSlot`/`SlotBooking`, `SapReconciliationRecord` and `OccupancySnapshot.revenuePerSqm` still carry bare amounts (CUR-002) |
| MON-CUR-02 | Arithmetic operands share one currency | **HOLDS** for revenue-share (CUR-001 fixed) and payments |
| MON-CUR-04 | No silent default currency on a write path | **PARTIAL** — every chain column is `@default(VND)` (CUR-003); `SalesTurnover` deliberately has none |
| **MON-CUR-RS-01** | Every SalesTurnover amount has an explicit currency | **HOLDS** — required by DTO on every write path |
| **MON-CUR-RS-02** | Revenue-share operands share one currency | **HOLDS** — asserted before the calculation |
| **MON-CUR-RS-03** | No FX conversion without an explicit policy | **HOLDS** — mismatch is rejected, never converted |
| **MON-CUR-RS-04** | The revenue-share invoice carries the validated currency | **HOLDS** |
| FIN-11 | Amounts leaving the platform carry their currency | **HOLDS** — SAP-001 fixed 2026-09-06; downstream field NAME still unverified (SAP-002) |

---

## CUR-001 — Revenue-share currency integrity — FIXED 2026-09-06

### The defect

`SalesTurnover.grossSales` / `netSales` had no currency. Revenue-share billing
computed:

```
shareAmount = grossSales × pct% − contract.rent
```

subtracting a `Contract.currencyCode`-denominated rent from a currency-less
turnover figure, then persisting the result with `currencyCode:
contract.currencyCode`. For a non-VND contract the two operands were different
units of account and the invoice was arithmetically meaningless — with a
valid-looking currency label on it.

Reachable in shipped data: the seed created VND-scale turnover
(e.g. 363,247,454) for every tenant regardless of contract currency, including
a **USD** contract (Highlands Coffee, GF-A01) and an **MMK** one (Jollibee,
GF-A02). No revenue-share invoice had been generated yet, so no money was
actually wrong — but the inputs were already in place.

### Business policy applied (confirmed 2026-09-06)

Turnover must be reported **in the Contract's currency**. A mismatch is
rejected. No auto-conversion, no VND assumption. There is no FX engine in this
platform, and MON-CUR-RS-03 forbids inventing one.

### Schema

```prisma
// CUR-001: ... Deliberately NULLABLE with NO @default.
currencyCode CurrencyCode?
```

Nullable and without a default **on purpose**. A non-null column would have
forced a backfill, and a backfill from `Contract.currencyCode` would have
stamped a fabricated unit onto figures that feed invoices — precisely the class
of error being fixed. `NULL` means *"reported before currency was captured"* and
is refused at billing time.

Migration: `20260906120000_add_currency_to_sales_turnover` — a single
`ADD COLUMN`, no data touched.

### Write paths (all now supply currency explicitly)

| Path | Change |
|---|---|
| `POST /sales` → `SalesService.create` | `currencyCode` **required** in `CreateSalesDto` (`@IsEnum(CurrencyCode)`); validated against the live contract; persisted |
| Same endpoint, revision branch | currency persisted on update too |
| `GET /sales/submission-units` | now returns `contractCurrencyCode` per unit so the UI can pre-fill and display it |
| `SalesPage` submission form | new **Đơn vị tiền tệ** selector, pre-filled from the selected unit's contract, visible and editable; submit blocked until set |
| `prisma/seed.ts` | scales turnover to the contract currency and records it — previously planted the exact VND-vs-USD/MMK mismatch |

No import, bulk-import, admin or job path writes `SalesTurnover`; the only
production writer is `SalesService.create`.

### Backend validation, two layers

1. **At entry** — `SalesService.assertTurnoverCurrencyMatchesContract` rejects a
   mismatch with `TURNOVER_CURRENCY_MISMATCH`, the earliest point a human can
   still correct the figure. When no live contract exists there is nothing to
   compare against; the row is still stored with its explicit currency.
2. **At billing** — `calculateRevenueShare` re-checks, because the contract may
   have been amended between reporting and billing. Rejects with
   `REVENUE_SHARE_CURRENCY_MISSING` or `REVENUE_SHARE_CURRENCY_MISMATCH`,
   carrying `contractId`, `turnoverId`, `turnoverCurrency`, `contractCurrency`,
   tenant, unit and period.

Rejections **skip the row and continue**, so one bad tenant does not block an
entire period's run, and are returned to the caller as
`{ created, invoices, rejected, rejectedCount }` rather than being swallowed.

### Hardcoded VND removed

| Location | Was | Now |
|---|---|---|
| revenue-share invoice `notes` | `...${gross.toLocaleString('vi-VN')} VNĐ...` | `formatMoneyWithCode(gross, currencyCode)` |
| revenue-share invoice line `description` | same | same |
| `SalesPage.fmt()` | appended `' VNĐ'` to every figure | takes the row's `currencyCode` |
| ranking row | `fmt(t.grossSales)` | `fmt(t.grossSales, t.currencyCode)` |

### Existing data risk

`prisma/scripts/sales-turnover-currency-reconciliation.sql` (read-only)
classifies every row as `OK` / `SAFE_TO_BACKFILL` / `AMBIGUOUS` /
`CURRENCY_MISMATCH` / `ALREADY_BILLED`, with a magnitude warning when a figure's
scale contradicts the contract currency.

**Nothing is auto-backfilled.** On the local dataset: 24 `SAFE_TO_BACKFILL`,
6 `AMBIGUOUS`, 0 billed.

The 6 ambiguous rows exposed a second problem, since **fixed** as INT-002-SEED:
the seed gave GF-A01 and GF-A02 two live contracts each (a USD `ACTIVE` and a
VND `EXPIRING` on one unit), and `calculateRevenueShare` picked between them
with an unordered `findFirst`. Contract selection is now by effective-date
coverage of the whole period (`resolveContractForPeriod`), and the seed no
longer overlaps. After re-seeding, both reconciliation scripts report
**30 rows, all OK**, and no unit has more than one live contract.

---

## Still open

- **CUR-002** — **still open globally, but narrowed.** As of Wave 3/4,
  `Lead.currencyCode` and `Customer.currencyCode` both exist (nullable, no
  default) and are enforced on every write path, so those two models no longer
  carry bare amounts. Still outstanding: `UnitSlot`/`SlotBooking`
  (RPT-CUR-006), `SapReconciliationRecord` (SAP-004) and
  `OccupancySnapshot.revenuePerSqm`.
- **CUR-003** — every chain currency column is `@default(VND)`.
- ~~**SAP-001**~~ — **FIXED 2026-09-06.** The payload now carries `currencyCode`
  from `Invoice.currencyCode` and fails closed when it is missing, unsupported,
  or when the owning mall cannot be resolved. The internal currency chain is now
  continuous from `Unit` through to the SAP posting.
  **Two caveats before calling this end-to-end:** the downstream field NAME is
  unverified against a real SAP counterparty (SAP-002), and no organizational
  finance dimensions are transmitted at all (SAP-003). See
  `docs/audit/SAP_INTEGRATION_AUDIT.md`.
- **SAP-004** *(new)* — `SapReconciliationRecord.ourAmount`/`sapAmount` still
  carry no currency, so reconciliation compares two currency-less numbers. Part
  of CUR-002, tracked separately because it is on the SAP boundary.
- ~~**INT-002-SEED**~~ — **FIXED 2026-09-06.** Deterministic contract-in-force
  resolution by period + seed overlap removed. The residual point stands:
  "one live Contract per Unit" is still **application-enforced only**, so any
  future direct write can recreate the overlap. The resolver now fails closed
  instead of guessing when it happens.
- ~~**RS-TERMINATED**~~ — **FIXED 2026-09-06.** `TERMINATING`/`TERMINATED`
  contracts are now eligible, with coverage tested against a derived
  `effectiveContractEndDate = min(endDate, termination.effectiveDate)`. A
  terminated contract bills the months it fully governed; the month the
  termination fell inside is `AMBIGUOUS_OR_SPLIT_PERIOD_REQUIRED`; months after
  it resolve to no contract. A `CANCELLED` termination shortens nothing.
- ~~**BILL-002**~~ — **FIXED 2026-09-06**, separately from CUR-001 (which was
  currency integrity only). The existence check now runs inside the same
  Serializable transaction that commits the invoice, backed by a partial unique
  index on `(contractId, period) WHERE type = REVENUE_SHARE AND isActive AND
  status <> CANCELLED`.

---

## Reporting layer (audited 2026-09-06)

The transactional chain is currency-correct; **management reporting is not**.
Full evidence in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md`.

Summary of what that audit established:

- Roughly a dozen reporting queries carry an explicit `currencyCode: 'VND'`
  filter. The arithmetic is therefore **safe** — but USD/MMK revenue is silently
  excluded from every executive KPI, with nothing on screen disclosing it
  (RPT-CUR-004).
- One confirmed cross-currency SUM: the AI assistant adds VND + USD + MMK
  turnover and labels the result "VNĐ" (RPT-CUR-001).
- One unsafe AVERAGE: `avgRentPerSqm` averages `Unit.baseRentPerSqm` across
  currencies (RPT-CUR-002). Latent today, reachable through the Spaces UI.
- Three management APIs return money with **no currency dimension at all**,
  runtime-verified (RPT-CUR-003).
- The shared frontend formatters silently default a missing currency to VND,
  which converts every API currency-loss into a confident wrong label
  (RPT-CUR-007).

`Lead` and `SlotBooking` are now **proven reachable** CUR-002 consumers — they
feed the CRM pipeline value and the Dashboard SHORT revenue card respectively
(RPT-CUR-005, RPT-CUR-006).

Positive findings worth preserving: `reports.service.ts` already groups proposal
value by `(status, rentCurrency)`; `service-contracts.service.ts` groups by
`currency`; billing AR keeps per-currency buckets. No code anywhere attempts FX
conversion.

---

## Remediation Wave 1 — Cross-Mall CEO + management API contract (2026-09-06)

The reporting layer is no longer uniformly VND-blind. Full evidence in
`docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §16.

| ID | Status after Wave 1 |
|---|---|
| **RPT-CUR-003** | **FIXED** for all three management APIs — each now returns an explicit currency dimension or an explicit "unknown" declaration. |
| **RPT-CUR-004** | **FIXED for the Cross-Mall CEO screen only.** The VND filter is gone, USD/MMK revenue is visible, and the consolidated "Doanh thu tháng tổng" framing is removed. Every other VND-scoped KPI still carries the defect. |
| **RPT-CUR-002** | **PARTIALLY FIXED** — the cross-currency SUM (`totalMonthlyBillingRevenue`) is grouped by `Unit.currencyCode`. The cross-currency AVERAGE (`avgRentPerSqm`) is **deferred**: correcting it changes the field's meaning, which is a business decision. It now reports `avgRentCurrencyMixed` so the ambiguity is visible. |
| **RPT-CUR-005 / 006** | **DEFERRED** (need `Lead.currencyCode` / `SlotBooking.currencyCode`). Both are now DECLARED at the API boundary: `pipelineValueCurrencyUnknown` and `revenueCurrencyUnknown`. |
| **RPT-CUR-001 / 007 / 008 / 009** | **UNCHANGED** — outside this wave. |

New invariant established by this wave:

| ID | Invariant | Status |
|---|---|---|
| **MON-CUR-RPT-01** | A monetary field in a management API response either carries its currency, or declares that its currency is unknown/scoped | **HOLDS** for `/dashboard/cross-mall`, `/analytics/occupancy`, `/crm/pipeline/stats`; not yet asserted elsewhere |

Still no FX engine, and none was added.

---

## Remediation Wave 2 — AI assistant financial context (2026-09-06)

Evidence in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §17.

| ID | Status after Wave 2 |
|---|---|
| **RPT-CUR-001** | **CLOSED.** `ai.service.ts#buildContext` grouped turnover by `currencyCode`; growth is per currency; no mixed total remains; a NULL currency becomes an explicit UNKNOWN bucket, never VND; the context states the currency boundary and forbids FX. |
| **RPT-CUR-004** | **Mitigated locally, not fixed.** The AI's AR block stays VND-filtered but now declares that scope in the prompt. Split by surface in `ISSUE_REGISTER.md`; still P1 on the single-mall dashboard, reports, compliance and occupancy revenue. |
| **RPT-CUR-002** | Unchanged in code. Severity corrected to **P2** in the register because all `Unit` rows are currently VND, making it latent; still confirmed and reachable. |
| RPT-CUR-005 / 006 / 007 / 008 / 009 | **UNCHANGED** — outside this wave. |

`SalesTurnover.currencyCode` was left nullable with no default by CUR-001 so a
pre-currency figure would never be given a fabricated unit. Wave 2 is where that
decision pays off end to end: the NULL travels all the way into the AI prompt as
"KHÔNG XÁC ĐỊNH" with a warning, instead of being silently rendered as VND.

New invariants: **MON-CUR-AI-01/02/03** (see `BUSINESS_INVARIANTS.md`).

Still no FX engine, and none was added.

---

## Remediation Wave 3 — Lead monetary currency model (2026-09-06)

Evidence in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §18.

| ID | Status after Wave 3 |
|---|---|
| **RPT-CUR-005** | **FIXED at the Lead surface, NOT closed.** `Lead.currencyCode` added (nullable, no default); write paths fail closed on money-without-currency; CRM aggregation grouped by currency; frontend shows the supplied currency and labels a missing one "chưa rõ ĐVT". Held open by **CUR-002-CUSTOMER**. |
| **CUR-002-CUSTOMER** | **NEW, CONFIRMED, not fixed.** `Customer.budgetMin ← Lead.expectedRent` drops the currency because `Customer` has no such column. Raised rather than remediated, per the wave's own instruction. |
| **CUR-002** | **Lead subset only.** `Customer`, `SlotBooking`, `SapReconciliationRecord` and `OccupancySnapshot` unchanged — NOT globally fixed. |

`Lead.currencyCode` follows the same design as `SalesTurnover.currencyCode`
(CUR-001): nullable, no default, never backfilled. Reconciliation of 20 active
leads found 10 with money and no deterministic source at all, and 1 whose linked
Proposal (MMK) and UnitBooking (VND) disagree outright — so no inference rule
was implemented, and none should be.

Still no FX engine, and none was added.

---

## Remediation Wave 4 — Customer budget currency integrity (2026-09-06)

Evidence in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §19.

| ID | Status after Wave 4 |
|---|---|
| **CUR-002-CUSTOMER** | **CLOSED.** `Customer.currencyCode` added (nullable, no default). The `Lead.expectedRent → Customer.budgetMin` copy carries the currency; direct writes fail closed; `syncFromLead` refuses a cross-currency move with `CUSTOMER_CURRENCY_CONFLICT`; the UI no longer prints "tr/m²" (a VND unit word) over currency-less budgets. |
| **RPT-CUR-005** | **CLOSED.** The last outstanding condition — downstream copies losing the currency — is resolved. |
| **CRM-SCORE-CUR-001** | **NEW — MITIGATED, BUSINESS POLICY PENDING.** Deal-scoring `financialCapacity` divided `budgetMax` by a VND-scale constant; a 40,000 USD budget scored 0.004. The **arithmetic defect is FIXED** (the VND scale is applied only to VND). The **foreign-currency scoring policy is a BUSINESS DECISION still required**: the neutral value returned for USD/MMK/unknown means *"not evaluated for this currency"*, not *"medium capacity proven"*, so those customers contribute nothing informative to the criterion. Must be resolved with a per-currency scale, never with FX. |
| **CUR-002** | **STILL OPEN globally.** `Lead` and `Customer` done; `SlotBooking`, `SapReconciliationRecord`, `OccupancySnapshot.revenuePerSqm` unchanged. |

Reconciliation caveat worth preserving: all 10 existing customers classified
SAFE_TO_INFER, yet `budget_equals_lead_rent` was false for every one of them —
the budgets were never copied from those Leads. A classification label is not
provenance, and the script reports both.

Still no FX engine, and none was added.

---

## Remediation Wave 5 — UnitSlot / SlotBooking currency lifecycle (2026-09-07)

Evidence in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §20.

| ID | Status after Wave 5 |
|---|---|
| **RPT-CUR-006** | **CLOSED.** `UnitSlot.currencyCode` (pricing) and `SlotBooking.currencyCode` (immutable booking-time snapshot) added, nullable with no default. Write paths fail closed; Dashboard SHORT groups by the snapshot; the `SHORT_TERM_BOOKING` invoice carries it. |
| **SLOT-INV-CUR-001** | **NEW and FIXED (P1).** The `SHORT_TERM_BOOKING` invoice path never set `currencyCode`, so every such invoice took `@default(VND)` regardless of the booking. That label reached payments and SAP. |
| **CUR-002** | **Lead, Customer, UnitSlot and SlotBooking now done.** Still open: `SapReconciliationRecord` (SAP-004), `OccupancySnapshot.revenuePerSqm`, `ParkingShift`, inventory. |

Two structural findings from the reconciliation worth preserving:

- Inheriting slot pricing currency from `Unit.currencyCode` is **not** available:
  that column is scoped by its own comment to the Unit long-term rent fields, and
  nothing ties slot pricing to it. `SAFE_TO_INFER_FROM_UNIT` is therefore
  unreachable by construction, and the script says so rather than omitting it.
- A booking may inherit from its slot only when `baseAmount` still **reproduces**
  from that slot current price. `updateSlot` re-prices freely and `deleteSlot`
  keeps booking history, so today price is routinely not the price a historical
  booking was calculated from.

Still no FX engine, and none was added.

### Wave 5 closure cleanup (2026-09-07)

| Change | Why |
|---|---|
| Dashboard SHORT scalar removed | It was `VND + USD + UNKNOWN` added together. `monthlyRevenue` is now null unless exactly one known currency governs the period, with `revenueScalarCurrency` naming it and `revenueCurrencyMixed` explaining a null. `revenueByCurrency` is authoritative. The cross-mall `totals` merges buckets instead of summing scalars. |
| **MON-CUR-SLOT-06** added | `confirmBooking` was a blind status update, so a legacy positive-value booking with no currency could reach CONFIRMED — the revenue-recognised and invoice-eligible state. It now fails closed, and the currency may be supplied during the transition. |
| Zero-value rule documented | A 0-amount booking may confirm with no currency: it recognises no revenue and can be invoiced for no amount. Stated and tested, not implied. |
| Calculation structure test | MON-CUR-SLOT-03 holds structurally, not by a check. A test now scans `calculatePrice` (comments stripped) and fails if a fee/deposit/tax/surcharge/fixed-discount operand enters the formula. |

---

## Remediation Wave 6 — OccupancySnapshot monetary semantics (2026-09-07)

Evidence in `docs/audit/MULTI_CURRENCY_REPORTING_AUDIT.md` §21.

| ID | Status after Wave 6 |
|---|---|
| **CUR-002 (OccupancySnapshot subset)** | **CLOSED.** `revenuePerSqmCurrency` added, nullable with no default. The arithmetic was never unsafe — the source aggregate is explicitly VND-filtered — so the scope was recorded, not widened. SHORT records null because its ratio is 0 from no monetary source at all. |
| **OCC-CRON-001** | **NEW, P1, pre-existing, NOT fixed.** `takeMonthlySnapshot` passes null into a compound-unique `where`; Prisma rejects it, so the monthly job has never written a row. Every snapshot came from the seed. The Wave 6 currency fix is correct but inert until this is resolved. |
| **ANLY-CUR-001** | **NEW, P2, NOT fixed.** `AnalyticsDashboard.tsx:350` hardcodes VND over `compliance.service.ts`'s own `revenuePerSqm` — same class of defect, different producer, outside this wave's fence. |
| **CUR-002** | Still open globally: `SapReconciliationRecord` (SAP-004), `ParkingShift`, inventory. |

A ratio is not currency-neutral because it is divided by m²: VND/m² and USD/m²
remain different units. That is why the fix is a persisted currency rather than a
comment.

Backfill was refused on two independent grounds: two writers produce
indistinguishable rows, and reading the current writer's filter back onto
historical rows is precisely the inference MON-CUR-OCC-01 forbids.

Still no FX engine, and none was added.
