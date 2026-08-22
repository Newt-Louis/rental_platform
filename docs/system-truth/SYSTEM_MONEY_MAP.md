# System Truth — System Money Map

## Money entry points

| Entry point | Module | Currency captured how |
|---|---|---|
| Contract creation (direct or via Proposal conversion) | Contracts/Proposals | `currencyCode` resolved from Proposal's `rentCurrency` when linked, else `dto.currencyCode ?? 'VND'` — verified correct, no gap |
| Booking creation | Booking | `dto.currencyCode ?? 'VND'` |
| Invoice creation (4 sources) | Billing | Derived from Contract (lease), payment record (service contract — **bug**, see below), hardcoded VND (parking, short-term booking — documented gaps) |
| Parking contract creation | Parking | Free-text `.currency` field, default "VND", **never read downstream** |
| Service contract creation | Service Contracts | Free-text `.currency` field, default "VND" |
| Sales turnover submission | Sales | **No currency field exists at all** |
| Slot booking creation | Slots | **No currency field exists at all** |

## Money storage points — currency-aware vs. not

| Entity.field | Currency stored alongside? |
|---|---|
| Contract.rent/.cam/.deposit/.depositLease/.depositFitout/.fitoutFee/.utilityFee/.afterHoursFee | **Yes** — `Contract.currencyCode` enum |
| BillingScheduleEntry.rentAmount/.camAmount/.subtotal | **Yes** — derived from Contract at build time |
| Invoice.subtotal/.vatAmount/.totalAmount/.adjustmentAmount/.refundedAmount | **Yes** — `.currencyCode` enum, but population is inconsistent (see gaps) |
| Payment.amount | **Yes** — server-enforced equal to invoice's currency |
| ParkingCustomerContract.depositAmount | Field exists as free-text `.currency` String, **never read** |
| ParkingMonthlyStatement/.Line/.DebtPayment | **No** — no currency field on these models at all |
| ServiceContract.totalValue, ServiceContractPayment.amount/.subtotal/.vatAmount/.totalAmount | Field exists (free-text `.currency` String) but **dropped on one of two invoice-creation paths** |
| SalesTurnover.grossSales/.netSales | **No** — no currency field at all |
| UnitSlot rates, SlotBooking.baseAmount/.totalAmount | **No** — no currency field at all |
| Parking-gate external MSSQL amounts | **No** — external system, no currency concept, computed opaquely in SQL Server stored procs |

## Money transformation points (formula duplication — see `12-FINANCIAL-SEMANTICS.md` for full detail)

"Outstanding/paid balance" is independently implemented **6 times** within Billing alone. "Collected revenue"/"occupancy rate" are independently implemented **5-7 times** across Dashboard/Reports/Analytics/Compliance/AI. This is the platform's single largest data-lineage risk.

## Money display points

Billing's own UI (`BillingPage.tsx`) is mostly currency-aware except one totals row (hardcoded VND). Parking, Sales, and Slots frontend pages hardcode VND/₫/vi-VN formatting — consistent with their underlying models having no currency field, but meaning the display layer offers no forward-compatibility if those models are later made currency-aware.

## Money export points

Billing's Excel export has **no currency column at all**. Parking-gate transaction exports are VND-only by design (external system). No export found includes a currency column consistently for a mixed-currency mall.

## Diagram (narrative, in lieu of rendered diagram — construct visually in a follow-up pass)

```text
Booking.currencyCode ──> Proposal.rentCurrency ──> Contract.currencyCode ──> BillingScheduleEntry.currencyCode ──> Invoice.currencyCode (LEASE_CONTRACT source)
                                                                                                                  ╲
ParkingCustomerContract.currency (unused) ─────────────────────────────────────────> Invoice.currencyCode = 'VND' (hardcoded, documented)
ServiceContractPayment.currency ──> [PATH A: billing.service.ts createInvoiceFromPending] ──> Invoice.currencyCode = toCurrencyCode(payment.currency)  ✓ correct
                                 ╲─> [PATH B: service-contracts.service.ts transferPaymentToBilling] ──> Invoice.currencyCode = <unset, defaults VND>  ✗ BUG
SlotBooking (no currency field) ──> Invoice.currencyCode = 'VND' (hardcoded, documented)
SalesTurnover.grossSales (no currency field) ──> Billing.calculateRevenueShare(sale, contract.rent[currencyCode]) ──> potential unit mismatch if contract non-VND
```

Every display/export downstream of the two `✗`-marked paths above cannot be traced back to a currency-correct entry point — this is the concrete instance of the "display/export that can't be traced to a verified entry point is a finding" rule from the template.
