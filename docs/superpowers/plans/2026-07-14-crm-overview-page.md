# CRM Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `/crm-overview` page with a full CRM dashboard (KPI cards, source breakdown, stale leads, follow-up schedule) and remove the old `StatsHeader` from `/crm`.

**Architecture:** New file `CrmOverviewPage.tsx` contains four self-contained sub-components, each fetching their own data independently via `useQuery`. The existing `StatsHeader` function inside `CrmPage.tsx` is deleted entirely. Three config files (`permissions.ts`, `App.tsx`, `Layout.tsx`) receive minimal additions to wire up the new route.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query v5, Tailwind CSS, React Router v6, Lucide React, shadcn/ui (`Card`, `Badge`, `Skeleton`)

## Global Constraints

- All text/labels in Vietnamese to match existing UI
- No new backend endpoints — use existing API: `crmApi.stats()`, `crmApi.pipelineStats()`, `crmApi.staleLeads(days)`, `customersApi.stats()`, `followUpApi.list(params)`
- Follow existing component patterns: `useQuery` at sub-component level, `select: (r) => r?.data ?? r` for unwrapping
- Import paths use `@/` alias (configured in `vite.config.ts`)
- Dev server: `cd apps/frontend && npm run dev` → http://localhost:5173
- Test runner: `cd apps/frontend && npm run test`
- Route permissions for `crm-overview` must match `crm`: `['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR']`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **CREATE** | `apps/frontend/src/pages/crm/CrmOverviewPage.tsx` | Full overview dashboard — KPI cards, source breakdown, stale leads, follow-up schedule |
| **MODIFY** | `apps/frontend/src/lib/permissions.ts` | Add `crm-overview` to `RouteModule` type, `ROUTE_PERMISSIONS`, `PATH_TO_MODULE`, `NAV_GROUPS` |
| **MODIFY** | `apps/frontend/src/App.tsx` | Import `CrmOverviewPage`, add route `crm-overview` |
| **MODIFY** | `apps/frontend/src/components/Layout.tsx` | Add `/crm-overview` to `ICON_MAP` |
| **MODIFY** | `apps/frontend/src/pages/crm/CrmPage.tsx` | Remove `StatsHeader` function (lines 190–241) and its JSX usage (line 2524) |

---

## Task 1: Routing, Permissions & Navigation Wiring

**Files:**
- Modify: `apps/frontend/src/lib/permissions.ts`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/Layout.tsx`

**Interfaces:**
- Produces: route `/crm-overview` registered in router + accessible via sidebar

- [ ] **Step 1: Add `crm-overview` to `RouteModule` in `permissions.ts`**

In `apps/frontend/src/lib/permissions.ts`, find the `RouteModule` type (line ~14) and add `'crm-overview'`:

```ts
export type RouteModule =
  | 'dashboard'
  | 'spaces'
  | 'crm'
  | 'crm-overview'        // ← add this line
  | 'deal-pipeline'
  | 'pipeline-stats'
  | 'bookings'
  | 'proposals'
  | 'approvals'
  | 'contracts'
  | 'tenants'
  | 'fitout'
  | 'tickets'
  | 'sales'
  | 'billing'
  | 'sap'
  | 'reports'
  | 'analytics'
  | 'ai'
  | 'admin'
  | 'announcements'
  | 'tenant-portal'
  | 'cross-mall'
  | 'audit-log';
```

- [ ] **Step 2: Add permissions entry**

In `ROUTE_PERMISSIONS` (line ~39), add after the `crm` entry:

```ts
'crm-overview': ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'],
```

- [ ] **Step 3: Add path-to-module mapping**

In `PATH_TO_MODULE` (line ~66), add after the `crm` entry:

```ts
'crm-overview': 'crm-overview',
```

- [ ] **Step 4: Add sidebar entry to NAV_GROUPS**

Find the `'Khách hàng tiềm năng (CRM)'` group in `NAV_GROUPS` (~line 131). Replace its `items` array so "Tổng quan" appears first:

```ts
{
  label: 'Khách hàng tiềm năng (CRM)',
  items: [
    { label: 'Tổng quan', path: '/crm-overview', module: 'crm-overview' as RouteModule },
    { label: 'CRM & Leads', path: '/crm', module: 'crm' as RouteModule },
  ],
},
```

- [ ] **Step 5: Add icon to Layout.tsx ICON_MAP**

In `apps/frontend/src/components/Layout.tsx`, `PieChart` is already imported (line 9). Add to `ICON_MAP` (line ~34) after the `/crm` entry:

```ts
'/crm-overview': PieChart,
```

- [ ] **Step 6: Add route to App.tsx**

In `apps/frontend/src/App.tsx`:

Add import at the top (after `CrmPage` import, line ~11):
```ts
import CrmOverviewPage from '@/pages/crm/CrmOverviewPage';
```

Add route after the `/crm` route (line ~76):
```tsx
<Route path="crm-overview" element={<RoleRoute><CrmOverviewPage /></RoleRoute>} />
```

- [ ] **Step 7: Verify dev server starts without errors**

```bash
cd apps/frontend && npm run dev
```

Navigate to http://localhost:5173/crm-overview — expect a blank page (component not created yet) OR a 404. No TypeScript errors in the terminal.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/lib/permissions.ts apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx
git commit -m "feat(crm): register /crm-overview route, permissions, and sidebar entry"
```

