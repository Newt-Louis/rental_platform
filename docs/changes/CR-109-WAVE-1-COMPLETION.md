# CR-109 Wave 1 — Money Display Standardization Completion

Implements the human-approved Wave 1 authorization: swap already-currency-aware abbreviating/imprecise local formatters onto the canonical `lib/currency.ts` → `formatMoney()`, make currency explicitly visible per Decision 2/3, in Proposals/Approvals/Contracts/Billing/Tenant Portal plus two additional audit-confirmed sites (Tenants, Service Contracts) satisfying both Wave 1 criteria (authoritative currency exists, no schema/business decision required).

## Verification method (per site, before editing)
For every site, traced DB model → API response field → frontend type → component prop before touching the display, per the authorization's explicit process requirement. This caught two sites that looked Wave-1-eligible from the original audit but were not:
- `BookingDetailSheet.tsx:366` (Unit's `baseRentPerSqm`) — **not touched**. `Unit` has no currency field at all (a currency-less domain per the audit, Decision 6) — the hardcoded `₫` here is not a "currency ignored" bug, it's the only value the schema currently supports.
- `bookings-constants.ts`'s shared `fmt`/`fmtMoney` — **not touched**, because the same functions are also used by Slots (also currency-less) — modifying the shared file would reach into an explicitly out-of-scope domain.

## Sites changed

| Module | File | What changed |
|---|---|---|
| Proposals | `ProposalsPage.tsx` | Table: `fmt()` (compact) → `formatMoney` for monthlyRent/totalContractValue, + new Currency column. Detail sheet: one remaining abbreviated field (`totalContractValue`) fixed, + currency badge added to Financials section header. Removed the now-dead `fmt()` abbreviator. |
| Proposals | `ProposalScenariosPanel` (same file) | `terms.*` fields were bare `.toLocaleString()` with **zero currency indication** — worse than abbreviation. Now use `formatMoney(v, rentCurrency)` (scenarios share their parent Proposal's currency by schema — no separate currency field exists on `ProposalScenario`, confirmed via Prisma schema). Added currency badge to the panel header; threaded `rentCurrency` down as a new prop from the caller. |
| Approvals | `ApprovalsPage.tsx` | Detail sheet: 3 abbreviated fields → `formatMoney`, currency badge added to Financials section header. Table: 2 abbreviated cells → `formatMoney`, + new Currency column. Removed the now-dead `fmt()` abbreviator. Left `fmtPrice()` (category-pricing floor/ceiling comparison) untouched — VND-only by a separate, already-existing architecture decision (`CategoryPricing` has no currency field), not abbreviated, not a Decision-1 violation. |
| Contracts | `ContractsPage.tsx` | **Found and fixed a latent precision bug while verifying**: `fmtCurrency()` used raw `Intl.NumberFormat('vi-VN').format()` with no explicit decimal-digit config — would have shown wrong decimal places for USD/MMK even though it wasn't abbreviating. Redefined `fmtCurrency` to delegate to `formatMoney`, fixing all 13 existing call sites (detail sheet rent/CAM/deposit/billing-schedule/termination fields) at once. List table: compact `Intl` call → `formatMoney`, + new Currency column. Added currency badge to detail sheet's Financials section header. |
| Billing | `BillingPage.tsx` | Pending-revenue table (3 cells) and invoice list table (3 cells): `fmtCompactCur()` (compact) → `fmtMoney` (already the correct `formatMoney` alias). Added a Currency column to both tables. Removed the now-dead `fmtCompactCur()`. Left `fmtCompact()` and its 4 remaining call sites untouched — those are Dashboard/KPI-style aggregate headers (e.g. "AR Outstanding"), explicitly Wave 2 scope, not transactional table cells. |
| Tenant Portal | `TenantPortalPage.tsx` | **Found and fixed a second latent precision bug**: `fmtFull()` had the same raw-`Intl`-no-decimal-config bug as Contracts' old `fmtCurrency`. Redefined to delegate to `formatMoney`. Primary invoice table: abbreviated `fmt()` → `fmtFull`, + new Currency column. Contract card rent: same fix. "Tổng chờ thanh toán" KPI card: this is a genuine Dashboard/KPI-style compact-eligible element (Decision 4), already deliberately VND-only-by-design (documented in-code) — kept full-value per Tenant Portal being a primary target area, and added an explicit "(VND)" label since the aggregate silently excludes any non-VND invoices. Removed the now-dead `fmt()`. |
| Tenants | `TenantsPage.tsx` | Two raw inline `Intl.NumberFormat(..., {notation:'compact'})` + hardcoded `đ` calls (contract rent, invoice total) — both had an actual `currencyCode` available on the row and simply weren't using it. Fixed to `fmtMoney(value, row.currencyCode)`. Redefined `fmtMoney` to delegate to `formatMoney` (removes its own compact notation). |
| Service Contracts | `ServiceContractsPage.tsx` | One-line gap: the "Đã thanh toán" (paid) amount rendered without its `currency` suffix, one line above the due-amount row which already correctly showed it. Added the missing `{p.currency}`. |
| i18n | `locales/{en,vi}/common.json` | Added `labels.currency` = "Currency"/"Tiền tệ", reused by every new Currency column header instead of ad-hoc inline strings. |

## Sites explicitly skipped (with reason)

| Site | Reason |
|---|---|
| Dashboard KPI cards, Reports charts/AR-Aging, Analytics StatCards/Multi-Mall table, CRM Overview Pipeline KPI | Wave 2 — explicit "Do NOT... redesign Dashboard financial semantics" |
| CRM Kanban deal-value badge, CRM pipeline total | The pipeline total is the confirmed cross-currency-sum bug — Decision 5 explicitly requires a separate correctness CR, not a Wave 1 fix |
| Sales `grossSales`, Spaces/Unit rent fields, Slots rate fields, Parking (statement/line/payment amounts + the ignored contract-level `.currency`), Inventory, Fitout Change Orders (ignored `.currency`) | Currency-less or currency-ignored-by-schema-gap domains — Decision 6 explicitly forbids adding fields/migrations or inventing currency ownership in Wave 1 |
| SAP reconciliation view | Not in the primary target list; also a cross-system comparison view, not a standard transactional table |

## Local formatters removed
`ProposalsPage.tsx`'s `fmt()`, `ApprovalsPage.tsx`'s `fmt()`, `BillingPage.tsx`'s `fmtCompactCur()`, `TenantPortalPage.tsx`'s `fmt()` — all abbreviating, now dead code, deleted. `ContractsPage.tsx`'s `fmtCurrency`, `TenantPortalPage.tsx`'s `fmtFull`, `TenantsPage.tsx`'s `fmtMoney` — kept their names (minimizing diff across their existing call sites) but rewritten to delegate to the canonical `formatMoney` instead of a raw `Intl.NumberFormat` re-implementation.

## Canonical `formatMoney` usage
All 7 touched files now route every in-scope amount through `lib/currency.ts`'s `formatMoney()`, either directly or via a same-named thin wrapper. No new independent formatter was created anywhere.

## Amount / Currency columns
Right-aligned amount cells, `whitespace-nowrap` added to every touched cell to prevent line-wrapping now that full (longer) values are shown. New left-aligned "Currency"/"Tiền tệ" text columns added to: Proposals table, Approvals table, Contracts list table, Billing pending-revenue table, Billing invoice list table, Tenant Portal invoice table — every one of these is a cross-record table with no business-invariant guarantee of a single shared currency. Single-record detail views (Proposal/Approval/Contract detail sheets, Proposal scenario comparison panel) instead got **one** currency badge at the section/panel header, per Decision 3 — no repeated per-field currency column was added there.

## VND / USD / MMK verification
Verified directly against the authorization's 6 representative values using the exact `formatMoney` logic:

| Input | Output |
|---|---|
| VND 5,000,000 | `5.000.000 ₫` |
| VND 12,500,000,000 | `12.500.000.000 ₫` |
| USD 2,500.00 | `2.500,00 US$` |
| USD 1,250,000.25 | `1.250.000,25 US$` |
| MMK 1,250,000.00 | `1.250.000,00 MMK` |
| MMK 250,000,000.50 | `250.000.000,50 MMK` |

All correct: full value, correct decimal places per the authoritative `CURRENCIES` config, unambiguous currency display (vi-VN locale renders MMK's currency-style output as the literal text "MMK", not the bare "K" symbol some initial internal caution had speculated about — verified empirically, not assumed).

## Sorting
No table in the Wave 1 scope has a sortable column at all (every table in these six modules is a hand-rolled `<table>`, not a data-grid component) — confirmed by the original audit and re-confirmed while editing. Nothing to regress; "sort by raw value" has no current implementation to violate.

## Responsive layout
Not visually verified in a browser this pass (no screenshot/browser tooling used). `whitespace-nowrap` was added defensively to every touched amount cell as the most likely new risk (full values are longer than the abbreviated ones they replace). **Recommend a human visual pass** across the touched screens at representative viewport widths before considering Wave 1 fully closed on the UI-review side — this is exactly what "NEXT: WAVE 1 HUMAN UI REVIEW" is for.

## API / Backend / Schema
No API contract changes. No backend files touched. No schema changes. No migration.

---

# CR-109 WAVE 1 COMPLETED

**Sites audited**: 9 files re-verified against fresh code (DB → API → frontend model → component) before any edit; 2 originally-flagged sites found to be out of scope on closer inspection (Bookings/Unit rent, Slots — both currency-less domains) and correctly skipped.

**Sites changed**: Proposals (table + detail + scenarios panel), Approvals (table + detail), Contracts (list table + detail), Billing (2 tables), Tenant Portal (table + contract card + KPI card), Tenants (2 cells), Service Contracts (1 line). 9 files total.

**Sites skipped**: Dashboard/Reports/Analytics/CRM-Overview (Wave 2), CRM pipeline-total bug (separate correctness CR per Decision 5), Sales/Spaces/Slots/Parking/Inventory/Fitout-ChangeOrders (currency-less or schema-gap domains, Decision 6), SAP reconciliation (not a primary target).

**Local formatters removed**: `ProposalsPage.fmt`, `ApprovalsPage.fmt`, `BillingPage.fmtCompactCur`, `TenantPortalPage.fmt` (all abbreviating). Three more (`ContractsPage.fmtCurrency`, `TenantPortalPage.fmtFull`, `TenantsPage.fmtMoney`) rewritten to delegate to the canonical formatter instead of reimplementing it — this incidentally fixed two previously-undiscovered decimal-precision bugs (neither respected the authoritative per-currency decimal-places config).

**Canonical formatMoney usage**: now the sole amount-rendering path in all 7 touched files.

**Amount columns**: right-aligned, full value, `whitespace-nowrap`.

**Currency columns**: added to 6 cross-record tables (Proposals, Approvals, Contracts, Billing ×2, Tenant Portal). Single-record detail views got one header-level badge instead, per Decision 3.

**VND**: PASS
**USD**: PASS
**MMK**: PASS

**Sorting**: N/A — no sortable amount column exists anywhere in Wave 1's scope (hand-rolled tables, confirmed).

**Responsive layout**: `whitespace-nowrap` applied defensively; full visual/viewport review not performed this pass (no browser tooling used) — recommended before final human sign-off.

**API changes**: NONE.

**Backend changes**: NONE.

**Schema**: UNCHANGED

**Migration**: NONE

**Regression**: Frontend `tsc --noEmit` clean. `vite build` clean (pre-existing chunk-size warning only). `git diff --check` clean. Vitest: 27/29 files, 215/225 tests passing. 10 failures = 9 pre-existing `BookingsPage.test.tsx` failures (unchanged, unrelated) + 1 newly-surfaced-but-pre-existing failure in `permissions.test.ts` (see Known issues below) — **zero failures attributable to Wave 1's own diff**, confirmed by direct file-level attribution (the failing tests touch neither `lib/permissions.ts` nor any of the 9 files this Wave changed). No frontend eslint config exists in this repo (lint is backend-only per `package.json`) — not applicable.

**Known issues discovered (out-of-scope, disclosed, not fixed)**:
1. `NAV_GROUPS` in `lib/permissions.ts` has a duplicate `module: 'ai'` across two nav items ("AI Assistant" and "Codebase Chat"), tripping the existing `permissions.test.ts` regression guard. Confirmed unrelated to Wave 1 (`git diff` shows zero changes to `permissions.ts` in this session) — it entered the shared working tree via a concurrent `Merge branch 'HUNG' into kyle` that landed mid-session while Wave 1 was in progress (this repository is under active concurrent development). Not a money-display issue; not fixed here.
2. An untracked file `docs/architecture-review/CR-BOOKING-UX-AUDIT.md` appeared in the working tree during this session, not authored by this work — likely concurrent work by another session/process sharing this repository. Not inspected or touched.
3. `.env.build`'s `IMAGE_TAG` changed during this session (`uat-21082026` → `uat-23082026`) — a build-tag bump, not authored by this work, unrelated.

**Out-of-scope findings**: none new beyond what the original CR-109 audit already surfaced (CRM mixed-currency sum bug, five currency-less domains, Dashboard/Reports/Analytics VND-only-silent-exclusion) — all correctly left untouched per Decisions 5/6.

## WAVE 1 STATUS: **PASS**

## NEXT: WAVE 1 HUMAN UI REVIEW

---

## Addendum — Final UI Review round (same session)

Human UI review found the 6 tables above were showing currency **twice** — once embedded in the Amount cell (via `formatMoney`'s `style: 'currency'`, e.g. `"5.000.000 ₫"`) and again in the new Currency column (`"VND"`). Per the corrected standard: a table with a dedicated Currency column must show the Amount cell as a **numeric value only**, currency stated exactly once, in its own column.

**Canonical fix (Rule 3)**: added `formatMoneyAmount(amount, currencyCode, locale)` to `lib/currency.ts`, alongside the existing `formatMoney`. Same authoritative `CURRENCIES.decimalPlaces` config, same `Intl.NumberFormat` call, just without `style: 'currency'` — no new formatting logic invented, no local re-implementation.

**Applied to exactly the 12 Amount cells inside the 6 tables that have a dedicated Currency column** (Proposals ×2, Approvals ×2, Contracts ×1, Billing pending-revenue ×3, Billing invoice list ×3, Tenant Portal ×1) — `formatMoney`/`fmtMoney`/`fmtFull` untouched everywhere else in the same files (invoice detail panels, contract detail sheets, scenario comparison panel, KPI cards) since those have no dedicated Currency column and Rule 2 permits (and these already have) inline "amount + currency" or a single header badge instead.

Verified against Rule 5's large-value matrix directly:

| Input | `formatMoneyAmount` output |
|---|---|
| VND 5,000,000 | `5.000.000` |
| VND 12,500,000,000 | `12.500.000.000` |
| VND 999,999,999,999 | `999.999.999.999` |
| USD 2,500.00 | `2.500,00` |
| USD 1,250,000.25 | `1.250.000,25` |
| MMK 1,250,000.00 | `1.250.000,00` |
| MMK 250,000,000.50 | `250.000.000,50` |

All numeric-only, correct decimal places, no abbreviation, no currency decoration.

**Regression after this round**: `tsc --noEmit` clean, `vite build` clean, `git diff --check` clean, vitest 27/29 files / 215/225 tests — identical to the pre-addendum baseline (9 pre-existing `BookingsPage` + 1 pre-existing-but-unrelated `permissions.test.ts` `NAV_GROUPS` duplicate-module failure, still confirmed untouched by this work). Zero new regressions.

**Not done this round** (explicitly out of scope per the review authorization): no re-audit, no Wave 2, no backend/schema/API change, no fix to the `NAV_GROUPS` duplicate-`ai`-module issue or any other out-of-scope item, no browser/viewport visual verification, no commit.
