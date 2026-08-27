# 01 — Current UI Audit

Scope: visual/presentation consistency only — business logic was not audited
(see `docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md` and `docs/audit/` for that).
Findings already on record in `docs/audit/10-DESIGN-SYSTEM-AUDIT.md` are cited,
not repeated in full, with a note on what this program does about them.

## Application shell

`apps/frontend/src/components/Layout.tsx` — header (h-14, flat, bordered),
collapsible sidebar (`bg-gray-900`, fixed on mobile/static on desktop),
`ErpProcessGuide` breadcrumb-equivalent above the outlet. **This is already
close to the target pattern** — flat, bordered, no gradients. Left unchanged
by this program; it did not need Golden UI treatment.

## Base component library

`apps/frontend/src/components/ui/*` — shadcn/ui + Radix + CVA, Tailwind CSS
variables for theming (`index.css`), dark mode via `.dark` class. Solid
foundation: `Button` already has a proper `cva` variant system, `Table`/
`Dialog`/`Select`/`Input` are Radix-backed and accessible. The problem was
never the primitives — it was **pages bypassing them** with inline ad hoc
markup, and one token being wrong.

### Confirmed inconsistencies (own research + `docs/audit/10-DESIGN-SYSTEM-AUDIT.md`)

| Area | Finding | Evidence |
|---|---|---|
| Primary color | `--primary` was `hsl(50 100% 91%)` — pale cream/yellow — used for the `default` Button variant. Low-contrast, reads as decorative, not actionable. `--ring` (focus ring, used app-wide) pointed at the same cream value. | `index.css` (pre-change) |
| Radius | `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-[26px]`/`rounded-[28px]` all used for the same kind of container (card, section, hero) across Dashboard/Bookings/Billing | grep across `pages/dashboard`, `pages/bookings`, `pages/billing` |
| Decorative dashboards | Dashboard and Billing both had a full-bleed gradient hero (`bg-gradient-to-br`, `bg-[linear-gradient(...)]`) with glow/blur decorative circles, hover-lift + scale-on-hover stat cards | `DashboardPage.tsx`, `BillingPage.tsx` (pre-change) |
| Status badges | Each page defines its own status→color map inline (Bookings' `UNIT_STATUS_CONFIG`/`SLOT_STATUS_CONFIG`, Billing's `STATUS_MAP`) with independent Tailwind literals, no dark-mode variants, no shared vocabulary | `bookings-constants.ts`, `BillingPage.tsx` |
| KPI tiles | Three different implementations of "the same" stat tile: Dashboard's gradient-accent `StatCard` (hover-lift, scale), Bookings' plain bordered button, Billing's colored bucket button — same job, three components | pre-change `DashboardPage.tsx`, `BookingsPage.tsx`, `BillingPage.tsx` |
| Raw tables | Bookings and Billing both hand-roll `<table>` with inline Tailwind instead of `components/ui/table.tsx`'s exported primitives, and use `text-gray-*`/`bg-white` literals instead of the semantic tokens (`text-muted-foreground`, `bg-card`) — meaning **these tables did not respect dark mode** despite the app having a working theme toggle | `BookingsPage.tsx`, `BillingPage.tsx` |
| Button hierarchy | Primary CTAs (`Tạo booking`, `Tạo slot`) hard-coded `bg-amber-600`/`bg-violet-600` instead of the `Button` `default` variant — meaning changing the brand primary color would not have updated them | `BookingsPage.tsx` |
| `PageHeader` adoption | Already flagged in `docs/audit/10-DESIGN-SYSTEM-AUDIT.md` as underused. Confirmed: Dashboard and Billing built their own bespoke header markup instead of `components/ui/page-header.tsx` | pre-change `DashboardPage.tsx`, `BillingPage.tsx` |
| `AsyncState`/`EmptyState` adoption | Also flagged in the same prior audit (imported but empty-state CTA slot often unused). Confirmed in Bookings/Billing: hand-rolled empty-state `<div>` blocks duplicate what `AsyncState`'s `isEmpty` branch already does | pre-change `BookingsPage.tsx`, `BillingPage.tsx` |

## What's already good (preserve, don't rebuild)

- **Currency formatting discipline** — `lib/currency.ts`'s three-tier
  `formatMoney`/`formatMoneyAmount`/`formatMoneyCompact` split, with the
  explicit rule that compact notation is KPI-tile-only and transaction tables
  must always show full precision. This program encodes that rule structurally
  in the new `ERPAmount` component (`08-COMPONENT-ARCHITECTURE.md`) rather than
  relying on every author remembering the comment in `currency.ts`.
- i18n discipline (Vietnamese-first, `t()` everywhere) — confirmed still
  consistent, per `docs/audit/10-DESIGN-SYSTEM-AUDIT.md`.
- Loading-state skeletons — present and consistent, not a gap.
- RBAC-aware nav (`lib/permissions.ts`) and mall-scoping — out of visual
  scope, unchanged.

## Archetype coverage in the 3 Golden pages

| Page | Archetypes exercised |
|---|---|
| Dashboard | Dashboard, KPI row, Analytics widgets |
| Booking Workspace | Transaction List, Toolbar/Filter Bar, Operational Workspace (dual unit/slot mode), Bulk actions |
| Billing | Financial Table, Master Data-style bucket/source breakdown, Tabs (Object Page-adjacent), Detail drawer |

See `07-GOLDEN-UI-SELECTION.md` for why these three.
