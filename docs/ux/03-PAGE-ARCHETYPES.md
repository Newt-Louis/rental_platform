# 03 — Page Archetypes

Ten reusable patterns. Every module maps to one (or a tab-set combining a few)
of these instead of being designed independently. Golden UI implements the
three marked ✅; the rest are specified for the rollout waves in
`09-ROLLOUT-PLAN.md`.

| # | Archetype | Shape | Example in this codebase |
|---|---|---|---|
| 1 | Dashboard | `PageHeader` → KPI grid (`ERPStatCard`) → 2–3 col widget row (`ERPSection`) | ✅ `pages/dashboard/DashboardPage.tsx` |
| 2 | Master Data List | `PageHeader` + primary "Create" action → `ERPToolbar` (search/filter) → table → pagination | Tenants, Spaces |
| 3 | Transaction List | Same as #2 + stat-tile row (`ERPStatCard` grid, filter-by-click) + status tabs | ✅ `pages/bookings/BookingsPage.tsx` |
| 4 | Record Detail | See `06-OBJECT-PAGE-STANDARD.md` | Contract detail, Invoice detail drawer |
| 5 | Create/Edit Form | See `05-FORM-STANDARD.md` | Booking/Proposal dialogs |
| 6 | Approval Workspace | Record header + decision context + approve/reject with reason | `pages/approvals/ApprovalsPage.tsx` |
| 7 | Operational Workspace | Dual-mode or multi-pane live-state view, bulk selection, drag-select | ✅ Bookings (unit/slot toggle, `Selecto` drag-select, `BulkSelectionBar`) |
| 8 | Financial Table | Transaction List + non-abbreviated `ERPAmount` columns + currency column + bucket/aging breakdown | ✅ `pages/billing/BillingPage.tsx` |
| 9 | Analytics/Reports | KPI row + chart widgets, no row-level actions | Reports, Analytics |
| 10 | Admin/Configuration | Tabbed settings, form-heavy, low data density | Admin page |

## Composition rule

A page is allowed to combine archetypes across tabs (Billing = Financial
Table tab + Analytics-ish AR Aging tab + Admin-ish Dunning/Schedule tabs under
one `Tabs` shell) — that's normal. What's not allowed is a *single* screen
inventing a new one-off layout for a job one of these ten already covers.
