# 10 — Design System Audit

> Phase 16. Base component library: TailwindCSS + shadcn/ui. This audit focuses on
> *consistency of use* and duplication, not a from-scratch component inventory —
> `ERP_UX_STANDARD.md` already defines the intended interaction rules (action
> hierarchy, naming, forms, mobile/accessibility). This document checks how
> consistently the codebase follows its own standard, and folds in V2's
> component-level findings rather than re-deriving them.

## Already defined and should not be re-litigated (`ERP_UX_STANDARD.md`)

One primary action per screen, business-outcome button labels ("Lưu thay đổi" not
"Save"), Vietnamese-first with technical codes as secondary metadata, workflow
screens must show current status + owner + prerequisites, filters need an
active-filter count + "Xóa bộ lọc", 36–44px touch targets, keyboard focus
visibility, tables need a card fallback on mobile. Any redesign spec in
`docs/redesign/` should cite this standard rather than invent new rules.

## Confirmed duplication / inconsistency (per V2 + this audit's research)

| Issue | Evidence | Fix |
|---|---|---|
| Two confirm-dialog components | `ConfirmDialog` and `ConfirmActionDialog` both exist (V2) | Consolidate to one, per V2 Sprint C |
| `AsyncState`/`EmptyState` underused | Imported in 19 files but the `emptyAction` CTA slot is frequently left empty even where imported (Contracts, Proposals, Billing Invoices — FR-09); Tickets hand-rolls its own better version instead of using the shared component | Bring the 3 flagged screens up to Tickets' pattern using the *existing* shared component with its CTA slot filled in — do not build a second new component |
| No responsive tab primitive | Fitout (~15 tabs), Billing (11), Contracts (7) all use flat tab bars that don't scroll gracefully (V2) | Build one scrolling tab primitive, apply to all three per V2 Sprint C |
| PageHeader component underused | Flagged in V2 as "adopt or remove" | Adopt platform-wide: title + one-sentence purpose + primary action, per ERP_UX_STANDARD's page header rule |
| Native browser `confirm()` still used in some map editors | V2 | Replace with the shared confirm dialog once consolidated |
| Status/label terminology mixes English and Vietnamese across Billing's tabs | V2 ("AR Aging", "Dunning", "Collection KPI" left untranslated) | Apply V2's own proposed glossary (AR Aging→Tuổi nợ, Dunning→Nhắc nợ, Collection KPI→Hiệu quả thu hồi) |

## What's already consistent and should be preserved

- **i18n discipline**: virtually every status/priority/type value across Tickets,
  Contracts, Fitout, Billing, Proposals is routed through `locales/{vi,en}/*.json`
  before reaching the user — confirmed by direct code reading, not assumed. This is
  a real strength; new screens should keep using this pattern, not introduce raw
  enum text.
- **Status badge/color pattern**: color-coded status badges with i18n labels are
  used consistently across Tickets, Contracts, Fitout, Approvals.
- **Loading states**: skeleton components are consistently present across list
  views (confirmed in the Tickets/Contracts/Proposals/Billing spot-check) — this is
  *not* a gap, only the empty-state half of that spot-check found problems (FR-09).

## Accessibility spot-findings (Phase 17, scoped to what's verifiable without a
runtime audit)

- Icon-only buttons: `ERP_UX_STANDARD.md` already mandates Vietnamese
  `aria-label`/tooltip — compliance was not exhaustively re-verified per-component
  in this pass; recommend the axe + keyboard smoke tests V2 already proposes
  (Sprint C) as the mechanism to verify this at scale rather than manual spot
  review.
- Color-only status: the badge pattern above uses color **plus** text label
  consistently (not color alone) in every module checked — meets the "color is
  never the only status indicator" rule already.
- Mobile: Tenant Portal has a dedicated `TenantBottomNav` — mobile-first was
  clearly considered for the tenant-facing surface. Staff-facing screens with wide
  tables (Billing, Fitout Gantt) have not been verified against the "card fallback"
  standard — flag as an open item for Sprint C's responsive-tab/table work, not
  claimed as broken or fixed here without a runtime check.

## Priority

P2 — this is consolidation/consistency work, correctly sequenced in V2's Sprint C
alongside the notification/dashboard fixes from this audit. Not a Go-Live blocker
on its own, but the empty-state gap (FR-09, part of this) is pulled into P0/P1
because of its new-user impact — see the priority matrix.
