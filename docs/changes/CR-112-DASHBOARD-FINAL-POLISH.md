# CR-112 — Golden Dashboard Final Polish

## CHANGE ID
CR-112

## BUSINESS REASON
Make the accepted Round 2 Dashboard suitable for executive ERP use: financial
values must be unambiguous, action exceptions must be directly actionable, and
the page must carry more decision value with less decorative container noise.

## CURRENT BEHAVIOR
The Round 2 Dashboard has the accepted three-level information architecture,
but financial chart axes/tooltips use compact suffixes, the five KPI tiles read
as separate cards, action rows expose counts without available business context,
three trends have equal visual weight, and `healthScore` is labelled as an
authoritative portfolio-health score.

## EXPECTED BEHAVIOR
Keep the accepted hierarchy while using a compact shared financial strip,
explicit chart scale units with exact VND tooltips, a priority-sorted ERP
worklist using current aggregate data and routes, a 2/3 + 1/3 trend hierarchy,
and an explicitly non-authoritative label for the existing composite indicator.

## PRIMARY DOMAIN
Dashboard / Reporting Architect.

## AFFECTED JOURNEYS
BP-011 Management Reporting; GS-09 Cross-Mall denial (regression only), GS-11
VND lifecycle (display only), GS-14 Mixed-currency reporting (display convention
only; known platform-level scenario remains outside this visual CR).

## UPSTREAM IMPACT
Read-only consumption of existing Dashboard, Reports revenue, Analytics
occupancy-trend, and Billing collection-KPI responses. No upstream query,
formula, response field, or authorization behavior changes.

## DOWNSTREAM IMPACT
Dashboard has no downstream data consumer. Navigation targets remain existing
Billing, Approvals, Contracts, Tickets, Fitout, Bookings, and Spaces routes.
Reports, Analytics, exports, notifications, SAP, and jobs are checked but not
changed.

## DATA OWNERSHIP IMPACT
None — no write is added or changed.

## STATE MACHINE IMPACT
None — statuses are only represented by existing aggregate counts and routes.

## FINANCIAL IMPACT
Presentation only. Source amounts and formulas remain unchanged. Top KPI and
worklist amounts use exact VND formatting. Financial chart axes use a declared
scale (Tỷ/Triệu/Nghìn VND) and numeric ticks without ambiguous suffixes;
tooltips show exact VND amounts.

## CURRENCY IMPACT
Dashboard financial sources are already VND-scoped. The UI continues to label
VND explicitly and does not convert, aggregate, infer, or mix currencies.

## MALL/COMPANY IMPACT
None. Existing Mall selection and server-side scoping are unchanged and passed
through to every existing query exactly as before.

## TENANT IMPACT
None. The staff Dashboard only is in scope; Tenant Portal is unchanged.

## AUTHORIZATION IMPACT
None. No endpoint or permission rule changes. Existing module/path checks remain
the gate for optional trends and action routes.

## REPORTING IMPACT
Dashboard composition and formatting only. Reports/Analytics/Billing values are
displayed without recomputation except the already-existing `uncollected`
display subtraction, which is unchanged in this CR.

## TRANSACTION IMPACT
N/A — read-only frontend rendering.

## EVENT/JOB IMPACT
N/A — no events or jobs.

## DOCUMENT IMPACT
This CR records the Health-score decision and verification results. No business
documents, exports, invoices, or contracts change.

## API IMPACT
None — no request/response contract or endpoint changes.

## MIGRATION
N/A — no schema or data change.

## BACKWARD COMPATIBILITY
Existing Dashboard responses remain consumable. Optional trend sections still
omit unauthorized/unavailable series.

## GOLDEN E2E SCENARIOS
GS-09 regression by preserving current scope parameters and access checks;
GS-11 exact VND presentation; GS-14 display convention review without changing
the known underlying mixed-currency platform gaps.

## RECONCILIATION
Verify displayed Dashboard KPI/worklist amounts are the unchanged response
values; verify financial tooltip values equal their chart datum exactly; verify
chart axes state their scale; verify action counts and amount context originate
from the same Dashboard response.

## ROLLBACK
Revert Dashboard page/localization/test changes in CR-112. No data rollback.

## OPEN BUSINESS QUESTIONS
None introduced. The existing `healthScore` has no approved business-KPI
definition in System Truth. Evidence shows it is the private
`DashboardService.healthScoreForRole()` composite: overview roles receive
`round(occupancy × 0.55 + collection × 0.45)`, Finance receives collection,
and Leasing receives occupancy. Decision: classify it as an internally defined
analytical composite (case B) and label it as a reference indicator, not
authoritative “portfolio health.” No new meaning is assigned.

## Severity classification
Priority: P2 — Tier: 3. Visual/reporting polish with financial-display review;
no formula, API, authorization, or cross-domain write change.

## Gate results
Gate 1: PASS — Dashboard unit tests 3/3 and production frontend build pass.

Gate 2: N/A — no repository integration suite is defined for this visual-only
frontend composition.

Gate 3: PASS by inspection — no cross-module/API contract changed.

Gate 4: PARTIAL — route navigation and VND display are covered by the Dashboard
component tests; rendered browser E2E is not complete because the configured
in-app browser runtime returned no available browser.

Gates 5–6: N/A — no write, failure boundary, transaction, or concurrency path.

Gate 7: PASS by inspection — existing module/path checks and mall parameters are
unchanged; no authorization claim beyond the existing implementation.

Gates 8–9: PASS for source/display reconciliation in tests and code inspection;
the known platform-level GS-14 data-definition gaps remain outside CR-112.

Rendered viewport gate: BLOCKED — 1920×1080, 1440×900, 1366×768, and
1024×768 must remain explicitly NOT VERIFIED until a browser is available.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Implementation | Codex | 2026-08-23 | Code complete; visual gate blocked |
