# 05 — Form Standard

Behavioral rules already defined in `docs/ERP_UX_STANDARD.md` ("Forms"
section — grouping by business decision, visible labels, inline validation,
units on currency/area/date/percent, unsaved-changes confirmation, result-
stating success messages). This document adds the visual composition on top;
it does not restate what's already decided there.

## Layout

- Group fields into labeled sections (not one flat list) — Billing's
  "Add cost line" / adjustment forms and Bookings' create dialogs already do
  this; keep it as the pattern for any new form.
- Field width: full-width within its section by default; pair short fields
  (qty + unit price, date-from + date-to) with `grid grid-cols-2 gap-2` —
  already the existing convention in `BillingPage.tsx`'s add-cost form and
  `DateRangePicker`.
- Label above input, `text-sm font-medium`; required marker is a red
  `*` suffix, not a separate "(required)" string.
- Helper text only when the field's purpose isn't obvious from the label
  (e.g. Billing's live subtotal preview while entering qty × unit price) —
  per `ERP_UX_STANDARD.md`, no filler helper text.

## Primary action placement

`DialogFooter` (or the drawer's fixed footer, as in `InvoiceDetailSheet`):
secondary/cancel on the left (or first in DOM order, right-aligned on
desktop per `components/ui/dialog.tsx`'s existing `sm:justify-end` footer),
primary action last, using the `default` Button variant. This is already
consistent across every dialog checked (`ConfirmDialog`, `RecordPaymentDialog`,
booking create dialogs) — no change made, documented as the standard so new
forms don't drift from it.

## Validation

Inline, next to the field, in `text-xs text-red-500` — already the pattern
(e.g. cancel-reason min-length hint in `BookingsPage.tsx`). Disable the
primary action rather than allow a submit that will just error, when the
invalid state is cheap to detect client-side (already done for e.g. the
bulk-cancel reason field).

## Tab order

Native DOM order = visual order (top-to-bottom, left-to-right within a
row) — no `tabIndex` overrides in any form reviewed. Keep it that way; a
form section using `grid grid-cols-2` must keep left-then-right DOM order to
match visual reading order.
