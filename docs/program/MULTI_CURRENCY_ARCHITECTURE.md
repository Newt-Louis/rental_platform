# Multi-Currency Architecture

**Date:** 2026-08-20 · builds on `MULTI_CURRENCY_AUDIT.md` · targets RC3 on top of RC2 (`acf6a26`).

## Currency Master

This schema has no master-data tables for closed-set domain values anywhere
— `Role`, `UnitStatus`, `ContractType`, `BillingCycle`, 40+ others are all
plain Prisma `enum`s, checked at the Postgres type level. Currency follows
the same convention rather than introducing the only FK-based master-data
table in the codebase:

```prisma
enum CurrencyCode {
  VND
  USD
  MMK
}
```

Metadata that an enum can't carry (symbol, decimal places, display name,
active flag) lives in one place in application code, `apps/backend/src/common/currency/currency.constants.ts`,
mirrored on the frontend at `apps/frontend/src/lib/currency.ts`:

```ts
export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  VND: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0, isActive: true },
  USD: { code: 'USD', name: 'US Dollar',       symbol: '$', decimalPlaces: 2, isActive: true },
  MMK: { code: 'MMK', name: 'Myanmar Kyat',    symbol: 'K', decimalPlaces: 2, isActive: true },
};
```

Adding a 4th currency (THB, KHR, SGD, ...) is: add one enum value + one
Postgres migration + one constants-map entry, on both sides. No Booking,
Proposal, Contract, Billing, or Payment code changes — those all key off
`CurrencyCode`/`CURRENCIES`, never a hardcoded list.

**Why not a `Currency` DB table:** would be this schema's only FK-based
closed-set master table, adds a join to every money query, and none of VND/
USD/MMK's metadata (symbol, decimal places) needs to be edited at runtime —
it's a code constant like every other enum's display label already is
(see `bookings-constants.ts`, `spaces.constants.tsx` on the frontend). If a
future requirement needs runtime-editable currencies (e.g. a finance admin
enabling/disabling one without a deploy), promote `CURRENCIES` to a real
table then — the `CurrencyCode` values stay the same, so no lifecycle model
changes.

## Functional vs. transaction currency

No `Company`/`Organization` model exists in this schema — `Mall` is the
top-level tenant-facing entity, and it has no default-currency field today.
This pass does **not** add `Mall.defaultCurrency`: every lifecycle create
path defaults to `VND` when no currency is specified, which is behaviorally
identical to today (100% of existing data is implicitly VND) and keeps this
change additive. A mall-level default is a straightforward follow-up (one
column + one lookup at Booking/Proposal creation) once there's a real
requirement for a given mall to default to USD/MMK instead of prompting per
record — tracked as backlog, not blocking.

## The invariant

> Money without currency is invalid. Every lifecycle model that carries a
> commercial value carries an explicit `CurrencyCode` alongside it.

| Model | Field | Status before this pass | After |
|---|---|---|---|
| `UnitBooking` | `currencyCode` | *(none)* | new, `@default(VND)` |
| `Proposal` | `rentCurrency` | `String @default("VND")`, unvalidated | retyped to `CurrencyCode @default(VND)` |
| `Contract` | `currencyCode` | *(none — confirmed dropped at conversion, see audit §2)* | new, `@default(VND)` |
| `BillingScheduleEntry` | `currencyCode` | *(none)* | new, `@default(VND)` |
| `Invoice` | `currencyCode` | *(none)* | new, `@default(VND)` |
| `Payment` | `currencyCode` | *(none)* | new, `@default(VND)` |

`Proposal` keeps the field name `rentCurrency` (not renamed to
`currencyCode`) — it's already read by `ProposalEditor.tsx`,
`ApprovalsPage.tsx`, `ConvertBookingDialog.tsx`, and `types/index.ts` in
production code; renaming is a pure-risk breaking change for zero benefit.
Everywhere downstream of Proposal uses `currencyCode`. This is documented
so it isn't mistaken for an inconsistency later — it's an explicit
backward-compat exception.

## Propagation — REFERENCE / SNAPSHOT / DERIVED

- **Booking → Proposal**: SNAPSHOT. `ConvertToProposalDto.rentCurrency`, if
  the caller sends one, wins (a sales rep can still change currency at the
  conversion step, e.g. the deal moved from a VND-quoted booking to a
  USD-quoted proposal); otherwise it inherits `booking.currencyCode`.
- **Proposal → Contract**: REFERENCE, enforced server-side, not
  client-suppliable. `ContractsService.create()` — when `dto.proposalId` is
  set — loads the Proposal and sets `currencyCode: proposal.rentCurrency`
  **after** the `...dto` spread in the create payload, so any
  `currencyCode` the client sends is structurally overridden, not merely
  validated. This closes the exact silent-drop bug found in the audit.
  Direct contract creation (no `proposalId`) accepts `dto.currencyCode`,
  default `VND`.
- **Contract → BillingScheduleEntry**: DERIVED, set once at schedule-build
  time from `contract.currencyCode`. `generateBillingPeriods()` itself stays
  currency-agnostic (pure arithmetic) — the caller
  (`BillingScheduleService.buildScheduleForContractUnsafe`) attaches
  currency when persisting.
