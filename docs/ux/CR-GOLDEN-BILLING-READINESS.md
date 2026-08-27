# CR — Golden Billing Phase A UX Readiness

**Owner:** Codex

**Phase:** A — readiness and design only

**Audit date:** 2026-08-24

**Source baseline:** `2e903fa911367bc407c7949aa6fd45064a01048f`

**Implementation status:** ACCEPTED / SUPERSEDED BY AUTHORIZED IMPLEMENTATION

**Code changes in this phase:** None. Subsequent implementation is governed by `docs/changes/CR-GOLDEN-BILLING-IMPLEMENTATION.md`.

## 1. Executive conclusion

The current Billing module already has a strong backend foundation for an ERP
financial workspace: authoritative per-invoice currency, currency-bucketed
invoice summaries, a server-derived outstanding balance, a controlled invoice
lifecycle, idempotent payment recording, Mall-scoped staff access, Tenant
isolation, invoice documents, adjustments, electronic invoicing, SAP handoff,
AR aging, dunning, and collection KPIs.

The screen is not ready to become the Golden Financial / Document Workspace
without a small set of explicitly authorized correctness and API prerequisites.
The blockers are not reasons to redesign the Billing business process. They are
places where a visual-only implementation would otherwise make a misleading or
incomplete financial workflow more prominent:

1. The payment dialog recomputes remaining amount as `totalAmount - totalPaid`
   instead of using the backend-authoritative `balance`, so adjustments and
   refunds can make the displayed/fill amount disagree with the server.
2. The invoice-detail formatter rounds all currencies with `Math.round`, and
   some variable-cost input copy/preview still assumes VND.
3. Invoice Excel export has no Currency column and applies an integer number
   format to all amounts, contrary to CR-109.
4. Pending receivables are capped at 200 records per source with no pagination;
   a Golden worklist cannot claim complete operational coverage at scale.
5. Penalty-invoice creation still omits the source invoice currency, and
   dunning notification text still hardcodes VND. These existing write/message
   defects must not be visually promoted as casual primary actions.

The target architecture is fully specified in
`docs/ux/CR-GOLDEN-BILLING-DESIGN.md`. Implementation may start only after the
blocker scope is approved through the required Tier 0/Tier 1 review path, or
after the business explicitly narrows Golden Billing to exclude the affected
surfaces without implying they are compliant.

## 2. Evidence and audit boundary

Read and reconciled:

- `AGENTS.md` and the required governance sequence.
- Current Billing frontend, API client, locale, shared ERP components and route
  permissions.
- Current Billing controller, DTOs, services, scheduler, dunning, penalty,
  collection KPI and Prisma models.
- System Truth for data ownership, invoice lifecycle, permissions, financial
  semantics, money lineage and multi-currency.
- CR-109 audit and completion records.
- Existing ERP UX, table, object-page and component standards.
- Existing Billing domain, failure, concurrency and redesign documents.

The in-app browser runtime returned no available browser sessions. Therefore
1920×1080, 1440×900, 1366×768 and 1024×768 were not rendered in this phase.
Responsive findings below are source-evidenced risks, not claimed visual PASS.

No application code, Golden Dashboard file or Golden Booking file was modified.
The unrelated unstaged Dashboard change remained outside this work.

## 3. Current information architecture

Current page composition in `BillingPage.tsx`:

1. Page header with an English eyebrow and Vietnamese localized title.
2. Three collection KPI cards for staff.
3. A Billing operations heading and five top-level tabs.
4. Invoices tab:
   - four-step visual workflow bar;
   - six receivable bucket cards;
   - non-VND outstanding disclosure;
   - conditional pending-receivables worklist;
   - four source-type cards;
   - search/status/export toolbar;
   - paginated invoice table;
   - invoice detail side sheet.
5. AR aging tab with five cards and an aging table.
6. Billing schedule tab.
7. Dunning / penalty tab.
8. Collection KPI tab with cards and a trend chart.

