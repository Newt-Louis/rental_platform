# 08 — Component Architecture

New shared components live in `apps/frontend/src/components/erp/` (barrel:
`index.ts`), backed by tone tokens in `apps/frontend/src/lib/erp-tones.ts`.
Built by **extending** existing infrastructure, not replacing it — per the
program's instruction to reuse existing component infrastructure where
sensible.

| Component | File | Replaces | Notes |
|---|---|---|---|
| `ERPStatCard` | `ERPStatCard.tsx` | Dashboard's gradient `StatCard`, Bookings' bare stat buttons, Billing's colored bucket/source buttons | One KPI-tile component: `label`/`value`/`valueTitle`/`helpText`/`icon`/`tone`/`badge`/`to`/`onClick`/`selected`/`size` ("default" \| "compact"). Handles both dashboard KPIs and clickable filter-tiles (bookings stat tiles, billing buckets) — same component, `selected` prop drives the filter-tile ring state. |
| `ERPStatusBadge` | `ERPStatusBadge.tsx` | Page-local `Badge className={...}` status pills | Takes a `tone` (`ERPTone`) instead of a raw class string; page still owns the domain status→tone map. |
| `ERPAmount` | `ERPAmount.tsx` | Inline `formatMoneyAmount(...)` calls in table cells | Always full precision (never `formatMoneyCompact`) — structurally enforces the "never abbreviate a transaction-table amount" rule from `lib/currency.ts`'s own doc comments, rather than relying on every call site remembering it. `tone` ("default"\|"success"\|"danger"\|"muted") for paid/overdue/balance emphasis, `strong` for bold totals. |
| `ERPToolbar` | `ERPToolbar.tsx` | Bare `flex flex-wrap gap-3` filter rows | One bordered surface (`rounded-lg border border-border bg-card`) for search+filter+action rows — used in Bookings (both unit and slot filter rows) and Billing's invoice filter row. |
| `ERPSection` | `ERPSection.tsx` | Ad hoc `Card`+`CardHeader`+`CardTitle` nesting for a titled content block | Flat `rounded-lg border` with an optional header row (title/description/actions) — used for Dashboard's occupancy/cashflow/action-items panels. |

`PageHeader` (`components/ui/page-header.tsx`) and `AsyncState`/`EmptyState`
(`components/ui/async-state.tsx`, `empty-state.tsx`) already existed and were
**adopted**, not rebuilt — Dashboard and Billing now use `PageHeader` instead
of bespoke hero markup; Bookings and Billing now route their empty states
through `AsyncState`'s `isEmpty` branch instead of hand-rolled `<div>`s. This
directly closes the two gaps `docs/audit/10-DESIGN-SYSTEM-AUDIT.md` already
flagged for these exact components.

## Not built (deliberately)

- **A generic `ERPDataTable` with client-side sort/column-visibility/paging**:
  Bookings' table has working drag-select (`useDragSelect`) and grouped rows
  keyed to specific `data-booking-id`/`data-section` attributes; Billing's
  invoice table drives an `InvoiceDetailSheet` on row click. Replacing the
  markup with a new generic grid component would have meant re-implementing
  that behavior for no visual gain — the existing `<table>` markup already
  renders correctly once restyled onto the shared tokens. `components/ui/
  table.tsx`'s primitives remain the recommended base for genuinely new
  tables (`04-TABLE-STANDARD.md`).
- **`ERPActionBar`**: Bookings' existing `BulkSelectionBar` already does this
  job (selection count + bulk actions, appears on selection) — reused as-is,
  no new component needed.
- **`ERPDetailHeader`/`ERPFormSection`**: no Golden page required a *new*
  detail-header or form-section component — `InvoiceDetailSheet`'s existing
  header markup and Billing's existing add-cost-line form section already
  matched the target pattern once token-restyled (see `06-` and `05-`
  standards). Named here as future work, not fabricated ahead of a real need,
  per the program's own "don't create abstraction for abstraction's sake"
  instruction.

## Token layer

`lib/erp-tones.ts` exports `ERPTone` (`neutral`\|`info`\|`success`\|`warning`\|
`danger`\|`brand`) and three class maps (badge/icon-chip/dot) keyed by tone,
each with light + `dark:` variants. This is the single place a future palette
change happens — components consume the maps, they never inline a tone's
Tailwind classes themselves.
