# Multi-Currency Test Matrix

**Date:** 2026-08-20 · see `MULTI_CURRENCY_ARCHITECTURE.md` for the invariants under test.

## Automated coverage added this pass

| Test file | What it proves |
|---|---|
| `apps/backend/src/modules/contracts/contract-currency-propagation.spec.ts` | Proposal.rentCurrency (USD, MMK) propagates to Contract.currencyCode; a client-supplied `currencyCode` is ignored when a `proposalId` is present (the Proposal always wins); a direct contract (no proposalId) uses the client's `currencyCode` or defaults VND |
| `apps/backend/src/modules/billing/billing.payment-currency.spec.ts` | A payment whose explicit `currencyCode` doesn't match its invoice is rejected (`BadRequestException`) -- the USD-invoice/MMK-payment case from spec §14/§38; a matching explicit currency is accepted; an invoice's currency is inherited automatically when the caller sends none |
| `apps/backend/src/modules/billing/billing-schedule.service.spec.ts` (extended) | `BillingScheduleEntry.currencyCode` is derived from `Contract.currencyCode` (USD case) at schedule-build time |

All three, plus the full pre-existing suite, pass: **69/69 suites, 368/368
tests** (baseline before this pass: 67/67, 359/359 -- nothing regressed).

## Positive matrix -- traced through real seeded + reconciled data, not just mocks

The three full lifecycles below were not just unit-tested in isolation --
`prisma/seed.ts` now produces one real USD and one real MMK contract that
went through the actual `generateBillingPeriods` schedule math and invoice/
payment creation shape, and `scripts/backbone-reconciliation.mjs` was run
against that live, reseeded database.

| | Booking | Proposal | Contract | BillingScheduleEntry | Invoice | Payment |
|---|---|---|---|---|---|---|
| **VND** | `currencyCode` default (existing behavior, unchanged) | `rentCurrency` default | `currencyCode` default | default | default | default |
| **USD** | -- (seed doesn't exercise Booking; service-layer test does, see above) | `PROP-2026-0001`, `rentCurrency: USD` | `CTR-2026-0001`, `currencyCode: USD`, rent 5000, cam 625, deposit 15000 | derived, `currencyCode: USD` | `INV-2026-03-0001` etc., `currencyCode: USD`, totalAmount 6187.5 | `currencyCode: USD`, amount 6187.5 |
| **MMK** | -- (same as above) | `PROP-2026-0002`, `rentCurrency: MMK` | `CTR-2026-0002`, `currencyCode: MMK`, rent ~14.18M, cam ~1.77M, deposit ~42.5M | derived, `currencyCode: MMK` | `INV-2026-03-0002` etc., `currencyCode: MMK`, totalAmount 17,550,000 | `currencyCode: MMK`, amount 17,550,000 |

Live values confirmed via `psql` against the reseeded dev database (not
just asserted in test mocks) -- see command output captured during this
pass:
```
 contractNumber | currencyCode |       rent        |        cam         |      deposit
----------------+--------------+--------------------+---------------------+-------------------
 CTR-2026-0001  | USD          |               5000 |                 625 |             15000
 CTR-2026-0002  | MMK          | 14181818.18181818  |  1772727.272727273  | 42545454.54545455
```

## Negative matrix

| Scenario | Expected | Verified by |
|---|---|---|
| USD Invoice + MMK Payment (explicit mismatched `currencyCode`) | `BadRequestException`, no Payment row created | `billing.payment-currency.spec.ts` -- "rejects a payment whose explicit currencyCode does not match the invoice" |
| Contract created from a Proposal, client sends a different `currencyCode` in the request body | Ignored -- Contract takes the Proposal's currency | `contract-currency-propagation.spec.ts` -- "ignores a client-supplied currencyCode when a proposalId is present" |
| Invalid currency code (not VND/USD/MMK) | Rejected at the Postgres type level (`CurrencyCode` is a closed enum) and at the DTO level (`@IsEnum(CurrencyCode)` on every currency-accepting field) -- not just a frontend dropdown restriction | Enum + `class-validator` -- structural, not a runnable "send garbage" test in this pass; would 400 via NestJS's ValidationPipe before reaching a service |
| Existing USD Contract; nothing changes Mall's currency because no `Mall.defaultCurrency` field exists in this pass (see Architecture doc -- explicitly deferred) | N/A this pass | Not applicable -- there is nothing that could silently recolor an existing Contract, since no default-currency source exists yet to change |
| Report with VND + USD + MMK invoices in the same period | No mixed-currency total -- `DashboardService`'s revenue KPIs filter to `currencyCode: 'VND'`, so USD/MMK invoices are excluded rather than summed in | Code inspection + reconciliation (`dashboard.service.ts` edits); no dedicated dashboard test added this pass (existing `dashboard.service.spec.ts` untouched and still green) |

## Reconciliation (live-data invariant checks)

`scripts/backbone-reconciliation.mjs`, run against the reseeded database
containing the USD/MMK rows above:

```
[CLEAN] Contract.currencyCode does not match its source Proposal.rentCurrency
[CLEAN] BillingScheduleEntry.currencyCode does not match its Contract.currencyCode
[CLEAN] Invoice.currencyCode does not match its source Contract.currencyCode (LEASE_CONTRACT invoices only)
[CLEAN] Payment.currencyCode does not match its Invoice.currencyCode

Summary: 17/17 clean, 0 found issues, 0 errored.
```

(13 pre-existing checks + 4 new currency checks, all clean.)

## What is NOT covered by an automated test this pass (and why)

- **Booking currency at creation, through the API layer.** The DTO/service
  wiring exists (`CreateBookingDto.currencyCode`, `BookingService.create`)
  and is straightforward (a single field passthrough with a `?? 'VND'`
  default, the same pattern already covered for Contract/Payment), but no
  dedicated `booking.service.spec.ts` currency test was added -- the
  reconciliation script also intentionally does not check Booking->Proposal
  currency continuity, since that step is a deliberate SNAPSHOT (a sales rep
  may re-quote in a different currency at conversion), not an invariant.
- **Frontend currency selector interaction (Playwright/E2E).** Verified by
  `npx tsc --noEmit` (clean) and `vite build` (clean) plus manual code
  reading of `ConvertBookingDialog.tsx`'s new MMK option; no browser-driven
  E2E test exercises clicking the dropdown. `apps/frontend` has no existing
  Playwright coverage of this dialog to extend.
- **ServiceContract / ParkingCustomerContract currency.** Out of scope this
  pass (see Architecture doc) -- no test added because no behavior changed.
