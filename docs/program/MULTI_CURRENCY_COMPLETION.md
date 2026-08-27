# Multi-Currency Foundation -- Completion

**Date:** 2026-08-20 · commit `c61fdb9` · RC3 (see `docs/golive/RELEASE_CANDIDATE.md`)

## Summary

Audit: `docs/program/MULTI_CURRENCY_AUDIT.md` -- found the core leasing
lifecycle (Booking/Contract/BillingScheduleEntry/Invoice/Payment) had
essentially no currency tracking, and confirmed a live bug where
Proposal->Contract conversion silently dropped whatever currency the
Proposal was quoted in.

Architecture: `docs/program/MULTI_CURRENCY_ARCHITECTURE.md` -- a
`CurrencyCode` enum (matching this schema's existing all-enum convention for
closed-set values, not a new master-data table), explicit REFERENCE/
SNAPSHOT/DERIVED propagation rules for each lifecycle edge, and a deliberately
bounded scope.

Currencies enabled: VND, USD, MMK -- adding a 4th is one enum value + one
migration + one constants entry on each side, not a lifecycle-model redesign.

Company functional currency: not applicable -- this schema has no Company/
Organization model. Mall default currency: not added this pass; every
create path defaults to VND, identical to today's implicit behavior.

## Per-area status

**Booking:** `UnitBooking.currencyCode` added (`@default(VND)`),
`CreateBookingDto.currencyCode` optional. Not exposed in the booking-creation
UI dialog this pass (see Architecture doc's scoping note) -- stored
explicitly, defaults VND, no regression.

**Proposal:** `rentCurrency` retyped `String` -> `CurrencyCode` enum
(in-place cast, zero data loss -- every existing row was already `'VND'`).
Booking->Proposal conversion now inherits `booking.currencyCode` instead of
hardcoding `'VND'` when the caller doesn't override it.

**Contract:** `currencyCode` added, resolved server-side in
`ContractsService.create()` -- forced from `Proposal.rentCurrency` when
`proposalId` is set (closes the audit's silent-drop bug), otherwise from the
client's `currencyCode` (default VND). Added to `CONTRACT_AMENDMENT_ONLY_FIELDS`
(direct PATCH blocked once ACTIVE) and to `AMENDABLE_CONTRACT_FIELDS`
(changeable through the audited Amendment workflow, same tier as rent/cam/deposit).

**Billing:** `BillingScheduleEntry.currencyCode` derived from
`Contract.currencyCode` at schedule-build time, in both call sites
(`buildScheduleForContractUnsafe`'s upsert and `generateDueInvoices`'s
auto-invoicing).

**Invoice:** `currencyCode` derived from the source Contract at every
LEASE_CONTRACT-sourced creation path (`createInvoiceFromPending`,
`generateDueInvoices`, `calculateRevenueShare`, the ad-hoc `createInvoice`).
SERVICE_CONTRACT/PARKING/SHORT_TERM_BOOKING paths untouched -- fall through
to the VND default, correct today since those subsystems have no currency
selector.

**Payment:** `currencyCode` always forced to the invoice's, server-side.
An explicit mismatched `currencyCode` from the caller is rejected
(`BadRequestException`) -- no FX settlement exists to make a mismatch
meaningful.

**Reporting:** `DashboardService`'s revenue KPIs (`monthlyRevenue`,
`collectedRevenue`, `overdueAmount`, per-mall breakdown) now filter their
source `invoice.findMany` queries to `currencyCode: 'VND'` -- a USD/MMK
invoice is excluded rather than silently summed in. No fake mixed-currency
total. Full per-currency breakdown UI is backlog, not built this pass.

**Formatting:** `formatMoney(amount, currencyCode, locale?)` added on both
backend (`common/utils/format-money.ts`) and frontend (`lib/currency.ts`,
with `formatVND` in `lib/utils.ts` now delegating to it for its one existing
caller). Migrated: `ConvertBookingDialog`'s currency dropdown (now VND/USD/
MMK), `ProposalEditor`'s rent/fee formatter, `BillingPage`'s invoice-detail
panel and record-payment dialog, `contract-templates.service.ts`'s PDF
renderer, and the payment-balance validation message. The other ~55
pre-existing ad-hoc formatting call sites (audit §4) are untouched and still
VND-correct -- not rewritten this pass, not silently broken.