- **BillingScheduleEntry / Contract → Invoice**: DERIVED at invoice-creation
  time, both call sites (`BillingScheduleService.generateDueInvoices` cron
  and `BillingService.createInvoiceFromPending`'s `LEASE_CONTRACT` branch)
  set `currencyCode: contract.currencyCode`. The `SERVICE_CONTRACT`,
  `PARKING`, and `SHORT_TERM_BOOKING` invoice branches are untouched — they
  fall through to the schema's `VND` default, which is correct today since
  none of those three subsystems have a currency selector (see audit §9) —
  nothing regresses, nothing new is claimed.
- **Invoice → Payment**: REFERENCE, enforced server-side.
  `BillingService.recordPayment()` sets `currencyCode: invoice.currencyCode`
  after the spread (same override pattern as Contract). If a caller
  explicitly sends a `currencyCode` that doesn't match the invoice's, the
  request is rejected with `BadRequestException` rather than silently
  coerced — this is the "USD Invoice + MMK Payment → REJECT" case from the
  test matrix. No FX settlement exists to make a mismatch meaningful.

## Post-activation immutability

`contracts.service.ts` already has `CONTRACT_AMENDMENT_ONLY_FIELDS` — a list
of financial/term fields (`rent`, `cam`, `deposit`, `escalationPercent`, ...)
that can only change through the Amendment workflow once a contract leaves
DRAFT, specifically so financial changes get an audit trail. `currencyCode`
is added to that list. A Mall's or Contract's currency changing after the
fact never retroactively touches historical Booking/Proposal/Contract/
Invoice/Payment rows — there is no code path that does a bulk "recolor"
of existing currency values anywhere in this pass.

## No FX engine (explicitly out of scope)

Per spec: no conversion, no gain/loss, no revaluation, no rate-fetching
service. `Proposal.exchangeRate`/`exchangeRateSource` (GAP #42, pre-existing)
stay exactly as they are — a rate-at-proposal-time memo field with no
consumer, not touched by this pass, not the basis for anything built here.

## Reporting: no cross-currency SUM

`DashboardService`'s revenue KPIs (`monthlyRevenue`, `collectedRevenue`,
`overdueAmount`, `longMonthlyRevenue`, ...) currently `reduce`-sum
`Invoice.totalAmount`/`Payment.amount` with no currency filter (audit §6).
This pass adds `currencyCode: 'VND'` to the two source `invoice.findMany`
`where` clauses feeding those KPIs. Today that's a no-op (all invoices are
VND); going forward it means a USD or MMK invoice is correctly *excluded*
from the VND-denominated KPI rather than silently summed into it — "no fake
grand total" from spec §24, achieved by scoping rather than converting.
A full per-currency breakdown widget on the dashboard is backlog (see
Completion doc) — this pass fixes the correctness bug, not the UX.

## Central formatter

```ts
formatMoney(amount: number, currencyCode: CurrencyCode, locale?: string): string
```
on both backend (`common/currency/format-money.ts`, for PDF/email
generation) and frontend (`lib/currency.ts`, re-exported through the
existing `formatVND` in `lib/utils.ts` for backward compatibility with its
one current caller). Locale stays independent of currency — `vi-VN` UI
showing a USD contract formats as `$1,234.00 USD`, not `1.234 ₫`. Full
rollout across all 51 frontend / 9 backend ad-hoc formatting call sites
(audit §4) is out of scope; this pass migrates the call sites that sit on
a lifecycle screen actually gaining currency awareness: `ConvertBookingDialog`,
`ProposalEditor`, `BillingPage`'s invoice-detail panel, `contract-templates.service.ts`'s
PDF renderer, and the payment-balance validation message. The rest keep
formatting as VND exactly as before.

## Explicitly out of scope this pass (backlog)

1. **Float → Decimal migration.** ~130 `Float` money columns, one giant
   blast-radius change independent of currency. Not started.
2. **`ServiceContract`/`ServiceContractPayment`/`ParkingCustomerContract`
   currency tightening** from free-text `String` to `CurrencyCode`. Separate
   subsystems, no currency selector today, not part of the leasing lifecycle
   this pass targets.
3. **`Mall.defaultCurrency` / per-mall default.** Every create path defaults
   to VND today; a mall-level default is additive later.
4. Full dashboard multi-currency breakdown UI (only the correctness bug —
   unsafe SUM — is fixed this pass).
5. Rewriting all 51+9 ad-hoc formatting call sites to the central formatter.
6. FX conversion, revaluation, gain/loss accounting (explicitly excluded by
   spec, not partially built).

## Stop conditions checked (spec §49) — none hit

1. No global-currency assumption baked into the DB architecture beyond the
   `Float` type choice, which this pass doesn't need to touch.
2. No public/external-integration API breaks — `currencyCode` fields are
   additive with a `VND` default; existing clients that never send a
   currency get exactly today's behavior.
3. All existing monetary rows backfill unambiguously to `VND` — the schema
   default handles it in the same migration that adds the column, verified
   by reconciliation (see Migration doc).
4. No payment provider integration exists in this codebase to have
   conflicting currency assumptions.
5. No functional-currency conversion is required by any report in this
   pass — reports are scoped to VND, not converted.
