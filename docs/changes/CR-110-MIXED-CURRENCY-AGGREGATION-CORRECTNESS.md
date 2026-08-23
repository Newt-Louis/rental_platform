# CR-110 — Mixed-Currency Aggregation Correctness

Status: **COMPLETED**

## Problem

Following on from `CR-102`'s `INV-CUR-001` invariant (never sum amounts across different currencies without an FX engine), a self-audit of the 4 sites flagged during a prior money-display pass plus the same bug class in related modules found:

- **Confirmed defect 1** — `ReportsService.pipelineReport()` grouped `Proposal` by `status` only and summed `totalContractValue` with `_sum`, blending VND/USD/MMK proposals into one figure per status. Rendered on the Reports → Pipeline tab as a bare `"X.XB"` abbreviation with no currency at all.
- **Confirmed defect 2** — `RenewalRiskService.getRiskDashboard()` computed `atRiskMonthlyRevenue` via a blind `.reduce()` over CRITICAL/HIGH-risk contracts' `rent`, which is denominated per-contract in `contract.currencyCode` (VND/USD/MMK) — same blending defect, surfaced on Analytics → Renewal Risk's "Doanh thu rủi ro" KPI tile.
- **2 false positives corrected**: the CRM Kanban pipeline total (`CrmPage.tsx`) and the CRM Overview "Pipeline Value" KPI (`crm.service.ts`'s `totalPipelineValue`) both aggregate `Lead.expectedRent`/`estimatedValue` — fields with **no currency dimension on the schema at all** (confirmed via `CreateLeadDto` and `LeadEditDialog.tsx`, a bare `<Input type="number">` with no currency selector). Summing them is not a mixing bug; flagging them originally was a mistake in the earlier audit, corrected here rather than silently dropped.

## Root cause

Both confirmed defects follow the same pattern already seen and fixed once before in `CR-102` (`BillingService.findAllInvoices()`): a Prisma aggregation (`groupBy`/`.reduce()`) over a money field that has a real per-record currency column, written before that column was accounted for in the aggregation query/grouping.

## Fix

Both fixes mirror `CR-102`'s established `byCurrency` bucketing idiom rather than inventing a new pattern:

- **`reports.service.ts` — `pipelineReport()`**: `proposal.groupBy` now groups `by: ['status', 'rentCurrency']` (was `['status']`), with `_count: { _all: true }` and `_sum: { totalContractValue: true }`. The rows are re-aggregated in JS into `{ status, _count, valueByCurrency: Record<CurrencyCode, number> }[]` — `_count` sums safely across currencies (a proposal count, not a money amount); `valueByCurrency` never does. **Breaking, deliberate shape change**: the old `_sum.totalContractValue` field is gone, replaced by `valueByCurrency`, so any un-updated consumer breaks visibly instead of silently showing a now-differently-computed number under the old field name.
- **`renewal-risk.service.ts` — `getRiskDashboard()`**: added `currencyCode: true` to the `contract` select, replaced the `.reduce()` sum with a per-currency bucketing loop (defaulting a null `currencyCode` to `'VND'`), and renamed `summary.atRiskMonthlyRevenue` → `summary.atRiskMonthlyRevenueByCurrency` (same deliberate-break rationale as above).
- **`ReportsPage.tsx` — Pipeline tab**: renders one compact badge per currency present in `valueByCurrency` (via `formatMoneyCompact`), with the full value in a hover `title` (via `formatMoney`) — never a combined figure.
- **`AnalyticsDashboard.tsx` — "Doanh thu rủi ro" tile**: shows the largest currency's figure as the headline value (compact + full-value tooltip); if more than one currency is present, the others are listed in the subtitle rather than dropped. Added a `valueTitle` prop to this page's local `StatCard` to carry the tooltip.
- **`currency.ts`**: `formatMoneyAmount()` (numeric-only, for cells with a dedicated Currency column) and `formatMoneyCompact()` (compact notation + explicit currency code, for KPI tiles) were restored — see "Incidental finding" below.

## Invariant

Reuses `CR-102`'s `INV-CUR-001`: without an explicit FX engine, `SUM(amounts)` is financially valid only when every amount belongs to the same currency.

## Incidental finding — prior money-display work (CR-109) was lost, uncommitted

While implementing this CR, `apps/frontend/src/lib/currency.ts` was found reverted to its pre-existing `HEAD` state — missing `formatMoneyAmount`/`formatMoneyCompact`, which this session's history shows were added and used across ~12 files (Proposals/Approvals/Contracts/Billing/Tenant Portal/Tenants/Service Contracts/Dashboard/Analytics/Reports/CRM-Overview) in an earlier "money display standardization" pass. A repo-wide grep confirmed **zero** files still reference either function, and none of those ~12 files show as modified in `git status` — they are byte-identical to the committed `HEAD`. None of the 5 local `git stash` entries (all labeled `!!GitHub_Desktop<...>`, evidence of a concurrent GitHub Desktop session on this same working directory) contain any trace of `formatMoneyAmount` either.

**Conclusion**: that entire body of work was never committed and has been lost from the working tree, almost certainly clobbered by a concurrent `git stash`/pop cycle from another tool on this machine — not a git-recoverable state. This CR restores only the 2 helper functions it directly depends on (`formatMoneyAmount`, `formatMoneyCompact`) in `currency.ts`; the ~12-file UI rollout that used to consume them is **not** restored here — that is out of this CR's scope (currency *aggregation* correctness, not money *display* formatting) and would need to be redone as its own pass if wanted.

A merge-conflict marker (`<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`) was also found left in `ReportsPage.tsx`'s import block by the same concurrent stash-pop — resolved as part of this CR's edit to that file (kept both real imports, dropped the markers).

## Affected modules

Reports (backend service, frontend page), Analytics (backend renewal-risk service, frontend dashboard), `lib/currency.ts`. CRM was investigated, not modified (both flagged sites are false positives — see above).

## API behavior / compatibility

**Breaking, deliberately**: `GET /reports/pipeline`'s `proposals[]` rows drop `_sum.totalContractValue` in favor of `valueByCurrency`; the renewal-risk dashboard endpoint's `summary.atRiskMonthlyRevenue` is renamed to `summary.atRiskMonthlyRevenueByCurrency`. Both frontend consumers were updated in this same CR. No other consumer of either field was found (grepped repo-wide).

## Tests

**Backend** (`npx jest`, bare-metal — the running Docker containers are the production-style build with no `/app/src`, so tests ran on the host per `CLAUDE.md`'s bare-metal alternative): **89 suites / 582 tests passed**, 0 regressions. New: `reports.service.cr110.spec.ts` (3 tests — VND+USD status bucketing, multi-status accumulation, empty pipeline) and `renewal-risk.service.cr110.spec.ts` (3 tests — VND+USD bucketing with LOW-risk exclusion, null-currency defaulting to VND, empty at-risk set).
**Frontend** (`npx vitest run`): 27/29 files passed, 215/225 tests passed. The 2 failing files are both pre-existing and unrelated: `BookingsPage.test.tsx` (10 failures — a large, actively-in-progress, uncommitted Bookings refactor by a concurrent session; confirmed via `git status` showing unmerged `DU` conflicts on that feature's files, untouched by this CR) and `permissions.test.ts` (1 failure, a NAV_GROUPS module-duplication regression already present in the committed `HEAD` with zero working-tree diff on `permissions.ts` — pre-existing, unrelated to currency work, not fixed here to stay in scope).
**TypeScript**: `npx tsc --noEmit` clean (excluding the same concurrent Bookings files, which are mid-edit by another session).
**Build**: `npx vite build` clean.

## Known limitations

1. The CR-109 money-display work loss (see "Incidental finding") is not repaired beyond the 2 helper functions this CR needed — a full redo of that UI pass is a separate, larger task.
2. `permissions.test.ts`'s NAV_GROUPS duplication and `BookingsPage.test.tsx`'s failures are pre-existing/concurrent-work issues, out of scope, not fixed.
3. Per CR-102's own "Deferred to CR-103" list, `SalesTurnover`/`ParkingMonthlyStatement`/`ServiceContracts` currency gaps remain unaddressed — none of those fields have a currency column yet, so no aggregation fix is possible there without a schema change (out of this CR's authorization).

## Rollback

Additive/logic-only — no schema migration. Reverting `reports.service.ts`, `renewal-risk.service.ts`, `ReportsPage.tsx`, `AnalyticsDashboard.tsx`, and the 2 new `*.cr110.spec.ts` files to their pre-CR-110 state fully reverses this change. Reverting the 2 restored functions in `currency.ts` would additionally require reverting `ReportsPage.tsx`/`AnalyticsDashboard.tsx` first (they depend on them).
