# Multi-Currency Audit

**Date:** 2026-08-20
**Scope:** Add USD and MMK alongside VND for the multinational rollout, without
breaking the existing VND flows on top of RC2 (`acf6a26`).

This audit is read-only groundwork for `MULTI_CURRENCY_ARCHITECTURE.md`. It
covers the core leasing lifecycle explicitly in scope for this pass —
Booking → Proposal → Contract → BillingScheduleEntry → Invoice → Payment —
and records what exists elsewhere for future phases.

## 1. Currency fields today (schema.prisma, 3287 lines, 130+ models)

Only **7** models carry any currency field, all free-text `String @default("VND")`,
none validated against a closed set:

| Model | Field | Line |
|---|---|---|
| `ParkingCustomerContract` | `currency` | 904 |
| `Proposal` | `rentCurrency` | 1386 |
| `ServiceContract` | `currency` | 1652 |
| `ServiceContractPayment` | `currency` | 1713 |

(Two more `currency` hits at 1452/1476/1863 in the grep turned out to be the
same `ServiceContractPayment`/`ParkingMonthlyStatement`-adjacent block; the
canonical set is the 4 above plus `ProposalDealScore.proposedAmount`/
`approvedAmount`, which use `Decimal(18,2)` but have **no currency field at
all** — those two are the only `Decimal` money columns in the entire schema.)

**Critical gap: the core leasing lifecycle has almost no currency tracking.**

| Model | Currency field? |
|---|---|
| `UnitBooking` | **None.** `expectedRent`, `proposedRentPerSqm`, `proposedCamPerSqm` are bare `Float`. |
| `Proposal` | `rentCurrency String @default("VND")` — the only lifecycle model that has one. |
| `Contract` | **None.** `rent`, `cam`, `deposit`, all GAP-41/91/93 fee fields are bare `Float`. |
| `BillingScheduleEntry` | **None.** |
| `Invoice` | **None.** |
| `Payment` | **None.** |

## 2. Confirmed silent currency loss at Proposal → Contract

`apps/backend/src/modules/contracts/contracts.service.ts:256-267` (`create()`)
spreads `...dto` from `CreateContractDto` into `prisma.contract.create`.
`CreateContractDto` (`apps/backend/src/modules/contracts/dto/create-contract.dto.ts`)
has no currency field, and `Contract` has no currency column to receive one.
Whatever currency was chosen on the Proposal (`rentCurrency`) is **dropped**
the moment a Contract is created from it — the field is never read anywhere
in `contracts.service.ts`. This is exactly the failure mode
`MULTI_CURRENCY_ARCHITECTURE.md` §Propagation must close.

Downstream, `BillingScheduleEntry` rows are generated from `Contract` via the
pure function `billing-schedule.util.ts::generateBillingPeriods()`, which is
currency-agnostic (it only does arithmetic) — currency must be attached when
the caller persists the generated rows, not inside that function.

`Invoice` rows are created from `BillingScheduleEntry`, `ServiceContractPayment`,
`ParkingMonthlyStatement`, and ad-hoc bookings in
`apps/backend/src/modules/billing/billing.service.ts` (creation sites around
lines 217, 240, 261, 285, 338, 378, 428, 498, 774, 944) — none set a currency.

`Payment.recordPayment()` (`billing.service.ts:956`) takes `{ amount, method,
reference, paidAt, notes, idempotencyKey }` — no currency in or out.

## 3. Money representation: Float, not Decimal

Every monetary column in the schema is `Float` except the two
`ProposalDealScore` columns noted above. `billing-schedule.util.ts` has its
own `roundMoney()` (round to 2dp) to paper over floating-point drift.
Migrating the ~130 existing `Float` money columns to `Decimal` is a large,
separate, high-blast-radius initiative (every service/DTO/test that reads
these fields would need review) — **out of scope for this pass**, tracked as
a backlog item in the architecture doc. New currency-context fields added by
this pass use the narrowest safe type (a Postgres enum); no new Float money
fields are introduced.

## 4. Formatting: no central formatter

`apps/frontend/src/lib/utils.ts:8-9`:
```ts
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
```
is the closest thing to a shared formatter, but only **1** file actually
imports it. Grepping for `formatCurrency|formatMoney|Intl.NumberFormat|toLocaleString`
across `apps/frontend/src` hits **51 files** — each page/component rolls its
own formatting, almost all hardcoded to `vi-VN`/`VND`. Backend has the same
pattern in 9 files (`contract-templates.service.ts:89-90` does
`contract.rent.toLocaleString('vi-VN')` directly into the generated contract
PDF; `billing.service.ts:978` hardcodes `" VND"` into a validation error
message).

Rewriting all 51+9 call sites is out of scope for one pass. This pass adds
the central formatter (`formatMoney(amount, currencyCode)` on both sides) and
migrates the call sites on the lifecycle screens actually gaining a currency
selector (Booking/Proposal/Contract create, Invoice/Payment recording,
Contract PDF template, the payment-balance error message). The remaining
~45 frontend call sites keep working exactly as before (still VND-formatted)
since VND stays the default everywhere — they're listed as backlog, not silently
broken.

## 5. Exchange rate: already half-modeled, not implemented

`Proposal` already has `exchangeRate Float?` and `exchangeRateSource String?`
(GAP #42, lines 1394-1395) — a rate-at-proposal-time field with no consumer
anywhere in the codebase (`grep -rn exchangeRate apps/backend/src` outside
the DTO/entity plumbing returns nothing). This is a stub for a future FX
conversion feature, not a working exchange-rate engine. Per spec §15/§17,
this pass does **not** build FX conversion; the field is left as-is.

## 6. Reporting: unsafe SUM across currencies today

`apps/backend/src/modules/dashboard/dashboard.service.ts` computes
`monthlyRevenue` by `invoices.reduce((s, i) => s + i.totalAmount, 0)` in four
places (lines 283, 294, 426, 431) with no currency filter — if any invoice in
that set were ever non-VND, it would silently sum into the VND-labeled KPI.
Today this is latent (nothing produces a non-VND invoice yet); it becomes
live risk the moment Contract/Invoice gain a currency. Addressed in this pass
(see architecture doc §Reporting).

## 7. Reconciliation script

`scripts/backbone-reconciliation.mjs` is a `CHECKS` array of read-only SQL
queries run via `docker compose exec psql`, each expected to return zero
rows. Good fit for currency-invariant checks (Booking→Proposal,
Proposal→Contract, Contract→Billing, Billing→Invoice, Invoice→Payment
currency mismatches) — extended in this pass.

## 8. Seed data

`apps/backend/prisma/seed.ts` has **zero** currency references — every
seeded Proposal/Contract relies on the Prisma-level `@default("VND")`. No
USD/MMK example data exists anywhere in dev/UAT seed data today.

## 9. Peripheral currency fields (explicitly out of scope this pass)

`ServiceContract.currency`, `ServiceContractPayment.currency`,
`ParkingCustomerContract.currency` are free-text `String`, not wired to any
validation. They are **not** part of the Booking→Proposal→Contract→Billing→
Invoice→Payment leasing lifecycle this pass targets (they're separate
service/parking contract subsystems with their own billing paths). Left
untouched to keep this change's blast radius bounded; tightening them to the
new `CurrencyCode` enum is listed as backlog in the architecture doc.
