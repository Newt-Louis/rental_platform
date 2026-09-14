# DATA LINEAGE — Phase 3

Field-level trace through Lead → Booking → Proposal → Contract → Billing →
Invoice → Payment. "Derived" means the service reads it from the parent record;
"client" means it arrives in the request body.

## Matrix D — DATA LINEAGE MATRIX

| Field | Source | Transformation | Validation | Destination | Loss / fallback risk |
|---|---|---|---|---|---|
| **mallId** | `Unit.mallId` | never copied onto Booking/Proposal/Contract | `expectedMallId` checked in `transition()`; `MallAccessGuard` + resolver registry | Invoice.mallId (some paths) | **lost** at manual invoice create and revenue-share create → NULL |
| **unitId** | client (Booking create) | Booking→Proposal: client; Proposal→Contract: **derived** | unit exists + transition legal | Contract.unitId | direct-create path accepts client `unitId` alongside a client `proposalId` with no cross-check |
| **tenantId** | Lead conversion / client | Proposal→Contract: **derived** from proposal | required NOT NULL; `createInvoice` verifies tenant belongs to contract | Contract, Invoice, Payment | direct-create path accepts client `tenantId` with no proposal cross-check |
| **currency** | `Unit.currencyCode` | Booking `currencyCode` → Proposal `rentCurrency` → Contract `currencyCode` → schedule → Invoice → Payment | server-resolved at **every** hop; payment currency mismatch rejected outright | Payment.currencyCode → SAP outbound payload | forwarded to SAP as `currencyCode` (SAP-001 fixed); downstream compatibility UNVERIFIED (SAP-002). `SalesTurnover` now carries its own currency (CUR-001 fixed); `SapReconciliationRecord` still does not (SAP-004) |
| **rentPerSqm** | Unit.baseRentPerSqm | Booking.proposedRentPerSqm → Proposal.rentPerSqm | price-deviation approval routing vs CategoryMallPricing | Proposal | — |
| **monthlyRent** | Proposal.monthlyRent | → `Contract.rent` (direct copy) | `rent < 0` rejected at activation | BillingScheduleEntry.rentAmount | — |
| **cam** | Proposal.monthlyCAM | → `Contract.cam`, `?? 0` on direct create | `cam < 0` rejected at activation | BillingScheduleEntry.camAmount | `?? 0` default silently zeroes CAM on a direct create |
| **deposit** | Proposal.depositAmount | → Contract.deposit | `deposit < 0` rejected at activation | ContractTermination.depositRefund | termination refund has no currency of its own |
| **area** | Unit.area | used in rent computation | — | Proposal totals | — |
| **leaseStartDate** | Proposal.startDate | → Contract.startDate → `Unit.leaseStartDate` | `endDate > startDate` enforced at activation | billing period generation | — |
| **leaseEndDate** | Proposal.endDate | → Contract.endDate → `Unit.leaseEndDate` | same | schedule horizon; expiry scheduler | — |
| **handoverDate** | Proposal.handoverDate | → `FitoutProject.handoverDate` at fitout create | **never validated, never required** | activation outbox payload | ~~only the Spaces dialog collected it~~ **fixed 2026-09-06** — both conversion entry points now expose it; still not a gate on the move-in side (LIFE-001) |
| **rentFree** | conversion form (MONTHS) | copied verbatim Proposal → Contract | unit is canonical platform-wide (SEM-001) | `BillingScheduleEntry` — Base Rent zeroed for the first N months | ~~read as days by approval, months by billing~~ **fixed 2026-09-06** — one calculator, cross-layer test |

## Currency chain — verified executable, one hop at a time

This is the strongest lineage in the platform and it was checked at each hop
rather than assumed:

| Hop | Mechanism | Evidence |
|---|---|---|
| Unit → Booking | `currencyCode` on the booking, unit's currency used for price validation | booking.service.ts (CUR-F02/F05 fixes) |
| Booking → Proposal | prefill compares `unitCurrency === rentCurrency` | proposal-prefill.ts |
| Proposal → Contract (convert) | `currencyCode: proposal.rentCurrency` | proposals.service.ts:722 |
| Proposal → Contract (direct) | `resolvedCurrencyCode` overrides the client's value when `proposalId` is present, and is placed **after** the `...dto` spread so it structurally wins | contracts.service.ts:266-278, 310 |
| Contract → BillingScheduleEntry | `currencyCode: contract.currencyCode` on both create and update branches of the upsert | billing-schedule.service.ts:88,99 |
| Schedule → Invoice | `currencyCode: row.contract.currencyCode` | billing.service.ts:413 |
| Manual invoice | resolved from the contract server-side; `currencyCode` is **not in `CreateInvoiceDto`**, so the global `whitelist: true` ValidationPipe strips any client attempt before the service sees it | billing.service.ts:916-926, invoice.dto.ts:33-60 |
| Invoice → Payment | `currencyCode: invoice.currencyCode`; an explicit mismatch is rejected, not coerced | billing.service.ts:1154-1156, 1205 |
| **Invoice → SAP** | `currencyCode` from `Invoice.currencyCode`; mall resolved via `Invoice.mallId` else `Contract → Unit`; both fail closed before transmission | sap-invoice-payload.ts (SAP-001, fixed 2026-09-06) |

