# 01 — Enterprise UX Foundation

**Date:** 2026-08-19
**Scope:** Phase 1 of `docs/program/`. Inventories the shared UX primitives
the program's Phase 2+ business-workflow phases will build on. Per the
program's own golden rule (UNDERSTAND → REUSE → STANDARDIZE), this document
reuses and corrects `docs/audit/10-DESIGN-SYSTEM-AUDIT.md` and
`docs/ERP_UX_STANDARD.md` rather than re-deriving an inventory from
scratch — both were written one day before this phase and remain current
except where noted below.

## Reference implementations to reuse, not re-invent

Per section 7 of the master program. These are the patterns Phase 2+
should point to when building workflow screens:

| Pattern | Where | Why it's the reference |
|---|---|---|
| Empty-state with CTA | `Tickets` module | Cited in `10-DESIGN-SYSTEM-AUDIT.md` as the pattern Proposals/Contracts/Billing were brought up to in Option B (FR-09) |
| Task cluster navigation | Sidebar `salesProcess` grouping | Pre-existing pattern that Option B's nav regroup (Wave 2) extended platform-wide |
| Process guidance | `ErpProcessGuide` | Named directly in the master program's reference list |
| Tenant-facing mobile nav | `TenantBottomNav` | Only mobile-first surface confirmed in the design-system audit |
| Cross-module handoff visibility | Contract detail → Fitout/Billing state (Option B Wave 4) | Concrete implementation of section 11's "preserve context" rule |

## Component inventory

Status legend: **STANDARD** = one implementation, consistently used ·
**DUPLICATED** = more than one implementation exists · **UNDERUSED** =
exists but not consistently adopted · **GAP** = no shared implementation.

| Component | Status | Detail |
|---|---|---|
| PageHeader | UNDERUSED | Exists; audit flags "adopt or remove" — not yet adopted platform-wide. Carried to Phase 11 (design-system consolidation), not re-scoped here. |
| Breadcrumb | Not separately inventoried | No dedicated audit finding; deferred to Phase 11 spot-check rather than assumed fine. |
| PrimaryAction | STANDARD | `ERP_UX_STANDARD.md`'s "one primary action per screen, business-outcome label" rule is followed platform-wide per the design-system audit's confirmation pass. |
| Button / Input / Select / DatePicker / MoneyInput | STANDARD | shadcn/ui base library, `ERP_UX_STANDARD.md` interaction rules apply uniformly; no duplication findings against these primitives. |
| Search / Filter | STANDARD | Active-filter-count + "Xóa bộ lọc" rule confirmed as an existing, followed standard. |
| Table / Pagination | Not separately inventoried | Deferred to Phase 11; the one confirmed table-level gap (mobile card fallback on wide tables in Billing/Fitout) is tracked below under Loading/Responsive. |
| Status | STANDARD | Color-coded badge + i18n text label (never color-only) confirmed consistent across Tickets, Contracts, Fitout, Approvals. |
| EmptyState (`AsyncState`) | UNDERUSED | Imported in 19 files, but the `emptyAction` CTA slot is frequently left empty (was P0/P1 in Option B; Proposals/Contracts/Billing Invoices fixed — FR-09, resolved). Remaining screens not yet audited against this gap. |
| ErrorState | Not separately inventoried | No dedicated finding in either audit; flag as open for Phase 11. |
| Loading | STANDARD | Skeleton components consistently present on list views (Tickets/Contracts/Proposals/Billing spot-check). |
| Modal / Drawer | Not separately inventoried | shadcn/ui `Dialog`/`Sheet` used as the base primitive throughout; no duplication finding at the primitive level (duplication exists one layer up, in Confirmation — see below). |
| Tabs | GAP | No responsive/scrolling tab primitive exists. Fitout (~15 tabs), Billing (11), Contracts (7) all use flat tab bars that don't scroll gracefully. Confirmed by both audits. |
| Timeline | Not separately inventoried | Deferred to Phase 11. |
| ProcessGuide | STANDARD | `ErpProcessGuide` + `focusAreas` pattern is the reference implementation (see above). |
| Attachment | Not separately inventoried | Tickets' photo-attachment pattern (per memory of the Ticket/Tenant Portal feature) is the closest reference; not re-verified in this pass. |
| AuditTrail | Not separately inventoried | Deferred to Phase 11. |
| Confirmation | **DUPLICATED — worse than previously recorded** | See correction below. |

