# 36 — CR-109 Money Display Standardization — Audit (Discovery Phase)

Audit only. No code changed. Per `AGENTS.md`'s "NO IMPACT MAP → NO CODE" rule and the `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md` Tier-0 classification of money/currency fields, this document is the required Impact Map precursor before any implementation of CR-109 is authorized.

## 0. Classification

**UI/UX CHANGE + FINANCIAL PRESENTATION STANDARD + CROSS-MODULE CHANGE** — confirmed. Touches display logic in 15+ frontend modules and read paths in 6+ backend modules. Per `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`, money/currency is a Tier-0 concern; per `docs/system-truth/SYSTEM_MONEY_MAP.md` and `16-MULTI-CURRENCY-SEMANTICS.md` (pre-existing System Truth, re-verified in part this session — see corrections below), several of the modules this CR touches have **pre-existing, independently-tracked currency-data-model gaps** that this CR must not silently resolve (per the authorization's own Section 18 instruction).

## 1. Method

Discovery was run via 4 parallel evidence-gathering passes across the full frontend (`apps/frontend/src`) and the relevant backend read paths (`apps/backend/src`), each required to cite file:line and actual code, not impressions. Findings below are consolidated and cross-checked against `docs/system-truth/SYSTEM_MONEY_MAP.md`/`16-MULTI-CURRENCY-SEMANTICS.md` — agreements are noted as confirmed, and one place where this session found stronger/different evidence is flagged as a correction, not silently overwritten.

## 2. The one correct, centralized formatter — and how little it's used

`apps/frontend/src/lib/currency.ts` exports `formatMoney(amount, currencyCode, locale)`:
```ts
export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  VND: { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0, isActive: true },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isActive: true },
  MMK: { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', decimalPlaces: 2, isActive: true },
};
export function formatMoney(amount, currencyCode = 'VND', locale = 'vi-VN'): string {
  ...
  return new Intl.NumberFormat(locale, { style: 'currency', currency: meta.code, minimumFractionDigits: meta.decimalPlaces, maximumFractionDigits: meta.decimalPlaces }).format(amount);
}
```
This is correct, non-abbreviating, and currency-aware. It is **mirrored identically** in `apps/backend/src/common/constants/currency.constants.ts` with an explicit "keep both in sync" comment — **this is the authoritative decimal-precision configuration the business requirement's Section 6 asks about.** `VND=0, USD=2, MMK=2` decimal places are not hardcoded assumptions to be re-litigated; they are the single source of truth, already correctly shared frontend/backend. **No business/architecture confirmation is needed for decimal precision** — Section 6's `BUSINESS/ARCHITECTURE CONFIRMATION REQUIRED` fallback does not apply here. (Note this corrects a possible naive assumption in the original request's own illustrative example, which assumed `MMK = 0`; the authoritative value is `MMK = 2`.)

**`formatMoney` is imported in only 4 frontend files** (`lib/utils.ts`, `pages/billing/BillingPage.tsx`, `pages/proposals/ProposalsPage.tsx` (as `fmtFull`), `pages/bookings/BookingDetailSheet.tsx`) — roughly 12 call sites total. Every other money display on the platform is produced by one of **~20 independent, locally-defined formatter implementations**, most of which either abbreviate, hardcode a currency, or both.

## 3. Independent formatters found (confirms the request's suspicion — Section 2)

| Formatter | File | Behavior | Currency-aware? |
|---|---|---|---|
| `fmt()` | `pages/bookings/bookings-constants.ts:36-38` | `Intl.NumberFormat('vi-VN',{notation:'compact'})` | No — no currency param at all |
| `fmtMoney()` | `bookings-constants.ts:40-43` | Full precision, but hardcodes `+ ' ₫'` | No |
| local `fmtMoney()` | `pages/reports/ReportsPage.tsx:229-231` | Compact + hardcoded `' đ'` | No |
| inline `/1e6`, `/1e9` | `ReportsPage.tsx:119-120,173` | Chart axis/tooltip/badge — `'M'`/`'B'` with no or hardcoded currency | No (one has zero unit at all) |
| inline `/1_000_000` (×3) | `pages/analytics/AnalyticsDashboard.tsx:92,208,323` | StatCards + comparison table | No — currency only in separate subtitle text or column header |
| `formatCompactValue()` | `pages/crm/CrmPage.tsx:110-115` | Manual B/M/K, English units in a Vietnamese UI | No — no currency indicator of any kind |
| `formatCompactVnd()` | `pages/crm/CrmOverviewPage.tsx:22-24` | Compact + hardcoded `₫` | No |
| `fmt()` | `pages/proposals/ProposalsPage.tsx:43-46` | Compact | Partially — reads `rentCurrency` for the symbol, but still abbreviates |
| `fmt()`/`fmtPrice()` | `pages/approvals/ApprovalsPage.tsx:28-31,206-211` | Compact / raw | Partially |
| `fmtCurrency()` | `pages/contracts/ContractsPage.tsx:75-78` | Full, but raw `Intl` + manual symbol lookup, not `formatMoney` | Yes (`detail.currencyCode`) |
| inline compact | `ContractsPage.tsx:1383` (list table) | Abbreviated, currency code appended as text | Partially |
| `fmtMoney()` (=formatMoney, aliased) | `pages/billing/BillingPage.tsx:82-84` | Correct | Yes |
| `fmtCompactCur()` | `BillingPage.tsx:92-93` | Compact | Yes (but abbreviates) |
| `fmtMoney()` | `pages/spaces/spaces.constants.tsx:84-85` | Full, hardcoded `₫/m²` | No |
| raw `toLocaleString` | `components/spaces/UnitCard.tsx:65` | Hardcoded `₫` | No |
| `Intl...currency:'VND'` (hardcoded) | `components/fitout/RiskChangeControl.tsx:27` | Full, hardcoded VND | No — ignores the model's own `currency` field |
| `money()` | `pages/inventory/InventoryPage.tsx:64-69` | Full, hardcoded VND | No (model has no currency field) |
| `money()` | `pages/parking/ParkingPage.tsx:63-68` | Full, hardcoded VND | No — ignores `ParkingCustomerContract.currency` where it exists |
| `fmt()` | `pages/sales/SalesPage.tsx:29-31` | **Compact + hardcoded "VNĐ"** | No (model has no currency field) |
| `fmtMoney()` | `pages/tenants/TenantsPage.tsx:53-56` | Compact, but reads `currencyCode` | Partially |
| raw inline compact | `TenantsPage.tsx:588,623` | Abbreviated, hardcoded `đ` | No |
| `fmt()` / `fmtFull()` | `pages/tenant-portal/TenantPortalPage.tsx:67-74` | Compact / full — **both correctly currency-aware**, but the compact one is used on the primary invoice table | Yes |
| raw `toLocaleString` | `pages/sap/SapPage.tsx:232,234` | No currency shown at all | No |

Backend text-formatting paths that also bypass the backend's own mirrored `formatMoney` and reach the user (notifications/AI/PDF), all hardcoding "VNĐ"/"VND" regardless of actual currency except the one exception noted: `ai.service.ts:216-217,235`, `notifications/email.service.ts:186-252`, `billing/ar-dunning.service.ts:94`, `billing.service.ts:1428,1432` (revenue-share notes), `booking.service.ts:516,545` (activity notes). **Exception**: `proposals/proposal-pdf.service.ts:42-43` does branch on `cur === 'USD'` vs VND — the most currency-aware backend text formatter found, still not using the shared constant.

## 4. Abbreviated displays found (Section 2/3, confirmed violations)

18 distinct call sites/components render abbreviated money (`K`/`M`/`B`/`tr`/`Tỷ`/compact `Intl` notation) to an end user:

| # | Module | Screen | Classification | Severity |
|---|---|---|---|---|
| 1 | Dashboard | Main KPI cards (monthlyRevenue, collectedRevenue, overdueAmount) | E (KPI Card) | Dashboard-exception-eligible, but currently ambiguous (no currency, no full-value hover) |
| 2 | Reports | Revenue chart axis/tooltip | F (Chart) | Same — plus one spot has **zero currency unit at all** |
| 3 | Reports | Pipeline proposal-value badge | F | **Zero currency unit** — matches the explicitly prohibited pattern |
| 4 | Reports | **AR Aging table** (via local compact `fmtMoney`) | **B (Financial Table)** | **Highest severity** — a per-tenant amounts-due table abbreviating is exactly what the standard forbids |
| 5 | Analytics | Vacancy-loss StatCard | E | Currency only in subtitle, fragile |
| 6 | Analytics | At-risk-revenue StatCard | E | Same |
| 7 | Analytics | Multi-mall comparison table (revenue column) | **B** | Comparison table across Malls, no per-row currency, no hover |
| 8 | CRM | Kanban deal-value badge | A (Transactional card) | No currency indicator at all |
| 9 | CRM | Pipeline Value KPI (Overview) | E | Hardcoded VND assumption |
| 10 | Proposals | List table (monthlyRent, totalContractValue) | B | Detail sheet uses full `fmtFull`; **table is abbreviated, detail is not — internally inconsistent** |
| 11 | Approvals | Workflow table (monthlyRent, totalContractValue) | B | Same inconsistency pattern |
| 12 | Contracts | List table (rent column) | B | Currency appended as text, still abbreviated |
| 13 | Billing | Invoice list table + pending/dashboard rows | **A/B** | Detail view (`fmtMoney`) is correct; **list table is abbreviated** |
| 14 | Slots | Rate/amount fields (Create/Detail dialogs) | C/D | Reuses Booking's abbreviating `fmt()` |
| 15 | Sales | `grossSales` display | B | **Clearest violation** — abbreviated AND hardcoded currency AND the backing model has no currency field at all |
| 16 | Tenants | Contract-summary "fmtMoney" + 2 raw inline compacts | D | Currency-aware helper still abbreviates; raw inlines hardcode `đ` |
| 17 | Tenant Portal | **Primary invoice table row** + contract rent | **A** | Same file has a correct `fmtFull()` used elsewhere — inconsistency, and this is the screen real tenants use to check what they owe |
| 18 | Proposal Scenario comparison panel | Bare `.toLocaleString()`, **no currency symbol/code at all** | C (Detail form/comparison) | Worse than abbreviation — zero currency indication on the screen specifically designed to compare financial scenarios |

## 5. Tables requiring Amount + Currency (Section 5 design)

Per-table currency-invariant determination (do not add a repeated Currency column where the row is guaranteed single-currency by business invariant):

| Table | Same currency guaranteed per row? | Recommendation |
|---|---|---|
| Reports AR-Aging | No — cross-tenant, cross-contract | Each row already carries its own `currencyCode`; needs a **visible Currency column or per-row explicit code**, not just an inline symbol |
| Analytics Multi-Mall comparison | No — cross-Mall, potentially cross-currency | Same — needs explicit per-row currency, not a compact number under a generic column header |
| Proposals list, Approvals table, Contracts list, Billing invoice list | No — cross-record | Each row has its own `rentCurrency`/`currencyCode`; add an explicit Currency indicator per row (column or clearly-adjacent code, not just a symbol which is easy to misread, e.g. `$` vs `₫` at a glance) |
| Contract detail (single contract), its billing-schedule sub-table | **Yes** — one contract, one currency for its whole lifecycle | **Do not add a repeated Currency column here** — one currency label at the top of the detail view is correct and sufficient (already the pattern in `ContractsPage.tsx`'s detail sheet) |
| Tenant Portal invoice list (one tenant) | Not necessarily — a tenant could theoretically have contracts in different currencies over time, though typically one | Needs verification; if a tenant's own invoices are same-currency by business rule, one label suffices; if not, per-row currency is needed |
| Service Contracts table | No — cross-contract | Already correctly shows per-row `currency` as explicit text (reference pattern) |

## 6. Numeric presentation / decimal precision

**Resolved, no confirmation needed** (see §2). `CURRENCIES[code].decimalPlaces` is the single authoritative source, already correctly mirrored frontend/backend.

## 7/8/9. Alignment, sorting, filtering

Per Agent findings: **every table in Bookings/CRM/Proposals/Approvals/Contracts/Billing is a hand-rolled `<table>`, not a data-grid library** — none has a click-to-sort header at all today. This means "sort by raw value, not formatted string" (Section 8) is **currently moot** — there is no sortable amount column anywhere in these six modules to regress. If sortable tables are introduced as part of this standardization (reasonable, since full un-abbreviated numbers in a wide, unsorted table are harder to scan — partially motivating the "SAP information density" goal), sorting must be added against the raw numeric value from the start, not retrofitted later. Alignment (right-align amounts, left-align text) was not systematically audited this pass — recommend a follow-up visual pass once the formatter consolidation (Section 16) lands, since column layout should be designed once against the final component API, not twice.

## 10. Totals — mixed-currency risk

**One confirmed live bug, not previously tracked**: `pages/crm/CrmPage.tsx:1443-1444` sums `expectedRent * expectedArea` across **every** lead with zero currency grouping — a genuine cross-currency SUM bug, the exact pattern Section 10 prohibits. This is a **correctness bug**, not a pure display/formatting choice — recommend tracking as its own fix (see §12, Wave 3), not bundled silently into the display-standardization work.

**Reference pattern already in the codebase** (worth generalizing, not reinventing): `BillingPage.tsx`'s AR-Aging tab explicitly filters its grand-total row to VND only (`vndRows`, labeled "(VND)"), and separately calls out non-VND totals rather than summing them in — this is exactly the Section 10 target pattern, already built once. The Dashboard's KPI cards do the same (VND-only totals, explicit "(VND)" label, separate `nonVndCurrencies` breakout) — also a correct existing example.

**Open item, not a bug but a disclosure gap**: Dashboard/Reports/Analytics' backend queries filter to `currencyCode: 'VND'` server-side for every revenue aggregate (confirmed: `dashboard.service.ts:194-224,290-323`, `reports.service.ts:139,214,230-253`, `occupancy-analytics.service.ts:280-287`, `compliance.service.ts:202-209`) — this correctly avoids mixing, but **silently excludes** non-VND records from headline KPI numbers with **zero indication to the user** that the figure is VND-only. This is the same "undercounting, not mixing" risk already flagged in `docs/system-truth/16-MULTI-CURRENCY-SEMANTICS.md`'s cross-domain risk register — re-confirmed live this session, not resolved.

## 11. Dashboard exception — audited separately

Per Section 11's instruction, Dashboard/Analytics KPI cards/charts may stay compact, but must remain unambiguous (explicit currency + full-value on hover). **Current state fails both conditions everywhere checked**: Dashboard KPI cards, Analytics StatCards, Reports chart axis/tooltip, and CRM Overview's Pipeline Value KPI all lack an explicit attached currency code (relying on hardcoded VND, a separate subtitle, or nothing) and none offer a hover/title attribute revealing the exact full amount. This is a genuine, addressable gap distinct from the transactional-table abbreviation problem (§4) — dashboards don't need to switch to full numbers, they need to become unambiguous.

## 12. Input fields

No evidence found of the worst-case risk (formatted-comma-corrupted numeric submission, or a display format altering what's actually stored) in any of the create/edit dialogs the agents inspected (Booking, Slot, Contract amendment, Unit form). The gap found is narrower: some inputs (Contracts amendment `newRent`/`newCam`, Spaces `UnitFormFields`) show currency only as label text or not at all, rather than a symbol/code immediately adjacent to the input control. Spaces' gap is a backend-model consequence (`Unit` has no currency field at all), not fixable in the input UI alone.

## 13. Export / Report

| Export | Current state | Fix category |
|---|---|---|
| Service Contracts XLSX (`service-contracts.service.ts:105-166`) | **Correct reference pattern** — separate numeric column + separate `currency` text column, proper `numFmt` | None needed |
| Parking CSV (`receivablesCsv`/`vehiclesCsv`) | Raw numbers, **no currency column at all** | Blocked on the same backend model gap as §14 — the underlying `ParkingMonthlyStatement`/`Line`/`DebtPayment` records have no currency field to export |
| Billing invoice Excel export | Historically flagged as "no currency column at all" in `16-MULTI-CURRENCY-SEMANTICS.md`; **not re-verified this pass** — a recent commit (`fix(billing): prevent mixed-currency invoice summary totals`, already merged before this session) may have partially addressed the underlying aggregation bug this export shares a root cause with. Needs a fresh, targeted check before scoping Wave 1/5 work, not an assumption either way. |
| Inventory export | Not deep-inspected; `InventoryPage.tsx` hardcodes VND and the backing model has no currency field | Same category as Parking |

## 14. Module coverage

All 21 modules named in the request were inspected. Two categories emerged cleanly:
- **Has money, has a currency field, needs display-only fixes**: Bookings, CRM (proposal-linked figures), Proposals, Approvals, Contracts, Billing, Tenants, Tenant Portal, Service Contracts (mostly already correct), Fitout Change Orders (field exists, ignored), Parking contract deposit (field exists, ignored).
- **Has money, has NO currency field on the backend model at all — a UI fix alone cannot add what doesn't exist**: Spaces/Unit, Slots (UnitSlot/SlotBooking), Sales/SalesTurnover, Parking statements/lines/payments, Inventory. Work Orders and Tickets have no monetary field at all currently — not applicable.
- Dashboard/Reports/Analytics/AI/SAP: aggregate/cross-cutting views layered on top of the above; inherit whichever gap their underlying source data has, plus their own VND-only-filter disclosure gap (§10/§11).

## 15/16. Information density & canonical component

**One canonical presentation layer is recommended, built on the existing `formatMoney`/`CURRENCIES` foundation rather than inventing a parallel system** (per Section 16's explicit instruction to inspect existing architecture first — it already correctly owns decimal precision and currency metadata; it just needs (a) a second, deliberate "compact" mode for the Dashboard-exception case that still attaches an explicit currency and full-value title/tooltip, and (b) to actually be adopted at the ~20 sites currently bypassing it). Conceptually:

```ts
// extend lib/currency.ts, do not replace it
formatMoney(amount, currencyCode, { mode: 'full' | 'compact', locale? })
// mode: 'full' (default, current behavior) — every transactional/financial table, form, export, print
// mode: 'compact' — Dashboard/KPI/chart only; still renders an explicit currency code/symbol,
//   and the call site is responsible for setting a `title`/tooltip with the mode:'full' output
```
A thin `<MoneyAmount amount currency mode>` React component wrapping this is a reasonable pairing (centralizes the "compact needs a full-value title" rule so it can't be forgotten per call site) but is not strictly required if the team prefers a plain function call convention — this is an implementation-detail choice for the (not-yet-authorized) implementation phase, not a discovery-phase decision.

## 17. Backend contract

Every screen inventoried above that reads `currencyCode`/`rentCurrency`/`currency` from its API response does so correctly (no frontend currency-guessing found via locale/browser/user-language — the request's specific worry). The gap is the inverse: **several backend responses don't return a currency field at all**, either because (a) the underlying model has none (Spaces/Slots/Sales/Parking-statements/Inventory — a data-model gap, out of this CR's scope, already tracked in System Truth), or (b) the aggregate is deliberately VND-pre-filtered server-side with no disclosure (Dashboard/Reports/Analytics — §10/§11, a decision this CR can reasonably ask the business to make: add a currency-scope label to the response, or move to true per-currency aggregation like Billing's AR-Aging).

## 18. Multi-currency — explicit VND/USD/MMK verification

Re-confirms `docs/system-truth/16-MULTI-CURRENCY-SEMANTICS.md`'s existing findings for the core chain (Booking → Proposal → Contract → Billing → Invoice → Payment: **correctly currency-threaded end-to-end**, the platform's best-executed surface) and for Service Contracts/Parking/Sales/Slots (all pre-existing, independently-tracked gaps — **not** resolved or silently patched here, per Section 18's explicit instruction). One correction to that document: its `findAllInvoices()` "confirmed live mixing bug" claim was **not re-verified fresh this session** and may already be addressed by a merged commit predating this session (`fix(billing): prevent mixed-currency invoice summary totals`) — flagged as needing a fresh check, not asserted either way.

---

# ERP MONEY UI AUDIT COMPLETED

**Total money display sites**: ~50 distinct code locations catalogued across frontend + backend-generated text (18 abbreviation sites, ~20 independent formatter implementations, ~12 correct `formatMoney` sites, plus export/notification paths).

**Modules affected**: Dashboard, Reports, Analytics, CRM, Bookings, Slots, Proposals, Approvals, Contracts, Billing, Spaces, Fitout, Inventory, Parking, Sales, Tenants, Tenant Portal, Service Contracts, SAP, AI (text-only, non-abbreviated but hardcoded-currency), Work Orders/Tickets (not applicable — no monetary field).

**Abbreviated displays found**: 18 confirmed sites (§4) — most severe: Reports AR-Aging table, Analytics Multi-Mall table, Tenant Portal's primary invoice table, Sales `grossSales` (abbreviated + no currency field to even attach).

**Independent formatters found**: ~20 (§3) — the platform has no single canonical presentation layer in practice, despite one existing correctly at `lib/currency.ts`.

**Tables requiring Amount + Currency**: Reports AR-Aging, Analytics Multi-Mall comparison, Proposals list, Approvals table, Contracts list, Billing invoice list, Tenant Portal invoice list (pending same-currency-per-tenant verification). **Tables that should NOT get a repeated Currency column**: single-contract detail views and their sub-tables (one currency for the record's whole lifecycle, by business invariant).

**Forms requiring changes**: Contracts amendment inputs (currency as label text only), Spaces unit form (no currency field exists to show — blocked on schema). No data-corruption risk found in any input.

**Reports requiring changes**: `ReportsPage.tsx` (Revenue chart, Pipeline badge, AR-Aging), `AnalyticsDashboard.tsx` (Occupancy/Risk/MultiMall tabs).

**Exports requiring changes**: Parking CSV (blocked on schema gap), Inventory export (blocked on schema gap), Billing Excel export (status unverified fresh, needs re-check). Service Contracts XLSX is already the reference-correct pattern.

**Dashboards requiring separate treatment**: Dashboard KPI cards, Analytics StatCards, Reports chart axis/tooltip, CRM Overview Pipeline KPI — all eligible for the compact exception but currently fail the "unambiguous + full-value-on-hover" requirement.

**Missing API currency fields**: Dashboard/Reports/Analytics services (deliberate VND-only filter, no disclosure field); Spaces/Unit, Slots, Sales/SalesTurnover, Parking statements/lines/payments, Inventory (no currency column on the model at all — schema-level, pre-existing, tracked gaps).

**Multi-currency risks**: (1) **New finding** — `CrmPage.tsx:1443-1444` sums pipeline value across leads with zero currency grouping, a genuine mixed-currency SUM bug; (2) Dashboard/Reports/Analytics silently exclude non-VND records from headline KPIs with no disclosure (undercounting, not mixing — pre-existing, re-confirmed); (3) Billing invoice-summary mixing status needs a fresh check (possibly already fixed by a recent commit).

**Business confirmations**:
- Should Spaces/Slots/Sales/Parking-statements/Inventory models gain a real `currencyCode` field, or are they intentionally VND-only by design? (Pre-existing, independently tracked — e.g. `BC-007`-class questions in System Truth; this CR should not answer it, only note it blocks full compliance in those five modules.)
- For Dashboard/Reports/Analytics: should the VND-only aggregates gain an explicit "(VND only)" disclosure label (low effort), or should these move to true per-currency totals like Billing's AR-Aging (higher effort, more correct)?
- Is a tenant's full invoice history guaranteed single-currency by business rule (determines whether Tenant Portal's invoice table needs a repeated Currency column)?

**Architecture decision required: YES** — specifically for the five currency-less backend models (schema/business-intent decision, not a UI decision) and for the Dashboard/Reports/Analytics disclosure-vs-true-aggregation choice. Decimal precision (the request's own Section 6 concern) is **already resolved** by existing authoritative config — no decision needed there.

**Recommended implementation waves**:
1. **Display-only, already currency-aware, no backend change** — swap the ~14 abbreviating/duplicate formatters in Billing, Proposals, Approvals, Contracts, Tenants, Tenant Portal, Bookings onto the canonical `formatMoney` (full mode). Lowest risk, highest immediate compliance gain.
2. **Dashboard/Analytics/Reports compact-mode compliance** — add the explicit-currency + full-value-hover treatment; requires the canonical formatter's `compact` mode (§16) and a business decision on the VND-only disclosure question above.
3. **Bug fix, not a display change** — CRM pipeline cross-currency sum (`CrmPage.tsx:1443-1444`). Recommend its own small, explicitly-authorized fix, not bundled silently into Wave 1/2.
4. **Blocked on business/schema decision** — Spaces, Slots, Sales, Parking-statements, Inventory. No UI code change until the currency-field business question above is answered; interim minimum fix (if authorized separately) is "stop abbreviating the VND-only value," not "add a currency column that doesn't exist yet."
5. **Exports** — Parking/Inventory CSV (blocked with Wave 4), Billing Excel (needs fresh status check first).

**Regression scope**: Waves 1-3 are frontend display-logic changes (plus one CRM calculation fix in Wave 3) — expect visual-diff review across every touched screen, frontend vitest updates for touched pages, no schema/migration impact. Wave 2 requires backend DTO additions (a currency-scope field or per-currency breakdown) to Dashboard/Reports/Analytics responses — backend test updates required there. Wave 4 is blocked pending its own architecture decision and, if approved, would require a schema migration (out of a pure UI CR's scope per the original request's own Section 12 instruction).

## IMPLEMENTATION RECOMMENDATION: **CONFIRMATION REQUIRED**

Wave 1 is close to a pure, low-risk "PROCEED" once explicitly authorized (no open business question blocks it). Waves 2-5 each have at least one open business/architecture question (disclosure-vs-aggregation for Dashboard/Reports/Analytics; currency-field existence for 5 modules; whether the CRM bug fix should be scoped separately) that should be confirmed before implementation begins, per this CR's own Section 19 instruction not to implement until analysis is complete.
