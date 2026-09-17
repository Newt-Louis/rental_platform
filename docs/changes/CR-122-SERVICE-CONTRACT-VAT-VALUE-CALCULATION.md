# CR-122 — Service Contract pre-VAT value and VAT calculation

## CHANGE ID
CR-122

## BUSINESS REASON
Operators need to record the contractual value before VAT and its exact VAT
percentage separately, while every existing operational, reporting, and export
surface continues to use one consistent total contractual value.

## CURRENT BEHAVIOR
The create and edit forms accept one ambiguous `totalValue` amount. The API
trusts that client-supplied amount and `ServiceContract` has no record of the
pre-VAT value or the rate that produced it.

## EXPECTED BEHAVIOR
Create requires `initialValue` (value before VAT) and `VAT` (a percentage that
accepts fractional values such as `12.5` and `20.125`). The backend
authoritatively persists `totalValue = initialValue + initialValue * VAT / 100`.
The UI previews that result and sends `totalValue` only as a hidden calculated
field; it is never the authoritative input. Editing a monetary value requires
both inputs together. Existing records remain readable with their historic
`totalValue` and are not inferred or backfilled.

## PRIMARY DOMAIN
Service Contracts — Service Contract Consultant.

## AFFECTED JOURNEYS
BP-006 Service-Contract-to-Cash. Relevant baseline checks: GS-11 (VND),
GS-12 (USD where this Service Contract surface is supported), GS-13 (MMK where
supported), GS-14 (mixed-currency reporting), and GS-09 (Mall authorization,
unchanged but checked at the endpoint boundary).

## UPSTREAM IMPACT
The create/edit modal and any API client must supply the two contractual input
values. `defaultVatRate` remains the separate default for payment-schedule VAT
and is not an upstream source for this contract-level calculation.

## DOWNSTREAM IMPACT
`ServiceContract.totalValue` remains the downstream contract-value field for
the detail view, table, Excel export, and per-currency `stats()` aggregation.
Payment schedules retain their own `subtotal`, `vatRate`, `vatAmount`, and
`totalAmount` semantics. No Billing, Invoice, notification, SAP, or job code
is changed by this CR.

## DATA OWNERSHIP IMPACT
Only the Service Contracts domain writes its own `ServiceContract` row. No
foreign-domain table is written.

## STATE MACHINE IMPACT
N/A — no status, transition, or lifecycle rule changes.

## FINANCIAL IMPACT
Canonical owner: `ServiceContractsService`. Formula order is exactly
`initialValue + (initialValue * VAT / 100)`. `VAT` is stored as the entered
percentage, not its decimal fraction. The existing model and `totalValue` use
PostgreSQL `DOUBLE PRECISION`/Prisma `Float`; this CR adds no rounding rule or
currency conversion, avoiding a silent change to historic precision behavior.
The frontend calculation is preview-only; the backend recomputes and ignores
a forged client total.

## CURRENCY IMPACT
The amount remains in the record's own `ServiceContract.currency`; it is not
derived from locale or Mall configuration. No FX or cross-currency sum is
introduced. Existing stats group `totalValue` by currency, and display uses the
record currency. Service Contracts' broader free-text-currency limitations and
the existing Billing currency propagation gap are explicitly out of scope.

## MALL/COMPANY IMPACT
No Mall selection, cross-Mall visibility, or aggregation behavior changes.

## TENANT IMPACT
N/A — no Tenant Portal endpoint or display changes.

## AUTHORIZATION IMPACT
No controller, role, share permission, or Mall-scoping rule changes. The
existing create/update authorization remains the only entry point to the new
financial inputs.

## REPORTING IMPACT
Reports and Excel continue to use the persisted `totalValue`; no report is
asked to recalculate from the two components. Currency-bucketed statistics
remain the anti-mixed-currency aggregation boundary.

## TRANSACTION IMPACT
The calculation is performed before the existing create/update transaction and
is persisted in the same `serviceContract.create`/`update` write as the two
source fields. A database failure therefore creates no partial contract-value
state. Concurrent edits follow the pre-existing last-write-wins update model;
each accepted write always contains a self-consistent triplet.

