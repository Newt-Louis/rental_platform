# System Truth — 13 — Reporting Definitions

**Correction pointer (2026-08-21)**: `docs/architecture-review/05-CANONICAL-FINANCIAL-SEMANTICS.md` corrects this document's downstream currency-filtering characterization of `reports.service.ts` and `analytics/{compliance,occupancy-analytics}.service.ts` (they are already VND-filtered, contrary to what was implied here) — see that document for detail. The duplicate-formula-*semantics* finding below (what "collected revenue" means) is unaffected.

## Duplicate-formula matrix (headline finding of this System Truth reconstruction)

| # | Consumer | Metric | Delegates to owner or reimplements? | Evidence |
|---|---|---|---|---|
| 1 | Reports `arAgingReport()` | AR aging buckets | **Delegates** — calls `billingService.getArAging()` | `reports.service.ts:246-248` |
| 2 | Dashboard `buildDashboard()` | monthlyRevenue/collectedRevenue/collectionRate/overdueAmount | **Reimplements** — own `invoice.findMany` + reduce, `Math.min(100,...)` clamp, VND-scoped | `dashboard.service.ts:290-299` |
| 3 | Dashboard `getCrossMallDashboard()` | same, per-mall + totals | **Reimplements, differently from #2** — counts face-value `totalAmount` of PAID/PARTIALLY_PAID, not payments-received | `dashboard.service.ts:441-444` |
| 4 | Reports `revenueReport()` | monthly billed/paid totals | **Reimplements** — own reduce, status `'PAID'` face-value | `reports.service.ts:138-146` |
| 5 | Reports `revenueReceivablesReport()` | totalBilled/Collected/Outstanding/collectionRate | **Reimplements** — own `collected()` helper (payments minus reversed) | `reports.service.ts:196-243` |
| 6 | `CollectionKpiService.getKpis()` (Billing's own) | totalBilled/Collected/outstandingAr/collectionRate/dso | Billing's own canonical KPI formula — but itself a distinct variant from `getArAging()`'s internal `financials()` helper (doesn't reuse it) | `collection-kpi.service.ts:34-42` |
| 7 | `ComplianceService.getMultiMallComparison()` | monthlyRevenue, revenuePerSqm | **Reimplements** — raw `invoice.aggregate({_sum:{subtotal}})`, subtotal not totalAmount, no payments concept | `compliance.service.ts:204-212` |
| 8 | `OccupancyAnalyticsService.takeMonthlySnapshot()` | revenue/revenuePerSqm (persisted) | **Reimplements** — same aggregate pattern as #7, independently duplicated | `occupancy-analytics.service.ts:277-286` |
| 9 | `AiService.buildContext()` | overdue sum, occupancy%, revenue growth | **Reimplements**, and **unscoped by mall** (only reporting consumer with this additional gap) | `ai.service.ts:181-206,143-154` |
| 10 | Occupancy rate — 5 places | occupiedArea/totalArea×100 | **Reimplemented independently in all 5** (Dashboard, Reports, OccupancyAnalytics's `getOccupancyV2()`, ComplianceService, AiService) — no shared occupancy service consumed by 4 of the 5 despite `getOccupancyV2()` being the most complete implementation | Multiple files, see `12-FINANCIAL-SEMANTICS.md` |

## Frontend-layer duplication (lower severity, compounds the above)
- `DashboardPage.tsx:176` recomputes `collectionPct = collectedRevenue/monthlyRevenue×100` client-side instead of consuming the API's own `collectionRate` field — diverges because the backend clamps `Math.min(100,...)` and the frontend does not.
- `ReportsPage.tsx:52` recomputes `Math.round((occupied/total)*100)` from raw counts client-side instead of consuming a backend-provided rate.

## Report-by-report mall-scoping status

| Report/Widget | Module | Mall-scoping enforced? |
|---|---|---|
| Dashboard (all) | dashboard | **Yes** — `DashboardService` internally calls `MallAccessService` |
| Cross-Mall Dashboard | dashboard | **Yes** — correctly gated to `MODULE_ROLES.crossMall = [ADMIN, CEO]` |
| Pipeline/Revenue/Tenant-Sales/Revenue-Receivables/AR-Aging/Compliance reports | reports | **No** — `ReportsController` never calls `MallAccessService`; all return all-mall data unconditionally except `occupancy` (optional, unenforced filter) |
| Occupancy/Vacancy/Multi-Mall-Comparison | analytics | **No** — same gap; `GET /analytics/multi-mall` in particular grants CEO/ADMIN-equivalent cross-mall visibility to the broader `MODULE_ROLES.analytics` list (includes `LEASING_MANAGER`) |
| Renewal risk, Compliance exports | analytics | Not independently re-verified for mall-scoping in this pass beyond the multi-mall-comparison finding above |
| AI chat context | ai | **No** — `AiController.chat()`/`chatStream()` accept no mall-scoping parameter |

## Assessment

This is the platform's **most severe reporting-layer finding**: the exact risk class the governing brief named ("duplicated financial formulas between Billing, Dashboard and Reports") is not only present but pervasive (7-10 independent implementations of 2-3 core metrics), and it compounds with a **separate, equally severe mall-scoping gap** in the same layer — meaning a Mall-scoped user can, through Reports/Analytics, see both (a) other malls' data and (b) numbers that may not even agree with what Dashboard or Billing itself would show for the same period. See `ARCHITECTURE_CONTRADICTIONS.md` for consolidated severity and `docs/ai-erp-team/13-PROGRAM-BOARD.md` phase recommendations in `SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md`.
