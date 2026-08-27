# Redesign Spec — My Work / Task Center

**Purpose:** One place to see everything assigned to me or waiting on me, split
from pure informational notifications.
**Persona:** All staff.
**User goal:** "What is waiting on me right now, across every module?"

Full rationale in [09-TASK-NOTIFICATION-CENTER](../audit/09-TASK-NOTIFICATION-CENTER.md).

## Current problems

FR-07 — one flat notification feed mixes SLA breaches, escalations, and FYI
updates with no filtering; only approvals get special treatment (a separate
banner), and even that isn't part of a general "task" concept.

## Information hierarchy

1. Two tabs on the existing `NotificationCenter` panel: "Việc cần làm" / "Thông báo"
2. Within "Việc cần làm": grouped by type (Cần tôi duyệt / Ticket quá SLA / Fitout
   trễ hạn / ...), each row with enough context to act or a direct action button
3. "Thông báo" tab: unchanged flat feed behavior

## Components

- Extend `NotificationCenter.tsx` with a `Tabs` component (already in the
  shadcn/ui set used elsewhere).
- New: a `type` → `{category, dueAtField?}` classification map (see backlog
  Feature 2.1) — pure data, no new UI primitive required.

## States

- Empty "Việc cần làm" tab: positive confirmation state, not blank.
- Badge counts: two separate unread counts (task vs. notification) shown as two
  numbers, not summed into the single bell badge that exists today — avoids
  overstating urgency when most unread items are FYI.

## Permissions

No change — the underlying notification query is already scoped to the
authenticated user.

## Acceptance criteria

- `APPROVAL_PENDING`, `TICKET_SLA_BREACH`, `FITOUT_SLA_BREACH`,
  `FITOUT_ESCALATION`, `TICKET_ESCALATION` appear only in "Việc cần làm."
- `PROPOSAL_APPROVED`, `SYSTEM` (AI insight) appear only in "Thông báo."
- Existing click-to-navigate behavior (`entityLink()`) is preserved in both tabs.
