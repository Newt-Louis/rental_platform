# 07 — Dashboard Redesign

> Phase 7. The current dashboard (`DashboardPage.tsx`) is already role-shaped and
> already has a real action list (`ActionItems`) — better than a typical first-pass
> ERP dashboard. This section extends what works and fixes what's incomplete
> (FR-04, FR-08), rather than replacing it.

## What the current dashboard already gets right (keep)

- Backend `focusAreasForRole`/`shapeForRole` genuinely strips fields per role — not
  just hidden in CSS, the API itself returns less for a narrower role.
- `healthScoreForRole` gives a single 0–100 number, differently computed per role.
- `ActionItems` is a real to-do list: sorted urgent-first, links straight into a
  *filtered* view of the target module (`/billing?status=OVERDUE`, not just
  `/billing`).
- The hero's "Needs attention" counter is genuinely the "HÔM NAY TÔI CẦN LÀM GÌ?"
  answer the master brief asks for — it already exists, partially.

## What's incomplete (from FR-04, FR-08)

1. Action list covers only 6 fixed item types; misses fitout SLA breaches,
   patrol/work-order overdue items even though those modules already generate
   notifications.
2. Approval items in the action list show a count and a generic link, not the deal
   context (discount %, tenant, rationale) needed to actually decide — the click
   still leads to a second screen.
3. No "My Work" personal view — everything is aggregate-count-driven, not
   assignee-driven (e.g., "3 tickets assigned to me" is not distinguishable from
   "3 tickets open, unassigned, across the mall").

## Proposed dashboard (wireframe)

```text
┌─────────────────────────────────────────────────────────────┐
│ THISO   [Mall: Sala ▾]        Search...        🔔12   👤Kyle │
├──────────┬──────────────────────────────────────────────────┤
│ Trang chủ│  Chào buổi sáng, Kyle · Thứ Ba, 18/08/2026         │
│ Việc của │  ┌────────────────────────────────────────────┐  │
│  tôi     │  │ Health Score  82/100     Occupancy  91%     │  │
│ Bán hàng │  │ Cần chú ý hôm nay: 7   [xem chi tiết ↓]      │  │
│  & Thuê  │  └────────────────────────────────────────────┘  │
│ Vận hành │                                                    │
│ Tài chính│  VIỆC CẦN TÔI XỬ LÝ                                │
│ Báo cáo  │  ──────────────────────────────────────────────  │
│          │  🔴 Đề xuất #1023 — Coffee House, giảm giá 12%    │
│          │     → cần CEO duyệt (vượt ngưỡng 10%)  [Duyệt]    │
│          │  🟡 Hợp đồng #88 hết hạn trong 25 ngày   [Xem]    │
│          │  🟡 Ticket #212 sắp quá SLA (còn 40 phút) [Xem]   │
│          │  ⚪ Fitout dự án Uniqlo trễ 3 ngày        [Xem]   │
│          │                                                    │
│          │  CHỈ SỐ CHÍNH                                     │
│          │  [Doanh thu tháng] [Công nợ quá hạn] [Booking sắp hết hạn] │
│          │                                                    │
│          │  Biểu đồ lấp đầy      Biểu đồ dòng tiền            │
│          │                                                    │
│          │  THAO TÁC NHANH                                   │
│          │  [+ Tạo đề xuất] [+ Tạo ticket] [Tìm kiếm]         │
└──────────┴──────────────────────────────────────────────────┘
```

### Key changes vs. current

- **"VIỆC CẦN TÔI XỬ LÝ" (Needs My Action)** replaces the generic "Executive
  Actions" label and is now assignee/role-aware, not just count-aware — each row
  shows enough context to decide without a click (fixes FR-04): for approvals,
  shows discount %/threshold reason inline; for tickets, shows time-to-SLA-breach;
  for fitout, shows delay days.
- Extends coverage to fitout SLA breaches (fixes FR-08); Operation-role users will
  now see fitout/ticket items they were missing.
- "Health Score" and "Cần chú ý hôm nay" stay in the hero exactly as today — proven
  useful, no change.
- Quick Actions row is new — surfaces the two most common creation tasks
  (Proposal, Ticket) directly, addressing FR-02's "can't find where to start"
  at the point of highest visibility (the homepage), independent of fixing the
  Proposals page itself.

## Per-persona differences (reusing existing `focusAreas` mechanism — no new backend concept required)

| Persona | Sees in "Cần tôi xử lý" |
|---|---|
| Leasing Executive | Own proposals awaiting submission/re-work, own bookings expiring |
| Leasing Manager / Director | Approvals at their tier, contracts expiring, fitout delays |
| Finance | Overdue invoices, dunning escalations, SAP sync failures |
| Legal | Approvals (legal-review step), contracts pending legal review |
| Operation | Ticket SLA risk, fitout delays, (new) work-order/patrol overdue |
| CEO | Only approvals above their threshold, cross-mall health scores |
| Tenant | Not this dashboard — Tenant Portal has its own equivalent, out of scope here |

This requires no new data model — `focusAreasForRole` already exists and already
filters by role; the change is (a) widening which event types feed `ActionItems`,
and (b) adding a decision-context field to approval-type action items.