The architecture exposes most capabilities, but attention, reference,
configuration and dangerous actions compete at the same navigation level. The
primary invoice worklist is pushed down by two KPI layers, a workflow strip and
source cards. This is closer to a dashboard-card collection than a dense daily
Finance cockpit.

## 4. Current UX inventory

### 4.1 Summary and KPI areas

- Header KPIs: collection rate, DSO and VND AR outstanding.
- Six invoice bucket tiles: expected receivables, unbilled, draft, current,
  partially paid and overdue.
- Four source cards: lease, service contract, short-term and parking where data
  exists.
- AR aging repeats five monetary summary cards.
- Collection KPI repeats DSO, collection rate, collected and outstanding.

The same concepts appear in multiple layers. Compact values lack a full-value
tooltip in several places, and some VND-only aggregates use `₫` rather than an
explicit ISO unit.

### 4.2 Search and filters

- Invoice search is server-backed and matches invoice number, counterparty,
  notes, source ID, tenant brand, billing party name and contract number.
- Status filter supports DRAFT, ISSUED, OVERDUE, PARTIALLY_PAID and PAID.
- CANCELLED exists in the lifecycle but has no direct status-chip filter.
- Bucket and source filters are supported by the invoice endpoint.
- Exact `period` is accepted by the backend but is not exposed by the current
  invoice toolbar.
- Search updates the query key on every keystroke; no debounce is present.
- Export forwards search, status and Mall, but not bucket or source filters.

### 4.3 Invoice worklist

Current columns are:

- Invoice number.
- Counterparty.
- Source / contract.
- Period.
- Total amount.
- Collected.
- Outstanding.
- Currency.
- Due date.
- Status.
- Detail chevron.

This list already contains the authoritative data needed by the proposed
Golden worklist. Rows open the detail side sheet. It is server-paginated at 25
rows, capped at 100 per request and ordered by `createdAt desc`; there is no
server sort contract exposed to the UI.

### 4.4 Pending receivables worklist

The worklist combines four authoritative sources:

- `BillingScheduleEntry` for lease contracts.
- `ServiceContractPayment` for service contracts.
- `SlotBooking` for short-term bookings.
- `ParkingMonthlyStatement` for parking.

It exposes counterparty, contract/source, milestone/period, expected total,
source-paid amount, expected collectible amount, currency, planned invoice
date, due date and readiness. It supports selecting due rows and creating
draft invoices in bulk.

The service fetches up to 200 rows independently from each source and returns
one combined, sorted array with no page metadata. This is not a scalable or
complete Golden worklist contract.

### 4.5 Detail view

The current 520px right-side sheet contains:

- Invoice identity, counterparty, period, due date and contract link.
- A four-step visual strip.
- Fixed and variable invoice lines.
- Draft-only line add/edit/remove.
- Subtotal, VAT, adjustments, refunds, total, paid and outstanding.
- Adjustment history.
- Documents and upload.
- Payment history and reversal.
- Contextual footer actions for issue, collect, adjust, electronic invoice,
  SAP and void.

The list-plus-side-sheet pattern is appropriate. The detail is operationally
dense enough that a small modal would be inadequate, but it does not yet
justify a dedicated route because the user repeatedly returns to the worklist
and most actions are single-document operations.

### 4.6 Async states

- Invoice list has skeleton, error with retry, true-empty and filtered-empty
  states.
- AR aging has loading, error/retry and empty states.
- Pending receivables has loading and empty presentation but no dedicated API
  error/retry state.
- Schedule and dunning show loading but do not provide complete error/empty
  recovery states.
- Detail has loading skeletons but no explicit detail-query error state.

## 5. End-to-end action trace

The classifications below describe actual behavior, not button wording.