---

## Task 2: Create CrmOverviewPage

**Files:**
- Create: `apps/frontend/src/pages/crm/CrmOverviewPage.tsx`

**Interfaces:**
- Consumes:
  - `crmApi.stats()` → `{ total: number, byStatus: { status: string, _count: number }[], wonThisMonth: number, lostThisMonth: number }`
  - `crmApi.pipelineStats()` → `{ winLossBySource: Record<string, { won: number, lost: number, rate: number }>, ... }`
  - `crmApi.staleLeads(days: number)` → `{ id: string, brandName: string, contactName: string, priority: 'HOT'|'WARM'|'COLD', lastActivityAt: string|null, createdAt: string, assignedTo: {...} }[]`
  - `customersApi.stats()` → `{ byStatus: { status: string, count: number }[] }`
  - `followUpApi.list({ isDone: 'false', daysAhead: number })` → `{ id: string, dueDate: string, note: string|null, lead: { id, brandName, status }|null, customer: { id, companyName, brandName }|null, assignedTo: { id, fullName } }[]`
- Produces: `export default function CrmOverviewPage()` — default export consumed by `App.tsx`

- [ ] **Step 1: Create the file with imports and constants**

Create `apps/frontend/src/pages/crm/CrmOverviewPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { crmApi, customersApi, followUpApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Layers, Percent, Target, CheckCircle, Bell, ArrowRight, Clock,
} from 'lucide-react';

const SOURCE_LABELS: Record<string, string> = {
  BROKER: 'Môi giới',
  WEBSITE: 'Website',
  REFERRAL: 'Giới thiệu',
  WALK_IN: 'Trực tiếp',
  EXISTING_TENANT: 'KH hiện tại',
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  HOT:  { label: 'Hot',  color: 'bg-red-500 text-white' },
  WARM: { label: 'Warm', color: 'bg-orange-400 text-white' },
  COLD: { label: 'Cold', color: 'bg-gray-400 text-white' },
};

function getDaysAgo(date: string | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 2: Add KpiCards sub-component**

Append to the same file:

```tsx
function KpiCards() {
  const { data: leadStats, isLoading: l1 } = useQuery({
    queryKey: ['crm-stats'],
    queryFn: crmApi.stats,
    select: (r: any) => r?.data ?? r,
  });
  const { data: custStats, isLoading: l2 } = useQuery({
    queryKey: ['customers-stats'],
    queryFn: customersApi.stats,
    select: (r: any) => r?.data ?? r,
  });
  const { data: followUpsTodayRaw, isLoading: l3 } = useQuery({
    queryKey: ['follow-ups-today-count'],
    queryFn: () => followUpApi.list({ isDone: 'false', daysAhead: 1 }),
    select: (r: any) => (Array.isArray(r) ? r : r?.data ?? []),
  });

  const wonCount: number = Array.isArray(leadStats?.byStatus)
    ? (leadStats.byStatus.find((s: any) => s.status === 'WON')?._count ?? 0)
    : 0;
  const lostCount: number = Array.isArray(leadStats?.byStatus)
    ? (leadStats.byStatus.find((s: any) => s.status === 'LOST')?._count ?? 0)
    : 0;
  const winRate = (wonCount + lostCount) > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : 0;

  const kpis = [
    { label: 'Tổng leads',        value: leadStats?.total ?? 0,                                                                             icon: Layers,       color: 'text-gray-700',   bg: 'bg-gray-50' },
    { label: 'Tỷ lệ thành công',  value: `${winRate}%`,                                                                                     icon: Percent,      color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Đang đàm phán',     value: (custStats?.byStatus ?? []).find((s: any) => s.status === 'NEGOTIATING')?.count ?? 0,              icon: Target,       color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Đang thuê',         value: (custStats?.byStatus ?? []).find((s: any) => s.status === 'ACTIVE')?.count ?? 0,                   icon: CheckCircle,  color: 'text-emerald-600',bg: 'bg-emerald-50' },
    { label: 'Follow-up hôm nay', value: (followUpsTodayRaw ?? []).length,                                                                  icon: Bell,         color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  if (l1 || l2 || l3) {
    return (
      <div className="grid grid-cols-5 gap-3 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-3 mb-5">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div key={k.label} className={`${k.bg} rounded-xl p-3 flex items-center gap-3`}>
            <div className="shrink-0 w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <Icon size={17} className={k.color} />
            </div>
            <div>
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-gray-500 leading-tight">{k.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Add SourceBreakdownCard sub-component**

Append to the same file:

```tsx
function SourceBreakdownCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-pipeline-stats'],
    queryFn: crmApi.pipelineStats,
    select: (r: any) => r?.data ?? r,
  });

  const rows = Object.entries(
    (data?.winLossBySource ?? {}) as Record<string, { won: number; lost: number; rate: number }>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Phân bổ theo nguồn</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left pb-2 font-medium">Nguồn</th>
                <th className="text-center pb-2 font-medium">WON</th>
                <th className="text-center pb-2 font-medium">Lost</th>
                <th className="text-left pb-2 font-medium pl-3">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([source, stat]) => (
                <tr key={source} className="border-b last:border-0">
                  <td className="py-2 text-gray-700">{SOURCE_LABELS[source] ?? source}</td>
                  <td className="py-2 text-center text-green-600 font-medium">{stat.won}</td>
                  <td className="py-2 text-center text-red-500">{stat.lost}</td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full"
                          style={{ width: `${Math.round(stat.rate)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-7 text-right">{Math.round(stat.rate)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Add StaleLeadsCard sub-component**

Append to the same file:

```tsx
function StaleLeadsCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['crm-stale-leads'],
    queryFn: () => crmApi.staleLeads(14),
    select: (r: any) => (Array.isArray(r) ? r : r?.data ?? []),
  });

  const leads: any[] = (data ?? []).slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Top leads cần theo dõi</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
          </div>
        ) : leads.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Không có leads nào bị bỏ quên 👍</p>
        ) : (
          <div className="space-y-1">
            {leads.map((lead: any) => {
              const cfg = PRIORITY_CFG[lead.priority] ?? PRIORITY_CFG.COLD;
              const daysAgo = getDaysAgo(lead.lastActivityAt ?? lead.createdAt);
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-2 py-1.5 border-b last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1 transition-colors"
                  onClick={() => navigate('/crm')}
                >
                  <Badge className={`${cfg.color} text-[10px] px-1.5 py-0 shrink-0`}>{cfg.label}</Badge>
                  <span className="flex-1 text-xs text-gray-700 truncate">
                    {lead.brandName ?? lead.contactName ?? '—'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-orange-500 shrink-0">
                    <Clock size={10} />
                    {daysAgo} ngày
                  </span>
                </div>
              );
            })}
            <button
              onClick={() => navigate('/crm')}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 pt-2 transition-colors"
            >
              Xem tất cả <ArrowRight size={11} />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Add FollowUpScheduleCard sub-component**

Append to the same file:

```tsx
function FollowUpScheduleCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups-upcoming'],
    queryFn: () => followUpApi.list({ isDone: 'false', daysAhead: 7 }),
    select: (r: any) => (Array.isArray(r) ? r : r?.data ?? []),
  });

  const items: any[] = data ?? [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const grouped: Record<string, any[]> = {};
  items.forEach((fu) => {
    const key = new Date(fu.dueDate).toDateString();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(fu);
  });

  const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const formatGroupDate = (key: string) => {
    const d = new Date(key);
    return `${DAY_LABELS[d.getDay()]}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Lịch follow-up sắp tới (7 ngày)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Không có follow-up nào trong 7 ngày tới</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([key, fus]) => {
              const isOverdue = new Date(key) < todayStart;
              return (
                <div key={key}>
                  <div className={`text-xs font-semibold mb-1 flex items-center gap-2 ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                    {formatGroupDate(key)}
                    {isOverdue && (
                      <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px]">Quá hạn</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {fus.map((fu: any) => (
                      <div key={fu.id} className="flex items-start gap-2 py-1.5 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-700 font-medium truncate">
                            {fu.lead?.brandName ?? fu.customer?.companyName ?? fu.customer?.brandName ?? '—'}
                          </div>
                          {fu.note && (
                            <div className="text-[11px] text-gray-400 truncate">
                              {fu.note.length > 60 ? `${fu.note.slice(0, 60)}…` : fu.note}
                            </div>
                          )}
                        </div>
                        {fu.assignedTo && (
                          <span className="shrink-0 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {fu.assignedTo.fullName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Add the default export (main page component)**

Append to the same file:

```tsx
export default function CrmOverviewPage() {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="mb-5 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Tổng quan CRM</h1>
        <p className="text-sm text-gray-500 mt-0.5">Theo dõi sức khỏe pipeline và các leads cần hành động</p>
      </div>

      <KpiCards />

      <div className="grid grid-cols-[55fr_45fr] gap-4 mb-4">
        <SourceBreakdownCard />
        <StaleLeadsCard />
      </div>

      <FollowUpScheduleCard />
    </div>
  );
}
```

- [ ] **Step 7: Verify page renders**

Ensure dev server is running (`npm run dev` in `apps/frontend`). Navigate to http://localhost:5173/crm-overview.

Expected:
- Page loads without console errors
- Sidebar shows two items under "Khách hàng tiềm năng (CRM)": "Tổng quan" (active) and "CRM & Leads"
- KPI cards row visible with skeleton → numbers
- Two columns: "Phân bổ theo nguồn" and "Top leads cần theo dõi"
- "Lịch follow-up sắp tới" card below

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/crm/CrmOverviewPage.tsx
git commit -m "feat(crm): add CrmOverviewPage with KPI, source breakdown, stale leads, follow-up schedule"
```

---

## Task 3: Remove StatsHeader from CrmPage

**Files:**
- Modify: `apps/frontend/src/pages/crm/CrmPage.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `CrmPage` without `StatsHeader` — leaner page that starts directly with tabs

- [ ] **Step 1: Delete the StatsHeader function**

In `apps/frontend/src/pages/crm/CrmPage.tsx`, delete lines 190–241 (the entire `StatsHeader` function including its separator comment):

```
// ─── Stats Header ──────────────────────────────────────────────────────────────

function StatsHeader() {
  ...
}
```

The block starts at `// ─── Stats Header` and ends after the closing `}` of the function, just before `// ─── Unified Add Dialog`.

- [ ] **Step 2: Remove `<StatsHeader />` usage from CrmPage render**

In the `CrmPage` component (near line 2524), remove the line:

```tsx
      {/* Stats */}
      <StatsHeader />
```

The surrounding context looks like this — delete only the two marked lines:

```tsx
      {/* Header */}
      <div className="flex items-start justify-between mb-5 shrink-0">
        ...
      </div>

      {/* Stats */}          ← DELETE THIS LINE
      <StatsHeader />        ← DELETE THIS LINE

      {/* Tabs */}
      <Tabs value={activeTab} ...>
```

- [ ] **Step 3: Check for now-unused icon imports**

`StatsHeader` used `Layers`, `Percent`, `Target`, `CheckCircle`, `Bell` from `lucide-react`. Check if any of these are still used elsewhere in `CrmPage.tsx`:

```bash
grep -n "Layers\|Percent\|Target\|CheckCircle\|Bell" apps/frontend/src/pages/crm/CrmPage.tsx
```

Remove from the import line any icon that no longer appears in the file. `Target` and `Bell` are used in the Tabs section (line ~2529–2533), so keep those. `Layers`, `Percent`, `CheckCircle` appear to be used in `LEAD_STAGES` / `CUSTOMER_STATUSES` — verify before removing.

- [ ] **Step 4: Verify `/crm` still works**

Navigate to http://localhost:5173/crm.

Expected:
- No console errors
- Page shows header + tabs directly (no KPI cards row at top)
- "Liên hệ & Pipeline" and "Follow-ups" tabs work as before

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/crm/CrmPage.tsx
git commit -m "feat(crm): remove StatsHeader from CrmPage — moved to CrmOverviewPage"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| New route `/crm-overview` | Task 1, Step 6 |
| Sidebar entry "Tổng quan" in CRM group | Task 1, Step 4 |
| Permission roles match `crm` | Task 1, Steps 1–3 |
| PieChart icon in ICON_MAP | Task 1, Step 5 |
| KPI Cards section | Task 2, Step 2 |
| Phân bổ theo nguồn table | Task 2, Step 3 |
| Top leads cần theo dõi list | Task 2, Step 4 |
| Lịch follow-up sắp tới | Task 2, Step 5 |
| Page shell + layout | Task 2, Step 6 |
| Remove StatsHeader from `/crm` | Task 3 |
| No backend changes | ✅ All data from existing endpoints |
| No new files outside pages/crm | ✅ |

**Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.

**Type consistency:**
- `KpiCards` uses `leadStats?.byStatus` as `{ status: string, _count: number }[]` — matches backend `getStats()` return
- `SourceBreakdownCard` uses `data?.winLossBySource` as `Record<string, {won,lost,rate}>` — matches backend `pipelineStats()` return
- `StaleLeadsCard` uses `lead.brandName`, `lead.priority`, `lead.lastActivityAt`, `lead.createdAt` — all present in `getStaleLeads()` include
- `FollowUpScheduleCard` uses `fu.lead?.brandName`, `fu.customer?.companyName`, `fu.assignedTo.fullName` — all present in `listFollowUps()` include
