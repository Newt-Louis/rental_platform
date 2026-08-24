# 14 — Improvement Roadmap

> Phase 23 (Priority Matrix) + Phase 29 (Roadmap). Sequenced to interleave with,
> not duplicate, `FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md`'s Sprints A–F (reliability/
> engineering track). This roadmap is the UX/workflow track; where a sprint here
> depends on a V2 sprint landing first, it's noted explicitly.

## Priority matrix

```text
                         IMPACT
                   LOW              HIGH
EFFORT   ┌─────────────────┬─────────────────────┐
LOW      │  QUICK WIN       │  MUST DO             │
         │  FR-03 Parking   │  FR-01 RBAC fix      │
         │  merge nav       │  FR-02 Proposal CTA  │
         │  FR-09 Empty     │  FR-04 Approval ctx  │
         │  states (3 pgs)  │  FR-08 Dashboard      │
         │                  │  action coverage      │
         │                  │  09-Task/Notif split  │
         ├─────────────────┼─────────────────────┤
EFFORT   │  LATER           │  PROJECT              │
HIGH     │  08-Global search│  06-IA restructure    │
         │  Admin monolith  │  CRM/Bookings split   │
         │  split           │  (V2)                 │
         │                  │  Fitout/Billing/      │
         │                  │  Contracts tab redesign│
         └─────────────────┴─────────────────────┘
```

## P0 — Blocker (before Go-Live)

1. Fix FR-01 (TENANT/fitout RBAC drift) — one-line fix each side, prevents a live
   dead link for external users.
2. Fix FR-02 (Proposal creation entry point) — add visible CTA on Proposals list.
3. Fix FR-07 (Notification/Task split) — two-tab reclassification of existing feed.
4. Fix FR-09 (empty states on Contracts/Proposals/Billing Invoices) — replicate the
   existing Tickets pattern via the already-imported shared `AsyncState` component.

*Engineering-track P0 dependency (from V2 Sprint A, not restated here): atomic
billing generation and distributed scheduler lock should land before Go-Live
alongside these — a UX fix on top of a duplicate-invoice bug is not a real fix.*

## P1 — High (adoption-critical)

5. FR-04 — inline approval decision context.
6. FR-08 — extend Dashboard action coverage to fitout/patrol/work-orders.
7. FR-03 — merge Parking nav groups.
8. 06-IA — regroup `operations` sidebar into task clusters (Thi công & Bàn giao /
   Xử lý sự cố / An ninh & Bãi đỗ xe).
9. 11-Information Flow — add "Contract active but no Fitout/Billing started"
   action item (closes the biggest silent cross-module handoff gap).
10. CRM and Bookings monolith split (V2-identified, sequenced here because both
    sit directly in the platform's highest-frequency journey — Journey A).

## P2 — Medium (efficiency)

11. FR-11 — consolidate 6 reporting surfaces into 3 named-purpose ones.
12. FR-14 / V2 — Fitout (~15 tabs), Billing (11), Contracts (7) → summary-first
    progressive disclosure, per-screen specs in `docs/redesign/`.
13. 10-Design System — consolidate confirm dialogs, adopt PageHeader/EmptyState
    everywhere, scrolling tab primitive, Billing terminology glossary.
14. 08-Global Search (Ctrl+K) — reuse existing `entityLink()` mapping.

## P3 — Nice to have

15. Admin monolith split into 5 permission domains (V2) — real but not
    adoption-blocking since only Admin-role users are affected.
16. Onboarding/first-login tour, contextual help beyond `ErpProcessGuide`.
17. Operation role sub-scoping (FR-10) — genuinely valuable but requires either new
    permission granularity or a personal nav-pin/hide preference; sequence after
    the IA regrouping (P1 #8) proves out the task-cluster approach, since a cluster
    UI may reduce the urgency of full sub-role RBAC.

## Sprint sequencing (UX/workflow track — run alongside V2's Sprint A/B, not before)

| Sprint | Focus | Items |
|---|---|---|
| Sprint 0 | Foundation | Confirm-dialog consolidation, AsyncState/EmptyState adoption on the 3 flagged screens, RBAC table drift fix (FR-01) |
| Sprint 1 | Core UX | Dashboard redesign (07), Task/Notification split (09), Proposal entry point (FR-02) |
| Sprint 2 | Critical business flows | Approval context inline (FR-04), Contract→Fitout/Billing handoff action item, IA regrouping (06) |
| Sprint 3 | Forms & module redesign | CRM/Bookings split, Fitout/Billing/Contracts tab redesign |
| Sprint 4 | Search & consolidation | Global search (08), Reporting surface consolidation (FR-11) |
| Sprint 5 | Polish | Onboarding, Operation role scoping, Admin split, remaining P2/P3 |

## Recommended target experience

Restated from the personas/journeys work: a first-time Leasing Executive should be
able to log in, see "Tạo đề xuất" as an obvious first action, complete the
Lead→Booking→Proposal flow without leaving a guided path, and see their submitted
proposal's approval status without needing to be told where "Approvals" lives. A
Manager should be able to act on every pending approval from the dashboard/task
list without a second screen. None of this requires new modules — every piece
named above already exists in the codebase in a working but disconnected or
incompletely-surfaced form.
