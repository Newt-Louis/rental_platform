# 02 — ERP Design System

This is the visual expression of `docs/ERP_UX_STANDARD.md`'s behavioral rules.
Where the two overlap, `ERP_UX_STANDARD.md` wins on interaction/copy; this
document wins on token/component choice.

## Typography

System stack (Tailwind default), no custom webfont — keeps bundle size down
and matches native OS rendering, which reads as "tool" not "marketing site".

| Role | Class | Use |
|---|---|---|
| Page title | `text-xl sm:text-2xl font-semibold tracking-tight` | `PageHeader` title |
| Eyebrow | `text-xs font-semibold uppercase tracking-wide text-muted-foreground` | `PageHeader` eyebrow, `ERPStatCard` label |
| Section title | `text-sm font-semibold` | `ERPSection` title, `CardTitle` |
| Body | `text-sm` | default |
| Micro/meta | `text-xs` | table meta rows, timestamps |
| KPI value | `text-2xl font-semibold tabular-nums` (compact tile: `text-lg`) | `ERPStatCard` value |

`tabular-nums` is mandatory on any numeric value that appears in a column or
next to other numbers (KPI tiles, table amount cells) so digits align.

## Spacing & grid

- Page-level vertical rhythm: `space-y-6` between major sections.
- KPI grids: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4` (2 cols on
  mobile, 4 on desktop — never more than 4 wide, or tiles get too narrow to
  read).
- Card/section padding: `p-4` default, `p-3` for compact/filter-tile density.
- Table cell padding: `px-4 py-3` (list rows), `px-3 py-2` (dense sub-tables
  like invoice line items).

## Color

CSS custom properties in `apps/frontend/src/index.css`, consumed via Tailwind
tokens (`bg-card`, `text-muted-foreground`, `border-border`, etc.) — never
raw `gray-*`/`white`/`slate-*` literals in new code, because those don't
respond to the `.dark` class.

- **Primary** — enterprise blue (`hsl(221 83% 41%)` light / `hsl(217 91% 60%)`
  dark). Replaces the previous pale-yellow token. One primary color for
  filled buttons, focus rings, and the "brand" semantic tone — used
  consistently instead of amber/violet/etc. showing up as ad hoc primary CTAs.
- **Semantic tones** — `apps/frontend/src/lib/erp-tones.ts` defines six:
  `neutral`, `info`, `success`, `warning`, `danger`, `brand`. Every status
  badge, KPI accent, and stat-tile tone in the Golden pages resolves to one of
  these instead of a page-local hex/Tailwind-color literal. Each tone has a
  light and dark variant baked in.
- **Domain accent colors** (amber for unit bookings, violet for slot bookings,
  per-source colors in Billing) are kept — they are a *consistent, functional*
  wayfinding device (which booking mode / which revenue source), not
  decoration. The rule: an accent color is allowed when it labels a stable
  domain concept used the same way everywhere; it is not allowed as an
  arbitrary per-page choice for the *same* concept (that's what the tone
  system replaces).

## Surfaces, borders, radius, shadow

- Surface hierarchy: `bg-background` (page) → `bg-card` (section/table/dialog)
  → `bg-muted` (recessed: table header tint, empty state).
- Border: `border-border` everywhere; no bespoke `border-gray-200` etc.
- Radius: **`rounded-lg` (8px) for containers** (cards, sections, table
  wrappers, toolbars), `rounded-md` (6px) for controls (buttons, inputs,
  badges), `rounded-full` only for avatars/dots/pill-toggles. `rounded-xl`/
  `rounded-2xl`/arbitrary-px radii are retired from new code.
- Shadow: `shadow-sm` at most, on floating surfaces only (dropdowns, dialogs,
  drawers via Radix defaults). No `shadow-lg`/`shadow-2xl`/glow decoration on
  static content, no hover-lift/scale transforms on cards.

## Icons

`lucide-react`, already used consistently app-wide — kept. Sizing convention:
13–15px inline in text/table cells, 16–18px in nav/KPI icon chips, 18–20px in
sidebar nav. Icons are decorative by default (no `aria-label` needed) unless
they are the only content of an interactive element, per `ERP_UX_STANDARD.md`'s
icon-only-button rule.

## Button hierarchy

Unchanged from `components/ui/button.tsx`'s existing `cva` variants — the
system was already correct, pages just weren't using it:

`default` (primary, one per screen/dialog) → `outline`/`secondary` → `ghost`
(navigation/low-priority) → `destructive` (irreversible, confirm first).
`success`/`warning` variants exist for explicit positive/caution actions.
Golden-page change: domain-colored CTA buttons (`bg-amber-600 text-white`
"Tạo booking", `bg-violet-600` "Tạo slot") now use the `default` variant so
there is exactly one primary-action color app-wide.

## Status colors

Canonical tone table (`erp-tones.ts`) + `ERPStatusBadge` component. A page
still owns *which* tone a given domain status maps to (only Billing knows
`OVERDUE` = danger) — the design system owns how each tone renders.

## Form controls

Already standardized via `components/ui/input.tsx`, `select.tsx`,
`textarea.tsx` (Radix + consistent `h-9`, `border-input`, focus-ring). No
change needed — see `05-FORM-STANDARD.md` for composition rules on top of
these primitives.

## Table density

Default row height `py-3` (px-4 horizontal); dense sub-tables (invoice line
items inside the detail drawer) use `py-2`/`px-3`. See `04-TABLE-STANDARD.md`.

## Modal/drawer behavior

`Dialog` (centered, `max-w-lg` default) for short forms/confirmations;
right-side fixed drawer (as in Billing's `InvoiceDetailSheet`) for record
detail that needs to stay next to the list it was opened from. Both now use
`bg-card`/`border-border` tokens instead of `bg-white`/`border-gray-200`.

## Responsive behavior

KPI grids collapse 4→2→1 columns; toolbars wrap (`flex-wrap`); wide tables
scroll horizontally inside their own container (`overflow-x-auto`) rather than
the page scrolling. Full card-fallback-for-tables-on-mobile (per
`ERP_UX_STANDARD.md`) remains an open item — flagged, not solved, by this
program (see `09-ROLLOUT-PLAN.md`).

## Accessibility

Inherits `ERP_UX_STANDARD.md`'s rules (36–44px touch targets, visible focus,
color-never-alone). This program's contribution: fixed the app-wide focus
ring (`--ring`) which was pointing at a near-invisible cream color; added
`dark:` variants to every new tone class so status/KPI color meaning survives
the theme toggle, which most pre-existing hard-coded badge colors did not.
