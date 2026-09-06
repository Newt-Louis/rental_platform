# CURRENCY AUDIT

Status of every currency invariant found during the audit. Companion to
`DATA_LINEAGE.md`, which traces where currency travels.

## Invariants

| ID | Invariant | Status |
|---|---|---|
| MON-CUR-01 | Every monetary amount has an explicit currency | **PARTIAL** — the leasing chain holds; `Lead`, `Customer`, `UnitSlot`/`SlotBooking`, `SapReconciliationRecord` still carry bare amounts (CUR-002) |
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

- **CUR-002** — `Lead`, `Customer`, `UnitSlot`/`SlotBooking`,
  `SapReconciliationRecord`, `OccupancySnapshot.revenuePerSqm` carry money with
  no currency.
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