| Class | UI action | API / permission | Service and database effect |
|---|---|---|---|
| READ | List invoices | `GET /billing/invoices`; Billing roles; Mall-scoped; Tenant forced to own `tenantId` | Reads `Invoice` with counterparty, contract, payments; computes `adjustedTotal`, `totalPaid`, `balance`, `daysOverdue`; summary bucketed by currency |
| READ | Open invoice | `GET /billing/invoices/:id/summary`; invoice Mall check; Tenant ownership check | Reads Invoice, lines, payments, adjustments and relations; returns server financials |
| READ | Pending receivables | `GET /billing/receivables/pending`; staff only; Mall-scoped | Reads four source models; no writes |
| READ | AR aging | `GET /billing/ar-aging`; staff only; Mall-scoped | Reads open invoices and active/reversed payment data; buckets by counterparty plus currency |
| READ | Schedule | `GET /billing/schedule/:contractId`; staff only; Contract Mall check | Reads `BillingScheduleEntry` and linked invoice/payment collection |
| READ | Dunning/KPI/config | Billing staff routes | Reads policies, logs, VND-scoped KPIs or global BillingConfig |
| CREATE | Create one draft from pending | `POST /billing/receivables/pending/:sourceType/:id/create-invoice`; staff only | Creates Invoice and lines; updates source relation/status in source-specific transaction path |
| CREATE | Create due drafts in bulk | `POST /billing/receivables/pending/create-due-invoices`; staff only | Processes at most 100 selected/due rows sequentially; returns per-row success/error; partial completion is possible |
| CREATE | Manual create invoice | `POST /billing/invoices`; staff only; not exposed by current Billing page | `CreateInvoiceDto` → `BillingService.createInvoice` → Invoice/InvoiceLine; contract currency overrides caller |
| CREATE | Generate due invoices | `POST /billing/schedule/generate-due`; staff only | Builds schedules and creates draft/auto-issued invoices in source transactions |
| UPDATE | Add/edit/remove line | POST/PATCH/DELETE invoice line routes; staff only | Allowed only while Invoice is DRAFT; recalculates subtotal, VAT and total |
| UPDATE | Upload document | `POST /billing/invoices/:id/documents`; staff only | Stores file and creates versioned `UnifiedDocument` |
| UPDATE | Create adjustment | `POST /billing/invoices/:id/adjustments`; staff only | Creates an immediately APPROVED adjustment and recomputes invoice/source status in a serializable transaction |
| UPDATE | Cancel adjustment | `POST /billing/adjustments/:id/cancel`; staff only; API client exists but no current UI control | Cancels adjustment and reverses its totals in a serializable transaction |
| ISSUE | Issue invoice | `POST /billing/invoices/:id/issue`; staff only | DRAFT → ISSUED in a serializable transaction, recalculates totals and queues notification; same ISSUED retry is idempotent |
| ISSUE | Request legal e-invoice | `POST /billing/invoices/:id/e-invoice/request`; staff only | Writes/upserts integration log and marks electronic status PENDING; does not change InvoiceStatus |
| PAY/COLLECT | Record payment | `POST /billing/invoices/:id/payment`; staff only; idempotency key | Creates Payment with Invoice currency, recomputes Invoice status and synchronizes supported source receivable |
| PAY/COLLECT | Reverse payment | `POST /billing/payments/:id/reverse`; staff only; reason required | Soft-reverses Payment and recomputes Invoice/source status in a serializable transaction |
| VOID/CANCEL | Void invoice | `POST /billing/invoices/:id/void`; staff only; reason required | Sets CANCELLED with audit fields; blocked while active payments or approved adjustments exist |
| VOID/CANCEL | Remove draft line | DELETE invoice line; staff only | Deletes only non-fixed DRAFT line and recalculates totals |
| EXPORT | Export invoice workbook | `GET /billing/invoices/export`; staff only; Mall-scoped | Reads up to 5,000 invoices and writes XLSX; currently lacks Currency column |
| APPROVE | None | No invoice-approval endpoint or UI action exists | Invoice adjustments default to APPROVED at creation; this is not a separate approval workflow |