## Correction to the existing audit: three confirm-dialog implementations, not two

`10-DESIGN-SYSTEM-AUDIT.md` recorded two components — `ConfirmDialog` and
`ConfirmActionDialog` — and recommended consolidating to one. Verifying
against current code for this phase found a **third, undocumented**
implementation:

1. **`components/ui/confirm-action-dialog.tsx`** (`ConfirmActionDialog`) —
   `onOpenChange` API, `destructive` flag, fixed loading text
   ("Đang xử lý…"). Used in Contracts, Patrol, Billing, CRM, Spaces, Admin
   (7 call sites across `UnitDetailSheet.tsx`, `MallMapEditor.tsx`,
   `FloorPlanEditor.tsx`, `MallAccessTab.tsx`, etc.).
2. **`components/spaces/dialogs/ConfirmDialog.tsx`** (`ConfirmDialog`) —
   `onCancel`/`onConfirm` API, `description` prop, per-call `loadingLabel`,
   always destructive styling. Used in `BillingPage.tsx` (3 call sites),
   `CrmPage.tsx`, `ProposalsPage.tsx`, `SpacesPage.tsx` (2 call sites) —
   despite living in the `spaces/dialogs/` folder, it's actually the
   platform's most widely reused confirm dialog outside Admin.
3. **A local `ConfirmDialog` defined inside `AdminPage.tsx` itself** —
   same component name as #2 but a different, incompatible API (`message`
   prop instead of `description`, no `loadingLabel`). Used 4 times inside
   `AdminPage.tsx` only (user delete, mall delete, floor delete, zone
   delete).

**Why this wasn't caught by import-based tooling:** #2 and #3 share an
identical export name (`ConfirmDialog`), so a naive "how many
implementations" count can undercount by assuming same-name imports refer
to the same module. #3 is never imported from `spaces/dialogs/` — it
shadows the name locally within `AdminPage.tsx`.

**Consolidation is correctly scoped to Phase 11, not fixed here.** Merging
three components with three different prop shapes across 5 pages (14+ call
sites) without regressing any of them needs dedicated test coverage per
call site, not a fast pass under this phase's inventory work. Recorded as
the concrete Phase 11 backlog item, superseding the "merge two components"
framing in the prior audit.

## Standard Page / Detail models

Per sections 8–9 of the master program (Breadcrumb → Title/Context/Primary
Action → Status/Process → Search/Filters → Content → Related; and Identity
→ Status → Primary Action → Summary → Process/Timeline → Detail → Related
Records → Documents → Audit History for detail views). Not enforced
platform-wide today — this is Phase 2+ work (applied per-module as each
workflow phase touches that module), not retrofitted blindly here. Contract
detail (Option B Wave 4) is the closest existing example of the target
detail model, per section 14 of this program, and should be the template
Phase 3 formalizes.

## UX Semantic Language

`ERP_UX_STANDARD.md` already defines Vietnamese-first status terminology
with technical codes as secondary metadata — this satisfies section 10's
"draft/submitted/waiting approval/..." mapping requirement at the standard
level. The one confirmed gap: Billing's tabs mix English/Vietnamese
("AR Aging", "Dunning", "Collection KPI" left untranslated) — the audit's
proposed glossary (AR Aging→Tuổi nợ, Dunning→Nhắc nợ, Collection
KPI→Hiệu quả thu hồi) is adopted here as the standard and carried to
Phase 4 (Billing & Finance) for actual application.

## Gate

**VALIDATED — mostly no change required.** The foundation (buttons, forms,
status badges, loading states, process guidance, empty-state pattern) is
sound and consistently applied per both audits' evidence. Two real gaps
carried forward as concrete backlog, not re-litigated:

1. **Confirmation dialogs** — 3 implementations (corrected finding above) → Phase 11.
2. **Responsive tab primitive** — Fitout/Billing/Contracts flat tab bars → Phase 11, applied to Fitout in Phase 5 and Billing in Phase 4 as those modules are touched anyway.

PageHeader adoption, EmptyState CTA completion on remaining screens, and
the Billing terminology glossary are tracked as inputs to the specific
module phases (3–10) rather than a platform-wide sweep here, per the
program's own "apply within business journey, not module-first" principle
(section 2).

**Proceeding to Phase 2 (End-to-End Workflow Backbone).**
