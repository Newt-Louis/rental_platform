# 07 — Golden UI Selection

## Chosen pages

1. **Dashboard** (`pages/dashboard/DashboardPage.tsx`) — the Dashboard
   archetype; every user lands here first.
2. **Booking Workspace** (`pages/bookings/BookingsPage.tsx`) — Transaction
   List + Operational Workspace archetypes; the most interaction-dense screen
   in the platform (dual unit/slot mode, drag-select, bulk actions, filters,
   detail sheets, multiple dialogs).
3. **Billing** (`pages/billing/BillingPage.tsx`) — the Financial Table
   archetype (chosen over Contracts because it's the platform's densest
   money-handling screen: multi-currency, bucket/aging breakdowns, an
   `InvoiceDetailSheet` Object Page, and the strictest existing rule — never
   abbreviate a transaction-table amount — making it the highest-value proof
   that the new design system doesn't compromise that rule).

Together they exercise: dashboard KPIs/charts, transaction tables, financial
tables with non-abbreviated amounts, filter/search toolbars, status badges,
bulk actions, a record-detail drawer, tabs, and both list and workspace
interaction models — i.e. 8 of the 10 archetypes touch at least one Golden
page (see `03-PAGE-ARCHETYPES.md`).

## What was verified, not just visually redesigned

- `tsc --noEmit` — clean, no type errors introduced.
- `npm run build` (production Vite build) — succeeds.
- `vitest run` on `DashboardPage.test.tsx` and `BookingsPage.test.tsx` — same
  pass/fail set before and after the redesign (verified by `git stash`-diffing
  against the pre-change baseline, the same method the prior Option B
  implementation used per `docs/implementation/OPTION_B_COMPLETION_REPORT.md`).
  9 pre-existing `BookingsPage.test.tsx` failures (cancel/delete-button
  lookups, a duplicate-text assertion) are **unrelated to this program** —
  identical failures reproduce on the unmodified baseline. Not fixed here
  (out of this program's scope: it's a test/selector bug, not a visual one),
  but flagged for the team.
- No handler, query key, mutation, or API call was touched in any of the
  three files — every diff is a `className` change or a swap to a shared
  component (`ERPStatCard`, `ERPStatusBadge`, `ERPToolbar`, `ERPAmount`,
  `ERPSection`, `PageHeader`, `AsyncState`) that renders equivalent DOM.

## Live browser screenshot verification

Not performed. The running Docker stack is the **production** compose profile
(static Nginx bundle, no dev hot-reload — confirmed via `docker-compose.yml`),
and no browser-automation tool was available in this session. Compile-time
and test-suite verification above substitute for it. Per this program's own
Phase 4/Definition of Done, the next step is human visual review in an actual
browser before any further rollout — this was not skipped, it's the intended
gate.
