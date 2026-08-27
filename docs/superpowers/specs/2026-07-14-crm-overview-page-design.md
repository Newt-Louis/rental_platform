# CRM Overview Page — Design Spec
**Date:** 2026-07-14  
**Status:** Approved

## Problem

The `/crm` page mixes two concerns: high-level statistics (KPI cards at the top) and the operational pipeline/follow-ups interface. As the CRM module grows, users need a dedicated landing page to get a quick health read on the pipeline before drilling into details.

## Solution

Create a new **CRM Tổng quan** page at `/crm-overview` (separate sidebar entry under the "Khách hàng tiềm năng (CRM)" group). Remove `StatsHeader` from `/crm`. The new page is a read-only dashboard composed of four sections.

---

## Architecture

### New files
- `apps/frontend/src/pages/crm/CrmOverviewPage.tsx` — self-contained dashboard; all sub-components defined in same file as private functions

### Modified files
| File | Change |
|------|--------|
| `apps/frontend/src/pages/crm/CrmPage.tsx` | Remove `StatsHeader` component definition and its single usage `<StatsHeader />` |
| `apps/frontend/src/App.tsx` | Add `import CrmOverviewPage` + route `<Route path="crm-overview" ...>` |
| `apps/frontend/src/lib/permissions.ts` | Add `'crm-overview'` to `RouteModule`, `ROUTE_PERMISSIONS`, `PATH_TO_MODULE`, and `NAV_GROUPS` |
| `apps/frontend/src/components/Layout.tsx` | Add `/crm-overview` entry to `ICON_MAP` |

---

## Page Layout — `CrmOverviewPage`

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: "Tổng quan CRM"  subtitle  [no action buttons]         │
├────────┬────────┬────────┬────────┬────────────────────────────┤
│ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4  │ KPI 5                      │
│Tổng    │Win rate│Đàm     │Đang    │Follow-up                   │
│leads   │   %    │phán    │thuê    │hôm nay                     │
├───────────────────────────────┬─────────────────────────────────┤
│  Phân bổ theo nguồn (55%)    │  Top leads cần theo dõi (45%)   │
│  Table: Source/WON/Lost/Rate │  Stale 14+ ngày, max 8 rows     │
├───────────────────────────────┴─────────────────────────────────┤
│  Lịch follow-up sắp tới (7 ngày)                                │
│  List grouped by date: brand + note + người phụ trách + ngày   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section Details

### Section 1 — KPI Cards

5 cards in a `grid grid-cols-5 gap-3` row. Same visual style as the current `StatsHeader` (icon in white rounded box, large number, small label).

| # | Label | Data source | Computation |
|---|-------|-------------|-------------|
| 1 | Tổng leads | `crmApi.stats()` | `stats.total` |
| 2 | Tỷ lệ thành công | `crmApi.stats()` | `won / (won + lost) * 100`, rounded % |
| 3 | Đang đàm phán | `customersApi.stats()` | `byStatus.find(NEGOTIATING).count` |
| 4 | Đang thuê | `customersApi.stats()` | `byStatus.find(ACTIVE).count` |
| 5 | Follow-up hôm nay | `followUpApi.list({ isDone:'false', daysAhead:1 })` | `array.length` |

**Derivation of `won`/`lost` for win rate:**
`crmApi.stats()` returns `{ total, byStatus: [{status, _count}], wonThisMonth, lostThisMonth }`.
Use `byStatus` to find counts for `WON` and `LOST` statuses.

### Section 2 — Phân bổ theo nguồn (left column, 55%)

Data: `crmApi.pipelineStats()` → `winLossBySource: Record<string, {won, lost, rate}>`

Rendered as a table inside a `Card`:
- Columns: **Nguồn** | **WON** | **Lost** | **Win rate** (progress bar + %)
- Source keys translated via existing `SOURCE_LABELS` constant (copy from `CrmPage.tsx`)
- Skeleton loading state while fetching

### Section 3 — Top leads cần theo dõi (right column, 45%)

Data: `crmApi.staleLeads(14)` — leads with no activity for 14+ days, not WON/LOST.

Rendered as a list inside a `Card` (max 8 items):
- Each row: priority badge (HOT/WARM/COLD colors) + brand name + `X ngày không HĐ` chip + arrow link to `/crm`
- Sort order: HOT first, then by days since last activity descending (already sorted by backend)
- Empty state: "Không có leads nào bị bỏ quên 👍"
- "Xem tất cả →" footer link to `/crm`

### Section 4 — Lịch follow-up sắp tới (full width)

Data: `followUpApi.list({ isDone: 'false', daysAhead: 7 })`

Rendered as a list grouped by `dueDate` inside a `Card`:
- Group header: formatted date (e.g. "Thứ 2, 14/07")
- Each item: brand/company name + note (truncated 60 chars) + người phụ trách chip + due time if present
- Overdue items (dueDate < today) shown in red with "Quá hạn" badge
- Empty state: "Không có follow-up nào trong 7 ngày tới"

---

## Routing & Permissions

```ts
// permissions.ts additions
RouteModule: add 'crm-overview'
ROUTE_PERMISSIONS['crm-overview']: ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR']
PATH_TO_MODULE['crm-overview']: 'crm-overview'

// NAV_GROUPS — 'Khách hàng tiềm năng (CRM)' group becomes:
items: [
  { label: 'Tổng quan', path: '/crm-overview', module: 'crm-overview' },
  { label: 'CRM & Leads', path: '/crm', module: 'crm' },
]

// Layout.tsx ICON_MAP
'/crm-overview': PieChart  // LayoutDashboard used by /dashboard, BarChart3 used by /analytics
```

---

## Data Loading Strategy

All four queries are independent — fire them in parallel via separate `useQuery` calls at the top of `CrmOverviewPage`. No loading waterfall. Each section shows its own `Skeleton` while its query loads; sections don't block each other.

---

## Out of Scope

- No write actions on this page (read-only dashboard)
- No date-range filtering (future enhancement)
- No backend changes needed — all data already exposed via existing endpoints
- The `StatsHeader` function is deleted entirely from `CrmPage.tsx`; it is not extracted to a shared component
