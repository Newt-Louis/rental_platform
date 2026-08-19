# Redesign Spec — Dashboard

**Purpose:** Answer "what do I need to do today" first, KPIs second.
**Persona:** All staff, role-shaped via existing `focusAreasForRole`.
**User goal:** Decide where to spend the next 10 minutes without navigating.

Full rationale, wireframe, and per-persona table are in
[07-DASHBOARD-REDESIGN](../audit/07-DASHBOARD-REDESIGN.md) — this file is the
implementation-facing spec.

## Current problems

FR-04 (approval items lack decision context), FR-08 (action list misses
fitout/patrol/work-order signals).

## Information hierarchy

1. Hero: greeting, mall, date, Health Score, Occupancy, "Cần chú ý hôm nay" count
   (unchanged from today — already correct)
2. **"Việc cần tôi xử lý"** (renamed from "Executive Actions"): assignee-aware,
   context-inline rows — this is the primary content area, above KPI cards
3. KPI cards (existing StatCard grid, role-filtered) — secondary
4. Charts (occupancy donut, cashflow) — tertiary, unchanged
5. Quick Actions row — new: "+ Tạo đề xuất", "+ Tạo ticket", "Tìm kiếm"

## Components

- Extend existing `ActionItems` component/query rather than replacing it.
- Reuse `StatCard`, existing chart components — no new charting library.
- New: compact context line per action item (varies by item type — discount %
  for approvals, time-to-SLA for tickets, delay days for fitout).

## States

- Zero action items: show a calm confirmation state ("Không có việc cần xử lý
  hôm nay"), not an empty chart — this is a positive empty state, not an error.
- Loading: skeleton cards (pattern already used elsewhere in the app).
- Error (dashboard query fails): retry pattern per `AsyncState` component.

## Permissions

Reuses `focusAreasForRole`/`shapeForRole` unchanged — action item types included
per role are additive to what's already gated.

## Acceptance criteria

- An approval-type action item shows discount %/threshold reason without a click.
- An Operation-role dashboard shows fitout SLA-breach items (currently absent).
- No existing KPI/chart is removed.
