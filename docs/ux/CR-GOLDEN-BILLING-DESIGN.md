# CR — Golden Billing Design

**GOLDEN BILLING:** CLOSED

**HUMAN VISUAL SIGN-OFF:** PASS — 2026-08-24

**Target archetype:** Financial / Document Workspace

**Phase:** APPROVED / CLOSED

**Depends on:** `docs/ux/CR-GOLDEN-BILLING-READINESS.md`

## 1. Design objective

Golden Billing should become the reusable reference for dense ERP financial
worklists and single-document action context. It must let a Finance user answer
within seconds:

1. What requires action now?
2. Which document and counterparty are affected?
3. What is the exact amount and currency?
4. What has been collected and what remains outstanding?
5. When is it due and how overdue is it?
6. Which action is currently allowed?

It is not a dashboard, consumer-fintech experience or gallery of cards. The
invoice worklist is the dominant surface.

## 2. Design principles

- Preserve the current Billing lifecycle, APIs and authorization unless a
  separate reviewed prerequisite explicitly changes them.
- Use existing ERP tokens and shared components.
- Favor rows, columns, dividers and typography over decorative containers.
- Keep financial values tabular, exact and right-aligned.
- Treat currency as part of the data, never as a locale assumption.
- Show current status and next permitted action; do not invent a linear visual
  state machine.
- Keep dangerous financial actions contextual, confirmed and secondary.
- Keep list context visible while inspecting one invoice.

## 3. Target information architecture

```text
COMMAND HEADER
  Identity, Mall context, concise purpose
  Secondary: Export

FINANCIAL ATTENTION STRIP
  VND AR outstanding | VND overdue | Due for invoice | Drafts awaiting issue
  Separate non-VND disclosure by ISO currency

WORKLIST CONTROL BAR
  Search | Period | Status | Source | Attention filter | Clear | Export

INVOICE WORKLIST (primary viewport area)
  Exact amount columns + currency + status + due context

DOCUMENT DETAIL SHEET
  Identity/status/currency → facts → lines/totals → documents/payments
  Fixed contextual command footer
```

Reference capabilities remain as secondary tabs:

- Tuổi nợ.
- Lịch lập hóa đơn.
- Nhắc nợ.
- Hiệu quả thu hồi.

The Invoices tab remains the landing view. No new “dashboard” tab is added.

## 4. Command header

Use the existing `PageHeader` with:

- Eyebrow localized as a Finance/Billing domain label, not “Revenue
  operations” in Vietnamese UI.
- Title: existing localized “Hóa đơn và thu tiền”.
- Description reduced to one operational sentence.
- Mall context remains owned by the global selector.
- Export is a secondary outline action when the active view supports it.

There is no universal create button because the current workflow creates
invoices from authoritative pending receivables or schedules. A generic “Create
invoice” primary action would expose an API capability that the current page
does not use and would change the approved operational flow.

## 5. Financial attention strip

Replace the stacked header KPI row plus six equal bucket cards with one compact
strip. Use existing data only:

| Indicator | Authoritative source | Presentation |
|---|---|---|
| AR outstanding | `summary.totalOutstanding` | Exact VND or explicit scaled KPI with full exact tooltip; filter action |
| Overdue | `summary.overdue.amount/count` | Danger emphasis; filter action |
| Due for invoice | `pendingSummary.dueAmount/dueCount` | Attention emphasis; opens pending worklist |
| Draft awaiting issue | `summary.draft.amount/count` | Warning/neutral; filter action |

Collection rate and DSO belong in the Collection Efficiency reference tab or a
small secondary header context, not a second set of prime cards above the
daily worklist.

Non-VND values must remain separate by `summary.byCurrency`. Never combine
them into VND totals. Show concise ISO-labeled breakouts directly beneath or
inside the strip, not a large decorative alert.

## 6. Worklist control bar

Use one `ERPToolbar` with controls ordered by daily use:

1. Search invoice number, counterparty or contract.
2. Period filter using the existing exact `period` query capability.
3. Status filter including CANCELLED.
4. Source filter using existing `sourceType`.
5. Attention/bucket filter using existing `bucket` values.
6. Clear filters only when any filter is active.
7. Export as a secondary action.

Search should be debounced before implementation to avoid a request on every
keystroke. A debounce is frontend query behavior, not business logic.

Do not add sort controls until the backend accepts authoritative sort fields.
Client-side sorting a single server page would be misleading.

## 7. Invoice worklist

### 7.1 Recommended columns