## Revenue-share currency lineage (CUR-001, fixed 2026-09-06)

| Hop | Role of currency | Mechanism |
|---|---|---|
| **Contract selection** | **RESOLVED** — by effective-date coverage of the whole period, never by order | `resolveContractForPeriod`; 0 or >1 match → fail closed (CONTRACT-PERIOD-01) |
| **Effective end date** | **DERIVED** — `min(Contract.endDate, ContractTermination.effectiveDate)` for a COMPLETED or pending termination; unchanged for CANCELLED | `effectiveContractEndDate`; `Contract.endDate` is never rewritten by termination, so the raw column alone over-claims coverage (CONTRACT-PERIOD-02) |
| **Batch outcome** | **OBSERVABLE** — every turnover row yields exactly one of INVOICE_CREATED / NO_AMOUNT_DUE / SKIPPED_WITH_REASON / REJECTED | `calculateRevenueShare().outcomes` (REVSHARE-02) |
| Contract.currencyCode | **SOURCE** | authoritative, immutable outside Amendment once ACTIVE |
| → submission form | **COPIED** (pre-filled, visible, editable) | `GET /sales/submission-units` returns `contractCurrencyCode` per unit |
| → `CreateSalesDto.currencyCode` | **REQUIRED** | `@IsEnum(CurrencyCode)`, no default |
| → SalesTurnover.currencyCode | **VALIDATED** then stored | `assertTurnoverCurrencyMatchesContract` at write time |
| → revenue-share calculation | **VALIDATED** again | mismatch or NULL → **REJECTED**, no invoice, no FX conversion |
| → Invoice.currencyCode | **COPIED** from the validated calculation currency | MON-CUR-RS-04 |
| → Payment.currencyCode | **COPIED** from Invoice; mismatch rejected | unchanged |
| → SAP outbound payload | **FORWARDED** | `currencyCode` comes from `Invoice.currencyCode` through `buildSapInvoicePayload`; field presence is now enforced and fails closed, but downstream field-name/semantic compatibility remains **UNVERIFIED** (SAP-002) |

The turnover row is the only place currency is *entered by a human*; every other
hop derives or validates it. `NULL` on a legacy row is a distinct state meaning
"never captured", and it is refused at billing rather than defaulted.

## Rent-free / contract-value lineage (SEM-001, FIN-CALC-01)

Since 2026-09-06 there is one calculator and one shared per-month primitive:

| Hop | Mechanism | Evidence |
|---|---|---|
| Conversion form → DTO | single shared form, both entry points, `rentFree` in MONTHS | `components/proposals/ProposalConversionForm.tsx` |
| DTO → Proposal | verbatim; TCV from `computeContractValue` | booking.service.ts:1023 |
| Proposal → approval routing | `rentFreeMonths` vs `RENT_FREE_MONTHS > 2` | approval-policy.util.ts |
| Proposal → Contract | verbatim copy | proposals.service.ts:718 |
| Contract → BillingScheduleEntry | `baseRentForMonthIndex` — **the same primitive the valuation uses** | billing-schedule.util.ts:118-127 |

Because valuation and billing sit on one primitive, the proposal's stated value
and the invoices the contract goes on to issue are arithmetically the same
number — asserted directly by the cross-layer regression test, including under
compound escalation.

The internal lineage is continuous from Unit through the outbound SAP payload.
It is NOT yet end-to-end verified against a real SAP counterparty because
SAP-002 and SAP-003 remain open.

## Where mallId is lost

`Invoice.mallId` is populated by the four internal funnel paths
(billing.service.ts:413, 458, 507, 575 — from `contract.unit.mallId`,
`contract.mallId`, or `slot.unit.mallId`) and by nothing else.

Two reachable paths never set it:

- `createInvoice` (billing.service.ts:936) — the manual `POST /billing/invoices`
  route. Sets `contractId`, `tenantId`, `billingPartyId`; no `mallId`.
- `generateRevenueShareInvoices` (billing.service.ts:1540) — sets `contractId`
  and `tenantId`; no `mallId`.

Both still carry `contractId`, so the owning mall remains **derivable** through
`contract → unit → mallId`, and the controller for the manual route does validate
mall access on the way in (`extractAndValidateMallAccess({ contractId })`). The
row is not ownerless — it is un-filterable by its own column, which matters for
every query that scopes on `Invoice.mallId` directly. That is a Phase 6 question,
and `ai.service.ts:203-207` shows at least one query already reasoning about it
explicitly and failing closed.

The SAP payload used to send `mallId: invoice.mallId` verbatim, so an invoice
from either path posted with `mallId: null`. Since SAP-001 the outbound mall is
resolved (`Invoice.mallId`, else `Contract → Unit`) and an unresolvable or
inconsistent mall fails closed before transmission, so a null mall can no longer
leave the platform. The nullable column itself is unchanged and remains a
Phase 6 query-scoping question.
