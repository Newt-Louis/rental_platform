# 09 — Task & Notification Center

> Phase 10. Grounds FR-07. Current state fully traced in `NotificationCenter.tsx`
> and `notifications.service.ts` call sites.

## Current state

One `Notification` model, one flat feed, ~15 free-form `type` values from 8
producer modules (billing, fitout, patrol, proposals, tickets, work-orders,
contracts, CRM) + 1 cron (AI insights). The panel has exactly one piece of special
handling: a hardcoded amber "pending approvals" banner above the feed, fetched
separately from `approvalsApi.pending()`. Everything else — SLA breaches,
escalations, "proposal approved" (informational), AI insight text, reminders — is
the same visual row with only a read/unread state.

This means the system already *has* the data to distinguish "you must act" from
"FYI," (the `type` field, and which types map to escalation/breach semantics) but
the UI throws that distinction away.

## Proposed model: separate Notifications from Tasks

**Notification** — something the user should know. No action required beyond
reading it. Examples: `PROPOSAL_APPROVED` (to the creator), `SYSTEM` (AI insight),
routine status-change FYIs.

**Task** — something the user must do. Has an owner, optionally a due
date/SLA, and a completion state. Examples: `APPROVAL_PENDING` (assigned to a
role/approver), `TICKET_SLA_BREACH`/`FITOUT_SLA_BREACH`/`FITOUT_ESCALATION`
(assigned to the escalation-target role), `TICKET_ESCALATION`.

This is a **UI/query reclassification of existing `type` values**, not a new
notification pipeline — no new backend model is strictly required for v1; a static
map from `type` → `{category: 'task'|'notification', dueAtField?}` is enough to
split the existing feed into two views.

## Proposed UI

```text
🔔 12                                          [Panel]
┌─────────────────────────────────────┐
│  Việc cần làm (5)   Thông báo (7)     │  ← two tabs, unread count per tab
├─────────────────────────────────────┤
│  TASK CENTER (Việc cần làm tab)       │
│                                        │
│  Cần tôi duyệt          2             │
│  Ticket quá SLA          1             │
│  Fitout trễ hạn          1             │
│  Đến hạn hôm nay         1             │
│  ──────────────────────────────────  │
│  🔴 Đề xuất #1023 · cần duyệt         │
│     Coffee House · giảm giá 12%       │
│     [Duyệt] [Từ chối]                 │
│  🟡 Ticket #212 · còn 40 phút SLA     │
│     [Xử lý]                           │
└─────────────────────────────────────┘
```

The "Thông báo" tab keeps today's flat feed behavior (read/unread, click to
navigate) — no regression for the informational case, which is already handled
reasonably.

## Why not merge into a bigger inbox metaphor

Per Phase 39 ("không được làm"): avoid over-engineering this into a full ticketing
inbox with threads/snooze/etc. The platform's actual task volume per user (from the
research: dashboard shows single-digit action counts even for busy roles) does not
justify that complexity. Two tabs on the existing panel, backed by a
classification map, meets the stated goal ("phân biệt Notification vs Task,
không được trộn hai loại này") without a rebuild.

## Relationship to Dashboard Action Items

The Dashboard's "Cần tôi xử lý" card (see
[07-DASHBOARD-REDESIGN](07-DASHBOARD-REDESIGN.md)) and this Task Center tab should
share one underlying task list, not compute two different views of "what's
pending" — the dashboard shows the top few, the Task Center tab shows the full
list. Today `ActionItems` (dashboard) and `NotificationCenter`'s approvals banner
are two independently-fetched, overlapping-but-not-identical lists (dashboard adds
overdue invoices/expiring contracts/bookings; notification panel only knows about
approvals) — consolidating them onto one task query removes that duplication.

## Priority

P0/P1 — the classification logic is cheap (a lookup map); the two-tab UI is a
moderate frontend change to an existing component. High value against the audit
brief's explicitly named problem ("Người dùng khó biết công việc nào đang chờ
mình"). See priority matrix in
[14-IMPROVEMENT-ROADMAP](14-IMPROVEMENT-ROADMAP.md).
