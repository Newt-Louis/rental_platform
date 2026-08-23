# CR-109 Wave 2 — Dashboard/Reports/Analytics KPI Compliance

Applies Decision 4 (Dashboard/KPI compact display allowed, but currency must always be explicit and the full value must be available on hover) to Dashboard, Reports, and Analytics.

## New canonical formatter
`lib/currency.ts` gained `formatMoneyCompact(amount, currencyCode, locale)` — same compact `Intl.NumberFormat` style already used throughout the app, with the ISO currency code now always appended (e.g. `"5,2 Tr VND"`), never bare. No new independent formatter logic was introduced.

## Fixed (confirmed VND-only server-side, safe to label)
- **Dashboard**: `monthlyRevenue`/`overdueAmount` StatCards + `BillingProgress` breakdown rows — now `formatMoneyCompact(n, 'VND')` with a `valueTitle`/`title` tooltip showing the full `formatMoney(n, 'VND')` value. Labels append "(VND)" (matches Billing's existing accepted pattern).
- **Reports — Revenue / Revenue-Receivables**: chart axis + tooltip now use the canonical formatters (tooltip shows the full value, not a rounded fraction). KPI cards and the by-type breakdown get the same compact+tooltip+"(VND)" treatment.
- **Reports — AR Aging table**: this is a genuine per-tenant financial table, not a KPI — upgraded to Rule 1 (full value via `formatMoneyAmount`, using each row's own `currencyCode`, new Currency column, `min-w-[900px]`+`overflow-x-auto` since it previously clipped instead of scrolling).
- **Analytics — vacancy-loss StatCard, Multi-Mall comparison table**: both confirmed VND-scoped server-side (`compliance.service.ts` explicitly filters `currencyCode: 'VND'`). Multi-Mall table treated as a real table (Rule 1: full value via `formatMoneyAmount`, column header states "(VND)" once since every row is guaranteed VND by the query, no per-row Currency column needed).

## Found and deliberately left untouched — newly-discovered mixed-currency bugs
Verifying each site's backend query before labeling it surfaced **three previously-undocumented instances** of the same bug class as the already-tracked CRM pipeline mixed-currency sum (Decision 5):

| Site | Backend source | Bug |
|---|---|---|
| Reports Pipeline badge (`ReportsPage.tsx`, proposal value by status) | `reports.service.ts` `pipelineReport()` | `proposal.groupBy(..., _sum: { totalContractValue: true })` has no `currencyCode` filter — sums VND/USD/MMK proposals together |
| Analytics "Doanh thu rủi ro" StatCard | `renewal-risk.service.ts` | `contract.rent` summed across at-risk contracts with no currency filter |
| CRM Overview "Pipeline Value" KPI | `crm.service.ts` | `lead.estimatedValue`/`expectedRent*expectedArea` summed with no currency filter — `Lead` has no currency field at all |

None of these were touched. Labeling any of them "VND" would be factually wrong (a false claim), and the actual fix is a backend query change — explicitly out of scope for this UI-only wave. Left in their pre-Wave-2 state (still abbreviated), same as the already-tracked CRM pipeline bug, and reported here as new findings for a future correctness CR — not fixed silently.

## Regression
`tsc --noEmit`: clean (excluding a large, active, unrelated concurrent edit to the Bookings feature present in this shared working tree throughout — confirmed zero overlap with this diff). `vite build`: clean. `git diff --check`: clean. Vitest: 32/33 files, 205/214 tests — identical to the Wave 1 baseline (9 pre-existing `BookingsPage` failures only).

## Files changed
`lib/currency.ts`, `locales/{en,vi}/dashboard.json`, `locales/{en,vi}/reports.json`, `pages/dashboard/DashboardPage.tsx`, `pages/reports/ReportsPage.tsx`, `pages/analytics/AnalyticsDashboard.tsx`. No backend/schema/API changes.