Every column below is available from the existing invoice list response.

| Column | Existing field / derivation | Notes |
|---|---|---|
| Số hóa đơn | `invoiceNumber` | Monospace identity; opens detail |
| Đối tượng công nợ | `counterpartyName`, fallback Tenant/BillingParty | Use broader term because not every invoice belongs to a Tenant |
| Nguồn | `sourceType` / `type` | Localized presentation mapping only |
| Hợp đồng / Tham chiếu | Contract relation, source contract number or source reference | Existing response data; no invented identifier |
| Kỳ thu | `period` or service milestone | Existing data |
| Hạn thanh toán | `dueDate`, `daysOverdue` | Exact date; overdue days secondary |
| Trạng thái | `status` | `ERPStatusBadge` mapping only |
| Tổng hóa đơn | `totalAmount` | Original invoice total; exact numeric value |
| Đã thu ròng | `totalPaid` | Backend-computed effective payment total |
| Còn phải thu | `balance` | Backend-authoritative adjusted outstanding |
| Tiền tệ | `currencyCode` | Separate ISO column |
| Thao tác | Open detail affordance | No casual financial mutation inline |

The generic word “Amount” is not used because three different authoritative
financial meanings exist. `totalAmount`, `totalPaid` and `balance` must keep
their distinct labels.

### 7.2 Table behavior

- Invoice table receives the majority of the desktop height.
- Header may become sticky inside the contained table scroller when rendered
  testing proves the row area exceeds one screen.
- Table scrolls horizontally inside its own bordered surface.
- No page-level horizontal overflow.
- Overdue state uses a subtle row tint plus badge and overdue-day text; color
  is not the only signal.
- Selected row uses the existing enterprise selected-row treatment.
- Pagination footer remains attached to the table.
- True empty, filtered empty, loading and error/retry use `AsyncState`.

## 8. Pending receivables

Treat “Chờ xuất hóa đơn” as an operational worklist, not another KPI card.

- Open it from the “Due for invoice” indicator or an attention segment.
- Preserve all existing source rows and semantics.
- Keep exact Total / Recorded / Expected collectible values with a separate
  Currency column.
- Preserve selection only for rows the backend marks due.
- Bulk action appears only after selection and states the selected count.
- Bulk result must show created and failed rows from the existing response,
  not only a summary toast.
- Do not hide not-yet-due rows if the current filter is intended to show the
  full pending schedule.

Pagination/complete-result behavior is a prerequisite API decision. Do not
simulate global pagination or sorting on a capped client array.

## 9. Status presentation

Use the actual Invoice lifecycle only:

| Status | Vietnamese | English | Tone |
|---|---|---|---|
| `DRAFT` | Bản nháp | Draft | Neutral |
| `ISSUED` | Đã phát hành | Issued | Brand/info |
| `PARTIALLY_PAID` | Đã thu một phần | Partially paid | Warning |
| `PAID` | Đã thanh toán | Paid | Success |
| `OVERDUE` | Quá hạn | Overdue | Danger |
| `CANCELLED` | Đã hủy | Cancelled | Neutral |

The exact Vietnamese term for ISSUED should describe invoice state, while
notification delivery is separate. “Đã gửi khách” currently conflates the
legal/document state with a communication side effect; localization review is
required but no backend enum changes.

Related electronic-invoice, adjustment, schedule and payment-reversal states
remain secondary metadata in the detail view. They do not become new
InvoiceStatus values.

## 10. Financial action hierarchy

### Page level

- Primary: none by default; attention selection leads to contextual action.
- Secondary: Export current compliant result set.
- Navigation: reference tabs.

### Pending receivables

- Primary after valid selection: Create selected draft invoices.
- Secondary row action: Create one draft invoice.
- Confirmation must state that drafts are created and still require review and
  issue.

### Invoice detail

- Primary for DRAFT: Issue invoice.
- Primary for ISSUED/PARTIALLY_PAID/OVERDUE: Record payment.
- Paid: no primary mutation; show completed state.
- Secondary: create adjustment, request e-invoice, synchronize SAP, upload
  document.
- Overflow/destructive: void invoice, reverse payment, cancel adjustment.
- Line add/edit/remove remains inside DRAFT line sections, not in the global
  footer.

### Batch operations

- Existing supported bulk action: create drafts from selected due receivables.
- Manual dunning and penalty calculation are batch jobs and require explicit
  warning/confirmation plus result summary.
- No bulk issue, bulk payment, bulk void or bulk approval is designed because
  no such API contract exists.

