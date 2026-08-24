# Redesign Spec — Approvals

**Purpose:** Let an approver decide without leaving the queue.
**Persona:** Leasing Manager, Mall Director, CEO, Finance, Legal.
**User goal:** "Should I approve this, and why did it reach me?"

## Current problems (FR-04, FR-05)

`ApprovalsPage.tsx`'s `ApprovalPipeline` shows step/status only; deal terms
(discount %, rent-free days) require opening the linked Proposal separately. The
policy computation that decided *why* this item needs this approver is entirely
server-side and invisible.

## Information hierarchy

1. Per-row: entity summary (unit, tenant/brand), the specific number that
   triggered this approval tier (e.g., "Giảm giá 12% — vượt ngưỡng CEO 10%"),
   current step position in the pipeline
2. Primary actions: Approve / Reject, inline on the row
3. Secondary: "Xem chi tiết đề xuất" link for cases needing full context
4. Rejection requires a reason (already the stated standard in
   `ERP_UX_STANDARD.md`)

## Components

- Extend the existing `ApprovalPipeline` row component with a context summary
  line — data already computed server-side in `approval-policy.util.ts`
  (`PolicyContext`), just not currently returned to this screen's query.
- Reuse existing Approve/Reject button + confirm-dialog pattern.

## States

- Empty queue: positive state ("Không có phê duyệt nào đang chờ bạn").
- Loading/error: existing `AsyncState` pattern.
- A step "chưa đến lượt" (not yet reached) stays visually de-emphasized, matching
  current badge behavior.

## Permissions

Unchanged — `ApprovalsService.getPending()` already scopes to steps the user's
role/assigned userId can act on.

## Responsive behavior

Approval cards stack vertically on mobile; Approve/Reject remain reachable without
horizontal scroll (per `ERP_UX_STANDARD.md` touch-target rule).

## Acceptance criteria

- An approver can act on a straightforward case (no special conditions) without
  navigating to the Proposal detail page.
- The reason a rule fired (which threshold, which value) is visible in plain
  Vietnamese, not as a rule ID.