**Migration:** `docs/program/MULTI_CURRENCY_MIGRATION.md` -- hand-written
(Prisma's interactive-confirmation gate for the Proposal column type change
doesn't run non-interactively), verified safe against live data before
writing it, applied via `prisma migrate deploy`, `prisma migrate status`
confirms no drift.

**Reconciliation:** 4 new invariant checks in
`scripts/backbone-reconciliation.mjs` (Contract<->Proposal,
BillingScheduleEntry<->Contract, Invoice<->Contract, Payment<->Invoice
currency match). **17/17 clean**, run against the live dev database after
reseeding with real USD/MMK data -- not an empty-table false-clean.

**Tests:** `docs/program/MULTI_CURRENCY_TEST_MATRIX.md` -- 3 new/extended
spec files, positive matrix traced through real seeded+reconciled data for
all three currencies, negative matrix for the mismatch-rejection and
override-ignored cases. **69/69 suites, 368/368 tests** (baseline 67/67,
359/359).

**Build:** `npx tsc --noEmit` clean on both backend and frontend. `vite
build` clean (pre-existing >500kB chunk-size warning, unrelated to this
pass, not new).

**Backward compatibility:** No breaking API changes. Every new
`currencyCode` field defaults to `VND` and every existing caller that never
sends one gets exactly today's behavior. The one field that changed type
(`Proposal.rentCurrency`) kept its exact JSON wire representation (`"VND"`,
`"USD"`, ... are valid values of both the old free-text string and the new
enum) -- no frontend code that reads `p.rentCurrency` needed to change.

**Breaking changes:** None.

**Open risks / backlog** (all explicitly scoped out in the Architecture doc,
not silently skipped):
1. Float->Decimal migration for the ~130 existing money columns -- separate,
   much larger initiative, independent of currency.
2. ServiceContract/ServiceContractPayment/ParkingCustomerContract currency
   fields stay free-text `String`, not tightened to the enum.
3. No `Mall.defaultCurrency` -- every create path defaults VND explicitly
   today; adding a per-mall default is additive later.
4. Dashboard shows VND-only revenue KPIs (correctly excluding non-VND rather
   than mixing them in) -- a full per-currency breakdown widget is not built.
5. ~55 of the ~60 ad-hoc frontend/backend money-formatting call sites found
   by the audit were not migrated to the central formatter (they're still
   correct for VND, just not yet currency-aware for the few USD/MMK records
   that will now exist).
6. No booking-creation UI currency selector (stored explicitly server-side,
   defaults VND, matches audit's documented scoping decision).

## UAT impact

This is a real financial-domain change to code, not a docs/tooling-only
commit (unlike RC2) -- per this program's own change-control rule, it is a
new Release Candidate: **RC3**, superseding RC2. Per spec §46, human UAT
should re-test Booking, Proposal, Contract, Billing, Invoice, Payment, and
Reports with at least VND, USD, and MMK before this reaches production --
the automated matrix above covers the propagation/rejection logic
end-to-end, but has not been exercised through the actual browser UI by a
human.

## GO-LIVE STATUS

**NOT READY FOR PRODUCTION** -- unchanged from RC2's verdict
(`docs/golive/FINAL_PRODUCTION_READINESS.md`: NO-GO), for the same
pre-existing, unrelated operational blockers this program has never closed
(credential rotation, off-site DB backup, git-history remediation -- all
human/DevOps-owned, no system access from this environment). This pass adds
no new blocker to that list, but does add a new UAT-scope item (multi-currency
re-test, above) that should be completed before whoever owns go-live
re-evaluates readiness. See `docs/golive/RELEASE_CANDIDATE.md` for the RC3
designation and `docs/golive/GO_LIVE_BOARD.md`/`FINAL_GO_LIVE_MATRIX.md` for
the updated evidence pointers.