Manual dunning and penalty execution are batch financial operations, not
ordinary row actions. Dunning sends notifications and can mark invoices
OVERDUE. Penalty execution creates new DRAFT penalty invoices.

## 6. Authoritative status inventory

### 6.1 Invoice lifecycle

Prisma `InvoiceStatus` is authoritative:

| Backend value | Current presentation | Recommended presentation tone |
|---|---|---|
| `DRAFT` | Bản nháp | Neutral |
| `ISSUED` | Đã gửi khách | Brand/info |
| `PARTIALLY_PAID` | Thanh toán 1 phần | Warning |
| `PAID` | Đã thanh toán | Success |
| `OVERDUE` | Quá hạn | Danger |
| `CANCELLED` | Hủy | Neutral, with cancellation reason in detail |

No new status is required. `OVERDUE` may be derived/recomputed from due date
and payment state; `PARTIALLY_PAID` and `PAID` are recomputed from effective
payments and adjustments. The UI must not offer arbitrary status selection.

### 6.2 Related statuses

- Billing schedule: `PENDING`, `INVOICED`, `SKIPPED`.
- Adjustment: `APPROVED`, `CANCELLED`.
- Electronic invoice: free-text values currently used as `NOT_SENT`,
  `PENDING`, `ISSUED`, `FAILED`.
- Payment reversal: represented by `reversedAt`, not a Payment status enum.
- Dunning progression: policy `level`, not an InvoiceStatus.

The current visual workflow strips imply a linear four-step state machine that
does not exactly match these authoritative models. In particular, variable
cost lines are optional content, not a lifecycle state, and payment/adjustment
recomputation can move status non-linearly. Golden Billing should replace the
strip with current status plus allowed next action, without changing backend
states.

## 7. CR-109 money compliance

### Compliant today

- Invoice and pending-receivable cross-record tables use full numeric amounts
  and a separate Currency column.
- Invoice list amounts are right-aligned and use `ERPAmount`.
- Backend invoice summaries are bucketed by `currencyCode`; the top-level
  compatibility summary is explicitly VND-only.
- AR aging backend groups a counterparty separately per currency.
- Payment currency is server-enforced equal to Invoice currency.

### Violations and risks remaining

1. `fmtMoney()` in `BillingPage.tsx` calls `Math.round(n)` before the canonical
   formatter. USD/MMK cents can be lost in single-document detail.
2. `fmtMoney()` renders numeric zero as an em dash because it tests `!n`.
3. AR aging puts formatted currency into every amount cell and only adds a
   parenthetical code beside non-VND counterparties. It does not use separate
   Amount/Currency columns as required for a cross-record financial table.
4. AR aging grand total and all aging cells should use numeric-only amount
   presentation with a Currency column or explicit currency-group sections.
5. Header, bucket, source and collection KPI values use compact notation with
   `₫` or no unit and often no exact-value tooltip.
6. Collection trend tooltip remains compact instead of exact.
7. Schedule rent/CAM values use a local compact formatter and show no currency.
   `BillingScheduleEntry.currencyCode` exists and is authoritative.
8. Variable-cost subtotal preview omits the invoice currency argument and
   therefore defaults to VND. The localized unit-price label hardcodes `₫`.
9. Payment amount labels do not consistently show the document currency.
10. Invoice export omits Currency and uses `#,##0` for VND, USD and MMK alike.
11. Penalty invoice creation omits `currencyCode`, defaulting to VND even when
    the source invoice is non-VND.
12. Dunning notification and email paths hardcode VND semantics for
    outstanding amounts.

Items 1–10 affect presentation/export. Items 11–12 are existing backend
financial correctness defects and cannot be fixed as incidental UX work.

## 8. Action hierarchy assessment

### Current strengths

