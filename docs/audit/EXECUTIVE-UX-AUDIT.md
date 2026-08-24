# Executive UX Audit — THISO Leasing Platform

**Date:** 2026-08-18 · **Scope:** Full-platform UX/UI and user-flow audit (no code
changed). **Companion documents:** `docs/audit/00-15`, `docs/redesign/*`. Builds on,
and does not duplicate, the existing engineering-focused
`docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md` and `docs/ERP_UX_STANDARD.md`.

## Executive Summary

THISO's leasing platform is functionally broad — one ERP instance covering the
full lease lifecycle from lead to SAP sync across 27 backend modules and ~40
frontend screens, already used by 9 distinct role types including an external
tenant persona. The engineering underneath is more mature than a typical
first-build system: business-language status models throughout, real background
automation (contract expiry, SLA escalation, dunning), and a config-driven
approval-policy engine. The platform's problem is not missing capability. It is
that several genuinely good pieces of UX thinking already present in the
codebase — the `ErpProcessGuide` process strip, task-sequenced sidebar groups for
the sales flow, a well-built Tickets module, strong form prefill — were not
applied consistently everywhere else, leaving new users to rediscover, module by
module, what the system already knows how to teach them.

## Current State

- 28 routes, ~40 page components, 27 backend modules, 9 roles, one shared
  database — a single coherent ERP, not a loose collection of apps (00-SYSTEM-INVENTORY).
- The core revenue journey (Lead→Booking→Proposal→Approval→Contract) works
  end-to-end in the code, but has two undiscoverable seams a first-time user will
  hit immediately: Proposals has no visible "create" action (FR-02), and the
  Lead→Booking prerequisite is invisible (03-USER-JOURNEYS Journey A).
- Tickets and Tenant Portal are the platform's best-executed screens today and
  should be the reference pattern for the rest, not touched further.

## Main Problems (Top 10)

1. **FR-01 — Live RBAC drift**: frontend grants Tenant a `/fitout` nav item the
   backend rejects — a confirmed dead link for an external persona.
2. **FR-02 — No Proposal creation entry point** on the Proposals screen itself.
3. **FR-07 — Notifications and Tasks are not separated** — the exact capability
   the audit brief named as missing, confirmed absent in code.
4. **FR-04 — Approval decisions require a screen switch** to see deal context.
5. **FR-09 — 3 of 4 flagship list screens have no empty-state CTA**, while the
   fix pattern already exists in the same codebase (Tickets).
6. **FR-12 — Inconsistent sidebar grouping principle** (task-sequence in two
   groups, technical-module in four).
7. **FR-11 — 6 overlapping reporting surfaces** with no stated distinction of
   purpose (independently flagged in V2).
8. **FR-10 — One `OPERATION` role covers 7 unrelated jobs**, all shown with equal
   prominence regardless of the user's actual day-to-day work.
9. **11-Information Flow — Contract activation doesn't visibly hand off** to
   Fitout/Billing; a manager must know from memory to start both manually.
10. **V2-confirmed screen complexity** — CRM (~2,500 lines), Bookings (~2,200
    lines/17 dialogs), Fitout (~15 tabs), Billing (11 tabs), Admin (monolith) —
    all high-frequency or high-stakes screens.

## Root Causes

- **Two IA philosophies coexist without a signal distinguishing them.** The team
  clearly reached for task-sequenced grouping once (`salesProcess`) and proved it
  works, but didn't extend the pattern to the rest of the sidebar, instead falling
  back to grouping by backend module for everything added since.
- **Modules were built and shipped independently against a shared data model**,
  so each module's UX quality reflects whoever built it last, rather than a
  platform-wide standard — visible in the gap between Tickets (excellent) and
  Contracts/Proposals/Billing (bare empty states) despite all four using the same
  underlying shared components.
- **Notifications grew module-by-module** (8 producers) onto one generic consumer
  surface that was never revisited to add task/notification typing, even though
  the underlying `type` field already carries enough information to support it.

## User Impact

New Leasing Executives cannot complete the platform's own primary revenue task
(create a proposal) from the obviously-named screen for it. Managers spend an
avoidable extra screen-switch on every single approval decision — the platform's
highest-frequency executive action. Operation staff, the role with typically the
least technical background, face the most cognitively loaded nav (7 unrelated
areas under one role) and the least dashboard support (`focusAreas` covers only
2 of their 7 areas). None of this blocks the platform from functioning — it slows
adoption and increases dependence on someone experienced walking new users
through it, which is precisely the outcome this audit was commissioned to prevent.