### Approval

Golden Billing does not add an approval action. Invoice adjustments currently
become APPROVED on creation; changing that behavior would require a separate
business/state-machine CR.

## 11. Detail architecture

Retain a right-side detail sheet on desktop. It best supports repeated
list-to-document review while preserving worklist context.

### Header, always visible

- Invoice number.
- Localized Invoice status.
- Currency code.
- Counterparty.
- Contract/source reference.
- Period and due date.
- Exact outstanding amount as the dominant financial value.

Replace the current four-step decorative workflow with a compact status/action
context:

- Current status.
- Due/overdue context.
- Allowed next action.
- Blocking prerequisite when an action is unavailable.

### Scrollable body

1. Document facts.
2. Line items.
3. Financial reconciliation: subtotal, VAT, adjustments, adjusted total,
   collected and outstanding.
4. Adjustment history.
5. Documents/e-invoice.
6. Payment history.

Single-document detail may show the currency once in the header and render
inline formatted money thereafter, because every invoice line and payment is
authoritatively tied to the invoice currency. Payment records may retain their
own code as audit metadata.

### Fixed footer

- One primary action based on authoritative status.
- One or two secondary actions.
- Remaining actions in an overflow menu.
- Destructive actions separated and confirmed.
- Pending state disables repeat submission.

At 1024px, the sheet should use a responsive width such as
`min(100vw, 600px)` and keep internal table scrolling contained. Exact width
must be verified from rendered screenshots.

## 12. Money presentation convention

### Cross-record tables

```text
TOTAL INVOICE      COLLECTED          OUTSTANDING        CURRENCY
3.165.855.000      1.000.000.000      2.165.855.000      VND
1.250.000,25       250.000,00         1.000.000,25       USD
```

- Use `ERPAmount` / `formatMoneyAmount`.
- Amount columns are right-aligned and use `tabular-nums`.
- Currency is an adjacent left-aligned ISO column.
- No symbols are repeated inside Amount cells.
- No abbreviation in transaction, aging, schedule or export rows.

### Single-document detail

- Display ISO currency prominently once in the detail header.
- `formatMoney` may show amount plus currency within the document.
- Never round USD/MMK through `Math.round`.
- Zero is `0` at the currency's configured precision, not an em dash.

### KPI/chart exception

- Use an explicit unit, preferably `Đơn vị: Tỷ VND` for a VND-only chart.
- Axis may scale for readability.
- Tooltip must show exact amount and ISO currency.
- Compact KPI values must expose exact value on hover/focus.
- Never show ambiguous `3,2 T VND`-style mixed unit strings.

### Export

- Separate numeric Amount columns and a Currency column.
- Preserve numeric cell types.
- Apply decimal precision from the authoritative Currency configuration.
- Export scope must match disclosed filters or explicitly state differences.

## 13. Reference tabs

### Tuổi nợ

- Use one currency-grouped financial table.
- Add a dedicated Currency column.
- Render every bucket with `ERPAmount`, not `formatMoney` with repeated symbols.
- VND summary may remain separate, but non-VND totals must be visible per
  currency without blending.
- Contained horizontal scrolling is mandatory.

### Lịch lập hóa đơn

- Contract selector and schedule actions remain.
- Table adds authoritative `BillingScheduleEntry.currencyCode` presentation.
- Rent and CAM show exact numeric amounts.
- `PENDING`, `INVOICED`, `SKIPPED` receive localized status badges.
- Rebuild and generate-due remain staff actions; generated results are shown.

### Nhắc nợ

- Policies are reference rows, not equal decorative cards.
- Manual run is secondary and confirmed.
- Penalty creation is visually separated as higher risk.
- Do not increase prominence until known currency defects are resolved or
  explicitly accepted.

### Hiệu quả thu hồi

- DSO and collection rate are primary analytical values.
- VND-only monetary values state `Đơn vị: VND` or chart scale explicitly.
- Chart tooltip uses exact VND amounts.
- This remains a reference/analytical tab, not the daily landing screen.

## 14. Responsive specification

### 1920×1080

- Compact attention strip remains one row.
- Toolbar remains one row where possible.
- Invoice table fills the primary viewport area.
- Detail sheet leaves enough list context to identify the selected row.

### 1440×900

- Attention strip remains compact.
- Low-priority filters may wrap once without increasing header height
  materially.
- Table owns horizontal scrolling.

### 1366×768

- Remove the existing workflow strip and redundant source-card layer so table
  headers and several rows remain visible without excessive page scrolling.
