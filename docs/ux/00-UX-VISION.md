# 00 — UX Vision

## Relationship to prior work

This program is the **visual design-system layer** of the platform's UX work —
distinct from, and building on top of, two things that already exist:

- **`docs/ERP_UX_STANDARD.md`** — the *interaction/behavioral* standard (action
  hierarchy, naming, workflow-screen rules, forms, mobile/a11y). Still
  authoritative. This program does not replace it; the visual system defined in
  `02-ERP-DESIGN-SYSTEM.md` is how that standard gets expressed in pixels.
- **`docs/audit/` + `docs/implementation/`** — the 2026-08-18 full-platform UX
  audit and its Option B (IA/workflow restructure) implementation. Option B is
  done. Option C — "full design-system cleanup" — was explicitly deferred
  (`docs/audit/15-IMPLEMENTATION-BACKLOG.md` Epic 6/7,
  `docs/implementation/OPTION_B_COMPLETION_REPORT.md`). **This program is that
  deferred design-system cleanup.** `docs/audit/10-DESIGN-SYSTEM-AUDIT.md`'s
  findings (PageHeader underused, `AsyncState`/`EmptyState` CTA slots left
  empty, no shared status-tone system) are cited, not re-derived, in
  `01-CURRENT-UI-AUDIT.md`.

## Problem

The platform is functionally strong (see `docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md`,
`docs/audit/`) but visually inconsistent: three different card-shadow styles,
gradient hero banners on some pages and flat headers on others, five different
status-badge color systems, ad hoc buttons that bypass the shared `Button`
component's variant system. It reads as a collection of screens built by
different people at different times, not one product.

## Target

An internal, daily-use enterprise leasing ERP that reads like **SAP Fiori /
Microsoft Dynamics**, not a consumer SaaS marketing site:

- Flat surfaces, restrained radius, no decorative gradients or shadow-lift
  hover effects.
- One button hierarchy, one status-tone vocabulary, one KPI-tile component —
  used everywhere, not reinvented per page.
- Financial values are never abbreviated in a transaction table (already a
  hard rule in `apps/frontend/src/lib/currency.ts` — the design system makes
  it structural, not just documented, via the `ERPAmount` component).
- Dense, scannable tables over decorative dashboards.

## What this program does NOT change

Business rules, backend semantics, database schema, authorization, or currency
formatting/aggregation semantics. Every change in this program's Golden UI
implementation is a `className`/component-composition change; no handler,
query, mutation, or data shape was modified. Verified by running the existing
`DashboardPage.test.tsx` / `BookingsPage.test.tsx` suites before and after
(see `07-GOLDEN-UI-SELECTION.md`) and by `tsc --noEmit` + `vite build` passing
clean.

## Sequencing

Phases 1–3 (audit → design system → Golden UI for Dashboard, Booking
Workspace, Billing) are implemented now. Phase 6 (`09-ROLLOUT-PLAN.md`) is
written but **not executed** — no other module was touched. Next step is human
visual review, per the program's Definition of Done.