## EVENT/JOB IMPACT
No event, scheduler, outbox, retry, or idempotency behavior changes. The
existing update audit event records the submitted source fields and resulting
persisted total.

## DOCUMENT IMPACT
The current contract Excel export continues to expose `totalValue` only. No
contract PDF template consumes this model today; adding a pre-VAT/VAT document
breakdown is out of scope.

## API IMPACT
`POST /service-contracts` now requires numeric `initialValue` and `VAT`.
`PATCH /service-contracts/:id` accepts them only as a pair. A client cannot
update `totalValue` alone; a supplied `totalValue` alongside both components
is ignored and recomputed on the server. Read responses gain nullable
`initialValue` and `VAT` through Prisma's normal model serialization.

## MIGRATION
Add nullable `DOUBLE PRECISION` columns `initialValue` and exact-case `VAT` to
`ServiceContract`. Nullable columns make the migration additive, short-lived,
and safe for existing rows. No backfill is performed because prior
`totalValue` could have been either VAT-inclusive or VAT-exclusive.

## BACKWARD COMPATIBILITY
Historic records preserve their value and render from `totalValue`; their new
source fields are NULL. New UI/API clients use the two inputs. Legacy clients
that write only `totalValue` receive a validation error rather than silently
breaking the new invariant.

## GOLDEN E2E SCENARIOS
Gate 1: DTO/service/unit and frontend tests, Prisma validation/generation,
backend and frontend type/build checks. Gate 2: create/update against the
local database with the migration applied. Gate 4: manual Service Contract
create smoke for VND, USD, and MMK where the local Service Contract form
allows them, confirming displayed and persisted total. GS-14 is checked by
the existing currency-bucketed stats test; no browser E2E harness is present.

## RECONCILIATION
For a newly created or edited contract, verify
`totalValue = initialValue + initialValue * VAT / 100` in the database and
detail/list/export views. Verify `stats()` returns separate currency buckets
rather than a combined total.

## ROLLBACK
Revert the UI/API enforcement to the prior total-only behavior if necessary;
the additive columns and historic rows remain intact. Do not drop populated
columns during an emergency application rollback.

## OPEN BUSINESS QUESTIONS
None. The requester explicitly specified percentage semantics and the formula.
No additional rounding is introduced beyond the existing `Float` storage
behavior; a future currency-specific rounding policy requires a separate
financial change request.

---

## Severity classification
Priority: P1 — Tier: 0 (contractual money calculation and persisted financial
value; scope is intentionally limited to the Service Contracts domain).

## Gate results
Gate 1 — PASS: `prisma validate`, Prisma Client generation, backend `nest
build`, frontend `tsc && vite build`, targeted backend suites (25 tests), and
the Service Contracts page suite (13 pass, 1 intentional pre-existing skip).

Gate 2 — PASS: migration applied successfully to the running local PostgreSQL
database; the Service Contract service tests prove create and update recompute
the total and reject a total-only update.

Gate 3 — N/A — no cross-module request/response contract is changed; existing
consumers retain `totalValue` as the persisted total.

Gate 4 — PARTIAL: the backend/frontend stack is healthy after recreation. A
browser-driven create flow for VND/USD/MMK was not run because this workspace
has no authenticated browser E2E harness configured for this page.

Gate 5 — N/A — no new multi-write step; the three value fields are one existing
Prisma create/update transaction. No failure-injection harness was available.

Gate 6 — N/A — this retains the existing single-record last-write-wins update
policy; no shared balance, inventory, or schedule generation is introduced.

Gate 7 — N/A — no endpoint, guard, Mall scope, or share rule changed; existing
authorization tests remain the boundary.

Gate 8 — PASS (automated): historic rows remain NULL for source fields without
altering their total; the currency-bucketed stats test remains green. A new
real UI-created row was deliberately not inserted into shared local data.

Gate 9 — PASS (automated): `totalValue` continues to be aggregated only by its
currency bucket, with no new mixed-currency sum.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Requester | User | 2026-09-17 | Requested scoped calculation and schema change |
| Implementation agent | Codex | 2026-09-17 | Impact map prepared; implementation follows this scope |