- Detail footer keeps one dominant action and overflow for the rest.

### 1024×768

- Attention indicators may form two rows but remain a strip, not large cards.
- Tabs remain horizontally scrollable.
- Toolbar controls wrap predictably; segmented status control may become a
  Select if rendered testing demonstrates clipping.
- Invoice, pending, AR-aging and schedule tables scroll inside their own
  containers.
- Detail sheet becomes viewport-bounded; no page-level horizontal scroll.

All four viewports require rendered verification in implementation. Do not
claim responsive PASS from source review.

## 15. Reusable patterns

### Reuse directly

- `PageHeader` for command headers.
- `ERPToolbar` for filter/action controls.
- `ERPAmount` for financial table amounts.
- `ERPStatusBadge` with Billing-owned status mapping.
- `ERPStatCard` only where an actual KPI/attention tile remains justified.
- `AsyncState` for loading, error, retry and empty states.
- Existing `ConfirmDialog` and `ReasonActionDialog` for consequential actions.

### Safe extensions to consider

- A financial worklist column recipe, not a new table framework.
- A compact amount/currency header for single-document detail.
- A contextual detail command footer pattern.
- A batch-result panel for partial success/failure.
- A currency-grouped summary pattern using existing summary buckets.

Do not create a parallel component system or generic data grid as part of this
Golden implementation. Existing tables can be composed with the current UI
primitives while preserving behavior.

These patterns are later reusable by Contracts, Proposals, Approvals, Service
Contracts, Sales and Tenant financial views only after Golden Billing receives
human approval. No rollout is part of this phase.

## 16. Proposed implementation scope after unblock

### Frontend visual/information architecture

- Recompose Billing header, attention strip, toolbar and invoice worklist.
- Preserve existing queries/mutations and route contracts unless separately
  authorized prerequisites add pagination/export capability.
- Rework detail hierarchy and contextual action footer.
- Apply localized status/source/schedule/e-invoice presentation mappings.
- Apply CR-109 money presentation to invoice detail, AR aging, schedule and
  collection KPI/chart.
- Add complete async states for pending, detail, schedule and dunning views.
- Add focused frontend tests for action visibility, status mapping, exact money
  display, filtered empty state and partial bulk results.
- Render and inspect all four required desktop viewports.

### Separately reviewed prerequisite work

- Consume authoritative `balance` in the payment dialog.
- Paginate pending receivables or document an accepted bounded-result contract.
- Make export currency-aware and filter-consistent if BC-GBILL-002 requires it.
- Resolve or quarantine penalty/dunning currency defects per BC-GBILL-001.

## 17. Out of scope

- New invoice lifecycle states or transitions.
- Payment allocation across invoices.
- FX conversion or mixed-currency consolidation.
- Changes to outstanding, VAT, collection-rate, DSO, aging or penalty formulas.
- New approval workflow.
- New Billing source types.
- Mall/Tenant/RBAC policy changes.
- Schema/database migrations unless separately approved.
- New API contracts beyond reviewed prerequisite gaps.
- Dashboard, Golden Booking or rollout to other modules.
- SAP or electronic-invoice integration redesign.

## 18. Verification gates for implementation

- Billing focused frontend tests.
- Billing backend unit/integration tests for any separately authorized API or
  export prerequisite.
- Currency formatter tests for VND, USD and MMK including zero and decimals.
- GS-04 Contract → Billing.
- GS-06 Invoice → Payment.
- GS-09 cross-Mall denial.
- GS-10 Tenant isolation.
- GS-11/12/13/14 currency lifecycle and mixed-currency reporting.
- GS-15 retry after commit/network loss.
- TypeScript and production builds.
- `git diff --check`.
- Rendered verification at 1920×1080, 1440×900, 1366×768 and 1024×768.
- Reconciliation among invoice list, detail, AR aging, export and Tenant view.

## 19. Design decision

The recommended Golden Billing architecture is:

**compact command header → financial attention strip → one filter bar →
dominant invoice worklist → contextual right-side document detail**.

This design was accepted on 2026-08-24. Implementation was separately
authorized and is governed by
`docs/changes/CR-GOLDEN-BILLING-IMPLEMENTATION.md`.

Final rendered human review passed on 2026-08-24. Money presentation,
financial-table hierarchy, Amount + Currency separation, action hierarchy,
density, and color discipline are approved. Remaining non-blocking copy and
localization cleanup is tracked in
`docs/changes/CR-GOLDEN-BILLING-P3-BACKLOG.md`.
