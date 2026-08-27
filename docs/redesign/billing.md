# Redesign Spec — Billing

**Purpose:** Separate "needs action today" from "reference data" across Billing's
5+ tabs (Invoices, AR Aging, Schedule, Dunning, Collection KPI).
**Persona:** Finance.
**User goal:** Get overdue accounts handled first; use Schedule/KPI tabs as
reference, not as competing top-level destinations.

## Current problems

FR-09 (Invoices tab bare empty state, no CTA — while AR Aging tab in the same file
already demonstrates a better pattern), V2 (11-tab-scale complexity across the
full Billing surface, English/Vietnamese term mixing).

## Information hierarchy

1. **Cần xử lý** (new landing view): overdue invoices, active dunning escalations,
   invoices awaiting a decision — merges the "action" slice of Invoices + Dunning
2. **Hóa đơn** (Invoices) — full list, existing functionality unchanged
3. **Tuổi nợ** (AR Aging, renamed per V2's glossary) — reference
4. **Lịch thu phí** (Schedule, renamed) — reference/config
5. **Hiệu quả thu hồi** (Collection KPI, renamed) — reference, Director/Finance view

## Components

- Reuse all existing tab content (`BillingExtraTabs.tsx` components) — this is a
  regrouping + terminology fix + one new landing aggregation, not new billing
  logic.
- Bring Invoices tab's empty state up to the AR Aging tab's already-better pattern
  (both live in `BillingPage.tsx` today, so this is copying an existing pattern
  within the same file).

## States

- "Cần xử lý" empty (nothing overdue): positive confirmation state.
- Invoices empty state: distinguish "no invoices yet" vs. "no results for filter,"
  per Epic 5.

## Permissions

Unchanged — `FINANCE`/`MALL_DIRECTOR` get full tab access per existing
`MODULE_ROLES.billing`; Collection KPI already gated staff-only per current code.

## Acceptance criteria

- A Finance user's first click of the day answers "who's overdue and at what
  dunning stage" without tab-hunting.
- All Billing tab labels are Vietnamese-first per the terminology glossary V2 and
  `ERP_UX_STANDARD.md` both already specify.
