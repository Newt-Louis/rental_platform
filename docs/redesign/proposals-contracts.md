# Redesign Spec — Proposals & Contracts

**Purpose:** Fix the missing Proposal entry point and reduce Contracts' 7-tab
cognitive density with a summary-first view.
**Persona:** Leasing Executive/Manager (Proposals); Leasing Manager, Legal,
Finance (Contracts).
**User goal (Proposals):** Start and track a proposal without prior knowledge of
the data model. **User goal (Contracts):** See current status, next required
action, and owner at a glance before drilling into any of the 7 detail tabs.

## Proposals — current problems

FR-02 (no create entry point), FR-05 (invisible approval-chain preview), FR-09
(bare empty state).

## Proposals — information hierarchy

1. List header: "+ Tạo đề xuất" primary action (opens booking-picker →
   `ConvertToProposalDialog`, per backlog Feature 1.2)
2. Each row: status badge, approval-chain preview badge ("Cần: Manager → Director"
   for chains not yet submitted; current step for chains in progress)
3. Empty state: contextual CTA per FR-09/Epic 5 (has bookings without proposals →
   "Tạo đề xuất"; no eligible bookings → "Tạo Booking trước")

## Contracts — current problems

V2: 6+ detail tabs create high cognitive density; contract activation doesn't
visibly cascade to Fitout/Billing (11-Information Flow finding).

## Contracts — information hierarchy (redesigned detail view)

1. **Summary** (new, first tab): status, next required action + owner
   ("Chờ Legal duyệt — Nguyễn Văn A"), key dates (start/end/expiry warning),
   readiness checklist for activation (signature status, unit occupancy, Fitout
   started?, billing schedule started?) — directly closes the 11-Information-Flow
   silent-handoff gap.
2. Documents, Events, Amendments, Template, Billing, Termination — existing tabs,
   unchanged, now reached from the Summary rather than being the first thing seen.

## Components

- Reuse existing tab component and per-tab content — this is a re-ordering plus
  one new Summary tab, not a rebuild of the 6 existing tabs.
- Reuse `ApprovalPipeline`-style status visualization for the readiness checklist.

## States

- Contract Summary readiness checklist: each item shows done/pending with an
  action link (e.g., "Fitout chưa bắt đầu — [Bắt đầu Fitout]") rather than a
  passive checkbox.

## Permissions

Unchanged — tab visibility continues to follow existing role checks
(`MallAccessGuard` + `MODULE_ROLES.contracts`/`.proposals`).

## Acceptance criteria

- A new user can create a proposal from `/proposals` without visiting Bookings
  first (functionally routed through the same dialog, but discoverable).
- A Contract's Summary tab answers "what's next and who owns it" without opening
  any of the other 6 tabs.