- Issue uses confirmation.
- Void and payment reversal require a reason.
- Mutations show pending/disabled states.
- Payment recording uses an idempotency key.
- Tenant users do not see staff mutations.

### Current problems

- The detail footer can show issue/collect, adjustment, e-invoice, SAP and void
  as a tall stack of full-width buttons. Secondary and overflow actions are not
  clearly separated.
- Green and blue local button classes compete with the existing enterprise
  primary action hierarchy.
- Manual dunning and penalty actions appear side-by-side near the top of their
  tab even though they can send messages or create financial documents.
- Bulk draft creation reports only aggregate counts in a toast even though the
  API returns per-item failures.
- The invoice table has no explicit row action menu; the entire row opens the
  detail and a chevron is the only affordance.
- There is no independent approval action. The UI must not invent one.

## 9. Authorization assessment

Authoritative backend roles:

- Billing read: `ADMIN`, `FINANCE`, `MALL_DIRECTOR`, `TENANT`.
- Billing staff writes: `ADMIN`, `FINANCE`, `MALL_DIRECTOR`.
- Billing config write: `ADMIN` only.
- Electronic invoice provider completion: `ADMIN`, `FINANCE`.
- SAP invoice synchronization: current UI limits to `ADMIN` and `FINANCE`;
  backend SAP authorization must remain authoritative.

Mall access is explicitly enforced for invoice, payment, adjustment, contract
schedule and filtered list routes. Tenant invoice list and detail force/check
the authenticated tenant identity; the client-supplied tenant is not trusted.

Concerns for implementation:

- Frontend `isStaff = role !== TENANT` is acceptable only because the route
  allow-list currently limits the page to the four Billing roles. It must not
  be treated as an authorization control.
- Any new combined worklist endpoint, sort contract or export filter must
  repeat Mall scoping and Tenant isolation at the query boundary.
- A visual redesign must preserve the narrower `ADMIN`-only config and
  `ADMIN`/`FINANCE` SAP/e-invoice capabilities.

## 10. Responsive risks

### Shared risks

- The four-step workflow is one non-scrolling flex row and can compress text.
- The six bucket cards become three vertical rows below `xl`, pushing the
  actual worklist far below the fold at 1024×768.
- The status segmented control is a single non-scrolling child inside a
  wrapping toolbar; it can dominate the available width after the sidebar.
- The 520px fixed detail sheet does not adapt to the viewport width.
- Several detail tables have no contained horizontal scrolling.

### Worklist-specific behavior

- Main invoice and pending tables correctly contain their own horizontal
  scrolling with 1280px/1220px minimum widths.
- AR aging uses a seven-column table without `overflow-x-auto`; 1024px is a
  clipping/compression risk.
- Schedule uses a five-column table without contained horizontal scrolling.
- Tabs correctly use horizontal scrolling.
- Global `overflow:hidden` is not used as the Billing workaround; it must not
  be introduced.

Viewport acceptance remains unverified until rendered testing is available.

## 11. API and schema gaps

### API gaps affecting Golden Billing

1. Pending receivables has no pagination and hard-caps each source at 200.
2. Invoice list has no explicit server sort parameters; default is newest
   created first, not operational priority.
3. Export cannot mirror the active bucket/source filters and omits Currency.
4. Export caps output at 5,000 without returning truncation metadata.
5. Several controller queries/bodies use `any` rather than validated DTOs.
6. Bulk draft creation permits partial success, but current UI does not expose
   the returned row-level results.
7. Detail-query, pending-list, schedule and dunning error contracts are not
   represented consistently in the UI.

### Schema gaps or constraints

- Invoice, Payment and BillingScheduleEntry have authoritative
  `CurrencyCode`; no schema change is needed for the core invoice worklist.
- There is no Payment Allocation entity. One Payment belongs to one Invoice.
  Golden Billing must not design cross-invoice allocation UI.
