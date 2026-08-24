# 06 — Object Page (Record Detail) Standard

Not one of the three Golden UI pages by name, but Billing's
`InvoiceDetailSheet` is a live instance of this pattern (a right-side drawer
detail view) and was restyled as part of the Golden Financial Table page —
its token pass (`bg-card`/`border-border` instead of `bg-white`/
`border-gray-200`) is documented here as the reference for future Object
Page work.

## Structure

```
Header (identity + status + close)
  → Workflow/step indicator (if the record has a lifecycle)
  → Key facts (counterparty, period, linked contract)
Body (scrollable)
  → Tab or stacked sections: Overview / Financial / Documents / Activity / History
Footer (fixed, primary action + secondary actions)
```

`InvoiceDetailSheet` already follows this shape: header with invoice number +
`ERPStatusBadge` + counterparty/period/contract-link, a 4-step workflow strip,
then stacked sections (fixed lines, variable lines, totals, adjustments,
documents, payment history), fixed footer with the primary action (issue /
record payment) determined by status. No structural change was made — only
the surface tokens.

## Rules

- **Identity + status + primary action must be visible without scrolling** —
  already true in `InvoiceDetailSheet` (all three are in the sticky header/
  footer, not the scrollable body).
- **Progressive disclosure**: don't show every section at once if the record
  doesn't need it — `InvoiceDetailSheet` already conditionally hides
  adjustments/documents/payment-history sections when empty rather than
  showing empty placeholders for all of them.
- **Tabs vs. stacked sections**: use tabs when sections are mutually
  exclusive views of the same record (e.g. a future Contract detail's
  Overview/Financial/Documents); use stacked sections when they're all part
  of reading the record top-to-bottom in order, as invoice line items →
  totals → payments already are. Don't force one record type into tabs just
  for consistency if stacked reading order serves it better.
- Every async action in the footer (issue, record payment, void, sync SAP)
  shows a pending label and disables itself while in flight — already true,
  unchanged.
