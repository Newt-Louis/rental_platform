# CR-123 — Service Contract payment breakdown, recurring schedule and row editing

## CHANGE ID

CR-123

## BUSINESS REASON

Operators need a recurring payment schedule to be calculated from the
contractual pre-VAT value and VAT rate, while still being able to append a
non-taxable increase or reduction to a single payment.  Billing must continue
to receive one numeric amount for each payment row.

## CURRENT BEHAVIOR

Recurring schedules accept a manually entered amount and derive VAT from
`defaultVatRate`.  A `ServiceContractPayment` only has scalar `amount` and
`totalAmount`; `totalAmount` is consumed by Billing pending receivables and
invoice creation.  A row cannot be edited from the Service Contract detail UI.

## EXPECTED BEHAVIOR

For a new recurring schedule, the backend is authoritative:

```
subtotal      = ServiceContract.initialValue / count
vatRate       = ServiceContract.VAT
vatAmount     = subtotal * vatRate / 100
baseAmount    = subtotal + vatAmount
amountBreakdown = [baseAmount]
amount        = sum(amountBreakdown)
totalAmount   = sum(amountBreakdown)
```

The UI only previews the calculated per-period amount and cannot submit it as
an authoritative input.  Editing a row may update `milestone`, `dueDate`, and
`reminderDays`, and may append one signed adjustment to `amountBreakdown`.
An increase appends a positive number; a reduction appends a negative number.
Adjustments are never VAT-calculated again.  The one-off-payment form remains
an unrestricted scalar amount entry and does not derive an amount from the
contract.

## PRIMARY DOMAIN

Service Contracts — Service Contract Consultant.

## AFFECTED JOURNEYS

BP-006 Service-Contract-to-Cash.  Golden scenarios: GS-09 (Mall endpoint
access), GS-11 (VND), GS-12 (USD where supported), GS-13 (MMK where
supported), and GS-14 (no cross-currency aggregation).

## UPSTREAM IMPACT

`POST /service-contracts/:id/payments/recurring` no longer accepts a client
amount, subtotal, or VAT rate as the schedule source.  It requires that the
contract has both `initialValue` and `VAT`; legacy NULL values are not inferred
or backfilled.  The existing create-contract DTO already requires `VAT` for
new contracts; this CR keeps that boundary.

`PATCH /service-contracts/:id/payments/:itemId` gains a positive adjustment
value plus an `INCREASE`/`DECREASE` direction.  It does not accept a client
array or a forged scalar total.

## DOWNSTREAM IMPACT

`amount` and `totalAmount` remain scalar materializations because Billing
pending receivables and both Service-Contract-to-Invoice paths consume
`totalAmount`; they are not redundant.  `amountBreakdown` is the audit/source
array for rows created or adjusted by this feature.  PostgreSQL synchronizes
both scalar fields whenever this JSON array changes, before the write returns.
Billing, Invoice, reporting, and SAP continue to consume the scalar total and
are checked but not otherwise changed.

## DATA OWNERSHIP IMPACT

Only the Service Contracts domain writes `ServiceContractPayment`.  The
database trigger belongs to that table and is intentionally the final
invariant boundary for all writers, including future SQL/admin writers.

## STATE MACHINE / CONCURRENCY

No new status is introduced.  The existing prohibition remains: a payment
linked to an Invoice cannot change financial data or due date; users must
change the Invoice.  A payment update is a single row write.  Concurrent
append requests serialize on PostgreSQL's row update and each accepted update
uses the current stored JSON breakdown inside the same service write.

## FINANCIAL / CURRENCY IMPACT

Canonical formula owner: `ServiceContractsService`; database trigger owns only
the mechanical sum invariant.  VAT is the percent stored in `ServiceContract.VAT`
and the order of operations is the formula above.  Adjustments are already
tax-inclusive deltas supplied by the operator.  The current `Float` precision
is retained: no rounding, FX conversion, or historical currency inference is
introduced.  Every row uses its contract/payment currency; Billing retains its
existing per-row currency propagation behavior.

## MALL / TENANT / AUTHORIZATION IMPACT

No new endpoint or permission is introduced.  The existing controller's
`assertItemAccess(id, user, EDIT)` and service lookup constrained by
`contractId` remain the data-access boundary.  No Tenant Portal behavior
changes.

## REPORTING / RECONCILIATION IMPACT

Billing pending receivables and invoice creation use the synchronized scalar
`totalAmount`.  Confirm for a recurring row and after both adjustment signs:
`amount = totalAmount = sum(amountBreakdown)`, and the generated Billing
candidate/invoice total matches it in the same currency.

## MIGRATION AND BACKWARD COMPATIBILITY

Add nullable `JSONB amountBreakdown` and a `BEFORE INSERT OR UPDATE OF
amountBreakdown` trigger.  Existing rows remain `NULL`, preserving their
historic scalar `amount` and `totalAmount`; no backfill is made.  A legacy row
receiving its first adjustment is initialized from its current scalar amount.
The migration is additive and does not delete or reinterpret data.

## API / UI IMPACT

The recurring amount field becomes disabled and displays the calculated amount
after a valid number of periods is entered.  Each payment row gets a primary
"Chỉnh sửa" / "Lưu" control immediately left of the paid control, with inputs
for milestone, due date, reminder days, and one signed amount adjustment.
The UI displays the fresh server response after save.

## GOLDEN E2E SCENARIOS

1. Create a VND service contract with `initialValue=1,000,000`, `VAT=10`, and
   three monthly periods; verify each row has `subtotal`, `vatAmount`, first
   breakdown element, `amount`, and `totalAmount` from the formula.
2. Append +40,000 then -50,000 to one row; verify the JSON array and both
   scalar totals are `[..., 40000, -50000]` and the Billing candidate/invoice
   total equals their sum.
3. Edit milestone, due date and reminder days; refresh and verify persistence.
4. Verify an invoice-linked payment refuses financial/due-date changes and no
   scalar or JSON field changes.
5. Repeat schedule creation in supported USD/MMK records and verify no
   cross-currency aggregate is introduced.

## ROLLBACK

Revert application behavior while retaining the additive JSON column and
trigger.  Do not drop populated breakdown data during an emergency rollback.

## RESIDUAL RISK

The platform uses PostgreSQL `DOUBLE PRECISION` for these money fields, so a
non-terminating division such as one-third keeps existing floating precision.
No rounding rule was requested; this CR deliberately does not invent one.