- Invoice amount fields are `Float`, not `Decimal`; Phase A does not propose a
  migration.
- Electronic invoice status is a free-text String rather than an enum.
- Pending Parking and Slot sources lack their own currency fields and are
  explicitly bridged as VND today.
- Sales turnover lacks currency, which keeps revenue-share correctness under
  an existing business-confirmation concern.

No schema change is required for the proposed core visual architecture. The
source-domain currency gaps remain out of scope and must not be hidden by UI.

## 12. Business logic concerns

- Payment dialog remaining amount diverges from the backend formula when
  adjustments/refunds exist.
- Outstanding/balance formula remains duplicated across Billing services,
  although current implementations are documented as mathematically aligned.
- Penalty invoices can inherit the wrong currency.
- Dunning user-facing money text can claim VND for non-VND invoices.
- Revenue-share calculation may mix currency-less Sales turnover with Contract
  currency; existing business confirmation remains open.
- Bulk draft creation is per-row and non-atomic by design; the UI must present
  partial results honestly.
- Current visual workflow bars imply semantics not owned by the backend state
  machine.

## 13. Business confirmations required

### BC-GBILL-001 — Golden scope for known currency defects

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Should Golden Billing implementation include separately authorized fixes for
penalty invoice currency and dunning notification currency, or must those
actions remain explicitly de-emphasized/excluded until their existing
financial-correctness CR is completed?

### BC-GBILL-002 — Export compliance gate

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Is CR-109-compliant Excel export part of Golden Billing approval, requiring a
backend export change, or may Golden Billing be approved with export recorded
as a separate noncompliant backlog item?

No confirmation is required for the primary table columns if the design uses
the precise existing meanings `totalAmount` (invoice face total), `totalPaid`
(effective net collected) and `balance` (adjusted outstanding) with explicit
labels. The design deliberately avoids an ambiguous generic “Amount” field.

## 14. Change impact for a future implementation

Any implementation CR must explicitly cover:

- Primary domain: Billing / Finance (Tier 1).
- Tier 0 overlays: money, currency, Mall/Tenant authorization and export.
- Upstream sources: Contracts, Service Contracts, Parking and Slots.
- Downstream consumers: Tenant Billing, Dashboard, Reports, SAP, electronic
  invoice provider, notifications and exported workbooks.
- State impact: presentation mapping only unless separately authorized.
- Financial impact: no formula change in the visual wave; authoritative
  `balance` must be consumed, not re-derived.
- Currency impact: GS-11, GS-12, GS-13 and GS-14.
- Billing journeys: GS-04 Contract → Billing and GS-06 Invoice → Payment.
- Authorization: GS-09 cross-Mall denial and GS-10 Tenant isolation.
- Retry/concurrency: GS-15 plus duplicate payment and duplicate issue paths.
- Reconciliation: list, detail, AR aging, export and Tenant view must agree by
  amount and currency.

## 15. Readiness decision

**IMPLEMENTATION READINESS: ACCEPTED — 2026-08-24**

The business owner resolved the readiness conditions as follows: penalty and
dunning currency correctness are out of Golden Billing scope and tracked in a
separate correctness CR; compliant XLSX export is required; backend `balance`
remains authoritative without a formula change; non-authoritative workflow
presentation must be removed; and bounded pending-source results must disclose
their limit. Implementation proceeded under
`docs/changes/CR-GOLDEN-BILLING-IMPLEMENTATION.md`.

The original unblock conditions were:

1. BC-GBILL-001 and BC-GBILL-002 are answered.
2. A reviewed implementation CR separates visual work from any required
   backend/export/currency correctness changes.
3. The payment-dialog authoritative-balance issue is included in authorized
   scope or resolved before the new action hierarchy ships.
4. Pending-receivable pagination is implemented, or the business explicitly
   accepts the bounded list and the UI discloses its limit.
5. Rendered verification is scheduled for all four required desktop viewports.
