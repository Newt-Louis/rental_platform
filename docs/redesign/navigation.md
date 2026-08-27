# Redesign Spec — Navigation / Sidebar

**Purpose:** Let any staff persona find "what I need to do" without already
knowing the backend module map.
**Persona:** All staff (Tenant nav is out of scope — already correct).
**User goal:** Recognize, not recall, where a task lives.

## Current problems (see FR-03, FR-12, 06-INFORMATION-ARCHITECTURE)

- Two incompatible grouping principles in one sidebar (task-sequence vs.
  technical-module) with no visual signal distinguishing them.
- Parking split across two groups for one subject.
- `ErpProcessGuide` strip exists specifically to compensate for the sidebar not
  communicating flow — evidence the fix belongs in the sidebar itself.

## Information hierarchy (target)

1. Trang chủ (Dashboard)
2. Việc của tôi (My Work) — new, badge with pending-task count
3. Bán hàng & Cho thuê — unchanged, already task-sequenced
4. Vận hành mặt bằng — 3 sub-clusters instead of 7 flat items
5. Tài chính
6. Báo cáo & Phân tích — consolidated from 6 to 4 named surfaces
7. Trợ lý AI
8. Hệ thống (Admin, Audit Log, Announcements)

## Components

- Existing `NAV_GROUPS` data structure in `permissions.ts` — this is a config
  change (regroup entries), not a new component.
- Existing `canAccessModule` per-item filtering — unchanged, applies automatically
  to the new grouping.
- "Việc của tôi" group header carries a live count badge sourced from the same
  task query as 09-TASK-NOTIFICATION-CENTER.

## States

- Collapsed sidebar (existing toggle) — group headers hide, icons only; ensure the
  3 new sub-clusters under "Vận hành mặt bằng" still have distinct icons so
  collapsed mode doesn't re-introduce the ambiguity being fixed.
- Empty "Việc của tôi" badge — hide the badge entirely rather than showing "0" per
  ERP_UX_STANDARD's minimalism guidance.

## Permissions

No RBAC logic changes — `canAccessModule(role, moduleKey)` continues to gate each
leaf item exactly as today; only the grouping/labels change.

## Responsive behavior

Unchanged from current collapse/hamburger behavior; `TenantBottomNav` is untouched.

## Acceptance criteria

- Every existing route remains reachable (no functionality removed).
- A user can state, for any of the 8 top-level groups, "these are things I do in
  this group" — verified via a quick moderated walkthrough with 2-3 real mall
  staff before rollout (see 12-GO-LIVE-READINESS "UAT" line).
- Parking has exactly one entry point in the sidebar.