## Recommended Target Experience

A first-time Leasing Executive should log in, see an obvious "Tạo đề xuất" action,
and complete Lead→Booking→Proposal without needing to be told proposals live
inside Bookings. A Manager should act on every pending approval from a single
list, with the deal context already there. Every list screen should look and
behave like Tickets does today — that module is proof the standard is achievable
inside this codebase, not an aspiration.

## P0 — Before Go-Live

1. Fix the confirmed RBAC drift (FR-01) — one-line change each side.
2. Add a visible Proposal creation entry point (FR-02).
3. Split Notifications from Tasks in the notification panel (FR-07).
4. Bring Contracts/Proposals/Billing-Invoices empty states up to the Tickets
   pattern (FR-09).

*(These four are UI/config-level fixes against code that already exists —
none require new architecture. They should land alongside V2's own Sprint A
reliability items — atomic billing, distributed scheduler lock — since a UX fix on
top of a duplicate-invoice bug is not a durable fix.)*

## Quick Wins

- Merge the two Parking nav groups into one (FR-03).
- Extend the Dashboard action list to include fitout SLA breaches (FR-08) —
  a query addition against data that already exists.
- Add a "Contract active, no Fitout/Billing started" action item — closes the
  single biggest silent cross-module handoff gap found in this audit
  (11-Information Flow), at near-zero engineering cost.

## Strategic Improvements

- Regroup the sidebar into task clusters platform-wide (06-Information
  Architecture / 13-UX-Blueprint), consolidating Parking, reporting surfaces, and
  Operations into coherent task groups.
- Split CRM and Bookings into task-oriented workspaces (V2-identified complexity,
  addressed here as a UX/discoverability fix, not just a code-size concern).
- Introduce a Ctrl+K global search (08-Global-Search) — no equivalent exists
  today across a platform where one deal spans 4+ differently-IDed entities.
- Regroup Fitout/Billing/Contracts from flat high-count tab bars into
  summary-first, task-clustered views (see the five `docs/redesign/*.md` specs).

## Roadmap

See [14-IMPROVEMENT-ROADMAP](14-IMPROVEMENT-ROADMAP.md) for the full priority
matrix and sprint sequencing (Sprint 0 foundation → Sprint 5 polish), designed to
run alongside — not block on — V2's engineering-reliability sprints.

## Go-Live Recommendation

**CONDITIONAL GO.**

The platform can support real mall-staff usage today for the core leasing
journey, but should not go live without the four P0 items above — one of them
(FR-01) is a live, reachable defect for an external user class (tenants), and
another (FR-07) is the literal capability this audit was commissioned to verify.
None of the four P0 items require architectural change; all reuse existing
components and patterns already proven elsewhere in this same codebase. Full GO
should also require V2's own Sprint A reliability items (atomic billing,
scheduler lock) landing on the same timeline, since they sit on the identical
critical path to a trustworthy production launch.

---

## Checkpoint

Per the audit process, implementation does not begin automatically. Choose a
scope:

**OPTION A — Quick UX Fix.** P0 items only (Epics 1, 2, 5 in
[15-IMPLEMENTATION-BACKLOG](15-IMPLEMENTATION-BACKLOG.md)): RBAC drift fix,
Proposal entry point, Notification/Task split, empty-state consistency. Days, not
weeks — every item reuses existing components.

**OPTION B — UX Restructure.** Option A + navigation regrouping, dashboard action
coverage, approval decision context, and the Contract→Fitout/Billing handoff
signal (Epics 3, 4 + Quick Wins). Addresses the platform's structural
"module-first not task-first" problem, not just its sharpest edges.

**OPTION C — Full Platform UX Transformation.** Option B + the five module
redesigns (CRM/Bookings, Contracts, Billing, Fitout — Epic 7), global search
(Epic 6), reporting-surface consolidation, and design-system consolidation
(consistent confirm dialogs, PageHeader/EmptyState adoption, terminology
glossary). This is the full roadmap through Sprint 5.

Awaiting direction before any implementation begins.
