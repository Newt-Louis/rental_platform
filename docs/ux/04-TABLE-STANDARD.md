# 04 — Table Standard

Tables are first-class ERP components — most user time is spent in one.

## Structure

- Container: `rounded-lg border border-border bg-card overflow-x-auto` (wide
  tables scroll inside this container, never the page).
- Header row: `bg-muted/40 border-b border-border`, cells
  `text-muted-foreground text-xs uppercase tracking-wider font-medium`.
- Body rows: `divide-y divide-border`, `hover:bg-muted/40` (or a domain accent
  hover where that accent is already load-bearing, e.g. Bookings'
  amber/violet hover tint), selected row gets `bg-blue-50` +
  `border-l-2 border-l-blue-500` (dark: `dark:bg-blue-950/30`).
- Prefer `components/ui/table.tsx`'s exported primitives
  (`Table`/`TableHeader`/`TableRow`/`TableHead`/`TableCell`) for new tables.
  Existing hand-rolled `<table>` markup in Golden pages was restyled in place
  to the same token vocabulary rather than restructured, to avoid touching
  working drag-select/bulk-selection logic that depends on specific
  `data-*` attributes on the row/cell elements — a mechanical tag swap with no
  behavioral upside was not worth the regression risk. New tables should use
  the components directly.

## Toolbar (`ERPToolbar`)

One bordered row (`ERPToolbar` component) containing, left to right: search
input (icon-prefixed), filter selects, then push-right (`ml-auto`) primary
action. Active-filter clear button appears only when a filter is dirty/applied
(already the existing behavior in Bookings/Billing — preserved).

## Column rules

- **Numeric/amount columns are right-aligned**, header included.
- **Amount + Currency**: amount in its own column via `ERPAmount` (always
  `formatMoneyAmount` — full precision, tabular-nums), currency code in an
  adjacent column. Never combine a compact/abbreviated number with a currency
  symbol in a transaction row — that's reserved for KPI tiles
  (`formatMoneyCompact`, see `lib/currency.ts`).
- **Status** column uses `ERPStatusBadge` with a page-local status→tone map.
- **Row actions** right-aligned, icon buttons, `title` tooltip in Vietnamese.

## Sorting / column visibility / row selection / bulk actions

Not newly built for Golden UI — Bookings' existing drag-select
(`useDragSelect`) + `BulkSelectionBar` pattern is the reference implementation
for row selection and bulk actions and should be reused, not reinvented, when
other Transaction List pages need it. Sorting and column-visibility toggles
are not present in any current table and are out of this program's scope —
tracked as a rollout-wave item, not fabricated here.

## Sticky header

Not applied in Golden UI (none of the three pages' tables are tall enough on
a typical viewport to need it) — apply `sticky top-0` on the header row +
`bg-card`/`bg-muted` background (required so content doesn't show through)
only on tables where the row count regularly exceeds one screen.

## Pagination

Footer: `flex items-center justify-between px-4 py-3 border-t border-border`,
left = total count text, right = prev/page-indicator/next buttons
(`variant="outline" size="sm"`). Unchanged from existing Bookings/Billing
pattern — already consistent.

## Empty state

`AsyncState` with `isEmpty` (title + description + optional `emptyAction`) —
**not** a hand-rolled `<div>` with a centered icon. Golden UI replaced three
hand-rolled empty blocks (Bookings unit/slot tables, Billing invoice list)
with this, closing the gap `docs/audit/10-DESIGN-SYSTEM-AUDIT.md` already
flagged (FR-09).

## Loading state

Skeleton rows (`<Skeleton>` in a rough row shape) — already consistent
app-wide per the prior audit; unchanged.
