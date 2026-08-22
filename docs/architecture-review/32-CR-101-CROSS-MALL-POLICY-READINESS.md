# 32 — CR-101 Cross-Mall Policy Readiness Review

Audit only. No code changed anywhere in this phase — controllers, services, guards, permissions, frontend, schema, migrations, tests, and configuration are all confirmed untouched (verified: `git status --short` after this phase's work shows only new/modified files under `docs/`).

## Objective

Resolve the remaining Cross-Mall authorization *policy* ambiguity (who may see/write/approve/export multiple Malls) before any Phase 3G implementation is authorized. Technical enforcement machinery (`MallAccessService`, the resolver registry, `@Scope` metadata) is already in place from Phases 1-3E; what remains is a business decision about *what CEO's access should be*, not a technical gap.

## Primary business decision — BC-CEO-SCOPE

Re-verified fresh this session against current `role-permissions.ts` and every relevant controller (not carried forward from the 2026-08-21 ADR without re-checking). The ADR's core finding **still holds and is now backed by more evidence**: ADMIN's blanket bypass is consistent with documented intent; CEO's is not. The full 21-domain matrix is `33-CR-101-CEO-CAPABILITY-MATRIX.md`. Headline: **3 confirmed contradictions** between the documented persona ("deliberately excludes day-to-day operational detail — no spaces/crm/bookings/tickets") and current code — **Proposals** (full CRUD, not "approval final-tier only"), **Parking** (full operational write), and **Work Orders** (full operational write, newly found this session — the largest of the three). One milder contradiction — **Sales** (record-creation, though approve/dispute fits). One config-scope contradiction — **Analytics** (Mall-policy/retention write, not just oversight read).

## Three options — presented, not selected (per this authorization's Section 4)

See `35-CR-101-PHASE-3G-IMPLEMENTATION-PLAN.md` for full per-option implementation deltas, consequences, and risk. Summary:

- **Option A** — Executive global read (5 persona domains) + Approvals unchanged, operational writes removed. Closes all confirmed contradictions. Moderate implementation size (requires the `BYPASS_ROLES` mechanism to become domain-aware, not a flat list — the largest structural change of the three).
- **Option B** — Persona-limited: exactly the 5 documented domains, nothing else (loses Service Contracts/Sales read too, which are not contradictions today). Most faithful to the text, highest risk of an undocumented-workflow break.
- **Option C** — Ratify current behavior; edit the persona doc instead of the code. Zero risk, leaves all confirmed contradictions in place indefinitely.

## Recommended option: A, with rationale

The evidence pattern (3 confirmed operational-write contradictions, one of them — Work Orders — newly discovered and the largest yet) has grown stronger, not weaker, since the original ADR. Option A closes every confirmed contradiction while preserving CEO's genuinely-used oversight capabilities (Dashboard, Reports, Analytics-read, Approvals, AI) and the two domains that are read-only and *not* contradictions (Service Contracts, Sales-approve). Option B's extra restriction (removing Service Contracts/Sales/Audit-Log entirely) isn't fixing a bug — those aren't contradictions — so it carries real behavior-change risk for no corresponding evidence-based justification. Option C leaves live, confirmed cross-Mall operational-write exposure (any CEO account can today create a Work Order or Parking contract for any Mall on the platform) in place indefinitely with no stated rationale for why. **Not a decision — a recommendation, per Section 25's explicit request for one.**

## CROSS_MALL_READ semantics

Defined precisely in `34-CR-101-CROSS-MALL-PERMISSION-MODEL.md` §1: read-only, all-Mall (not assigned-multi-Mall or explicit-Mall-set) for CEO specifically, given `seed.ts` already provisions CEO with `UserMallAccess` to every Mall and the persona's own "across all malls" framing. Never implies create/update/delete/approve/admin.

## CROSS_MALL_WRITE

**REQUIRED (evidenced), but BC REQUIRED for confirmation of intent.** One genuine cross-Mall write capability was found — `POST /spaces/units/bulk-update` — not previously identified in the ADR's search. Full detail and recommendation (track as its own narrow `BC-BULK-UNIT-CROSS-MALL`, independent of `BC-CEO-SCOPE`) in `34-...` §2.

## Reports/Analytics

`BC-013` remains open and is **not** resolved by this session's work — it concerns `LEASING_MANAGER`/`MALL_DIRECTOR`/`FINANCE`'s default Reports/Analytics scope, which is orthogonal to CEO's own scope. Confirmed still-live via fresh code read: `analytics.controller.ts`'s class-level `@Scope` is still `GAP, trackedAs: 'CONTRA-008/AUTH-01'`, and `GET /analytics/multi-mall` still has zero `MallAccessService` call. The underlying mechanism (accessible-mall-set-by-default, already correctly built in `DashboardService`) doesn't need building — `BC-013` is which *default* to apply to it, a parameter choice, not a blocker to the mechanism.

## Approvals

Already correct — data-driven via `ApprovalStep.approverRole`, matches "approvals (final-tier)" exactly today. No change needed under any option. Full detail `34-...` §6.

## Files

Policy-only conclusion, File architecture NOT reopened: CEO's document access should continue to track whatever module access it ends up with. No independent Files exception proposed. Full detail `34-...` §7.

## AI

No AI-specific decision — must follow whichever CEO Mall-scope policy is chosen; zero AI code change required by this decision regardless of outcome. Full detail `34-...` §8.

## Open business decisions — Cross-Mall-related items re-triaged this session

| Item | Question | Status |
|---|---|---|
| `BC-CEO-SCOPE` | Should CEO's blanket bypass narrow to a documented cross-Mall-read set? | **MUST CONFIRM BEFORE 3G** — this document's primary subject |
| `BC-009` | Is the Spaces mall-scoping gap exploitable given real `UserMallAccess` patterns? | **RESOLVED FROM EVIDENCE** — both underlying code gaps (route-level P0-002, and the unstripped-`mallId`-on-update data-integrity gap) are confirmed closed as of Phase 3B (`spaces.controller.ts`'s `updateUnit`/`updateUnitStatus` now `@Scope ENFORCED`; `spaces.service.ts`'s `sanitizeUnitDto` now has `mallId` in `UNIT_LIFECYCLE_FIELDS`, throwing on any client-supplied value). The original question is now moot — there is no live gap left to be exploitable. |
| `BC-013` | Is Reports/Analytics' missing default Mall-scoping intentional? | **MUST CONFIRM BEFORE 3G** — still open, re-confirmed live via fresh code read this session (class-level `GAP` on Analytics, zero Mall check on `/analytics/multi-mall`). Blocks a clean CEO-Analytics-read policy statement only in the narrow sense that "CEO sees all-Mall Analytics" needs a coherent baseline to sit next to — recommend resolving together with `BC-CEO-SCOPE`, not as a hard sequential blocker. |
| `BC-017` | Is Fitout-controls/gantt/daily-report's missing enforcement accepted or a regression? | **RESOLVED FROM EVIDENCE** — confirmed closed. Every one of `fitout-controls.controller.ts`, `fitout-gantt.controller.ts`, `fitout-daily-report.controller.ts` now carries `@Scope(... status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A')` — fixed in an earlier phase than this review previously tracked. No open question remains; the original BC item is stale. |
| `BC-020` | Is the Tickets tenant-isolation gap (`escalations`/`rate`/`rating`/SLA-policy) intentional? | **CAN DEFER** — confirmed still open (`tickets.controller.ts`'s `rate`/rating routes still carry `@Scope(... status: EnforcementStatus.GAP, trackedAs: 'CONTRA-003')`), but Tickets is entirely outside CEO's access in every option (A/B/C) — this item does not block or interact with `BC-CEO-SCOPE` in any way. Carried forward unresolved, correctly out of this phase's scope (Phase 3G authorization did not include Tickets). |

## Phase 3G entry gate

Full checklist in `35-CR-101-PHASE-3G-IMPLEMENTATION-PLAN.md`'s closing section. **Net result: two hard blockers remain** — `BC-CEO-SCOPE` (the primary subject of this whole package) and `BC-013` (pre-existing, would otherwise leave CEO's own Analytics-read policy sitting on an undefined baseline). `BC-BULK-UNIT-CROSS-MALL` is new, narrow, and non-blocking.

## Application code changed this phase

**NONE.** Confirmed by `git status --short` — every file touched this session is under `docs/architecture-review/` or `docs/business-decisions/`.

## Database / Schema / Migration

UNCHANGED / UNCHANGED / NONE.

## PHASE 3G IMPLEMENTATION READINESS: **BLOCKED**

**BLOCKER**: `BC-CEO-SCOPE` (primary) + `BC-013` (secondary, narrower). See `docs/business-decisions/BC-CEO-SCOPE-DECISION.md` for the management-facing decision request.

**NEXT: HUMAN BUSINESS DECISION**
