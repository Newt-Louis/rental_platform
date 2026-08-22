# 15 — CR-101 Route Coverage Matrix

**Update (2026-08-21, Phase 1/2 implementation):** the 3 UNKNOWN groups below (deal-scoring, SAP, Spaces base) were resolved during Phase 1 implementation, and 6 additional gaps were found while annotating routes (Spaces Malls CRUD -- more severe than the Unit-level gap; Spaces Floors/Zones `:id` routes; Service-Catalog; Announcements admin CRUD; SAP `syncCustomer`). The live, authoritative count (523 routes, 41 controller files, 0 UNDECLARED, 0 UNKNOWN) now comes from `apps/backend/scripts/route-scope-inventory.ts`, run directly against the codebase, rather than the manual sweep below. See `docs/changes/CR-101-PHASE-1-2-COMPLETION.md` for the full account. The manual analysis below remains as the historical record of how the gaps were first found.

Fresh sweep performed 2026-08-21 (background research agents for this task hit an account spend limit and failed mid-run; this matrix was built directly instead — route/mallAccess-call counts are freshly grepped this session, not reused from prior-phase prose). 39 controller files found, ~515 individual route handlers. This document classifies at module × operation-category granularity (the useful architectural unit) and separately lists every specific confirmed-gap route by name — a literal 515-row table would not be more informative for a design decision.

## Per-controller sweep (fresh, this session)

| Controller | Routes | Explicit `MallAccessService` calls | Verdict |
|---|---|---|---|
| ai.controller.ts | 8 | 0 | MALL-SCOPED, gap (confirmed prior + this session) |
| analytics.controller.ts | 16 | 0 | MALL-SCOPED, gap (confirmed) |
| announcements.controller.ts | 6 | 0 | **Mixed** — tenant-viewer path correctly service-scoped (positive); **staff-admin CRUD path (`create`/`findAllAdmin`) has NO mall validation on `dto.mallId`/filter — NEW gap found this session** |
| audit-log.controller.ts | 3 | 0 | GLOBAL (ADMIN/CEO-only, bypass roles — appropriate) |
| auth.controller.ts | 6 | 3 | GLOBAL (login/register are `@Public()`; scoped routes correctly call mallAccess) |
| billing.controller.ts | 34 | 39 | MALL-SCOPED, comprehensively covered (best-covered controller in the platform) |
| booking.controller.ts | 16 | 8 | MALL-SCOPED, covered |
| branding.controller.ts | 5 | 0 | GLOBAL (singleton config, appropriate) |
| categories.controller.ts | 15 | 8 | Mixed — base taxonomy GLOBAL (appropriate), `CategoryMallPricing` sub-resource covered |
| contracts.controller.ts | 26 | 9 | MALL-SCOPED, covered; 2 TENANT refs (tenant-facing sub-paths) |
| crm.controller.ts | 24 | 7 | MALL-SCOPED, **`getUnifiedDeals` gap confirmed (prior + this session)** |
| customers.controller.ts | 8 | 0 | MALL-SCOPED (model has no `mallId` field — see `BUSINESS_CONFIRMATION_REQUIRED.md` BC-016), **confirmed gap** |
| dashboard.controller.ts | 2 | 0 | MALL-SCOPED, covered **internally by the service** (positive example) |
| fitout-controls.controller.ts | 7 | 0 | MALL-SCOPED, **confirmed gap** (`:projectId` param name unmatched by guard) |
| fitout-daily-report.controller.ts | 5 | 0 | MALL-SCOPED, **partial gap** (list/create caught by guard's `projectId` auto-match; `:entryId/photos` routes not) |
| fitout-gantt.controller.ts | 4 | 0 | MALL-SCOPED, **partial gap** (list/create caught; `PATCH`/`DELETE /fitout-tasks/:id` not, since `:id` = task not project) |
| fitout-issue.controller.ts | 9 | 0 | MALL-SCOPED — **NOT a gap, re-verified this session**: every route is actually caught by the global guard's automatic `path.includes('fitout-issue')` match (the literal path is `/fitout-issues/...`, which contains the substring `fitout-issue`) — but this is **fragile, implicit coverage by naming coincidence**, not a declared contract; a future rename would silently reopen the gap. See `19-CR-101-ADR.md`'s rationale section — this is the clearest illustrative case for why explicit declaration matters even for routes that work today. |
| fitout-submittal.controller.ts | 11 | 3 | MALL-SCOPED, covered |
| fitout.controller.ts | 34 | 5 | MALL-SCOPED, covered (base Fitout project routes); 2 TENANT refs |
| inventory.controller.ts | 10 | 8 | MALL-SCOPED, covered |
| notifications.controller.ts | 4 | 0 | USER-SCOPED (own notifications only — appropriate, not a Mall concept) |
| parking-dashboard.controller.ts | 6 | 0 | MALL-SCOPED (keyed by `parkingCode`, no mall mapping), **confirmed gap** |
| parking.controller.ts | 17 | 2 | MALL-SCOPED, covered (low call count reflects one shared `access` helper pattern, verified consistent with prior finding, not re-counted as a gap) |
| patrol.controller.ts | 22 | 2 | MALL-SCOPED, covered (same shared-helper pattern) |
| deal-scoring.controller.ts (`modules/proposals/`) | 3 | 0 | MALL-SCOPED — **not independently verified this session**, flagged UNKNOWN pending follow-up (low route count, likely proposal-linked; check before CR-101 implementation) |
| proposals.controller.ts | 20 | 9 | MALL-SCOPED, covered |
| reports.controller.ts | 9 | 0 | MALL-SCOPED, **confirmed gap** (whole controller) |
| sales.controller.ts | 9 | 0 | MALL-SCOPED for internal roles, **confirmed gap**; TENANT-SCOPED path (own submissions) correctly service-scoped |
| sap.controller.ts | 11 | 3 | INTERNAL/MALL-SCOPED mixed — push/reconciliation triggers, not independently re-verified this session |
| service-contracts.controller.ts | 23 | 12 | MALL-SCOPED, covered |
| slots.controller.ts | 17 | 6 | MALL-SCOPED, covered |
| service-catalog.controller.ts (`modules/spaces/`) | 6 | 0 | **Mixed, NEW gap found this session**: `GET/POST mall/:mallId` routes are fine (guard auto-catches the named `:mallId` route param); `GET proposal/:proposalId/services` and `POST proposal/:proposalId/services/sync` are **not** — `proposalId` is not in the guard's automatic-extraction field list, and the controller makes no explicit call. Roles include `LEASING_MANAGER`/`MALL_DIRECTOR` (non-bypass). |
| spaces.controller.ts | 45 | 3 | MALL-SCOPED, **confirmed gap on all `/units/*` routes** (see `01-P0-VERIFICATION.md` P0-002); Malls/Floors/Zones base routes not independently re-verified this session |
| telemetry.controller.ts | 1 | 0 | GLOBAL (client-error logging, appropriate) |
| tenants.controller.ts | 8 | 10 | MALL-SCOPED, covered |
| tickets.controller.ts | 25 | 15 | MALL-SCOPED + TENANT-SCOPED, covered on core CRUD; **confirmed gap on 3 endpoints** (`escalations`/`rate`/`rating`) + SLA-policy admin routes, per `CONTRA-003` |
| user-mall-access.controller.ts | 5 | 2 | INTERNAL/ADMIN (manages the `UserMallAccess` grants themselves — self-referential, appropriately restricted) |
| users.controller.ts | 7 | 0 | GLOBAL/ADMIN-only (`@Roles(Role.ADMIN)` class-level — ADMIN bypasses both RolesGuard metadata and MallAccessGuard entirely, so this is self-consistently ADMIN-only by construction, not a gap) |
| work-orders.controller.ts | 19 | 8 | MALL-SCOPED, covered |

## Confirmed-gap route list (consolidated, for direct use in Phase 3 of the migration plan)

1. `spaces.controller.ts` — all `/units/*` routes (GET/PATCH/DELETE/status/media/history/map-position), plus `/units`, `/floors`, `/zones` list endpoints when `mallId` omitted. **P0.**
2. `analytics.controller.ts` — entire controller (16 routes), no `MallAccessService` at all. **P0.**
3. `reports.controller.ts` — entire controller (9 routes). **P0.**
4. `sales.controller.ts` — internal-role routes (findAll/getSummary/getTopTenants/getDeadlineStatus). **P1.**
5. `parking-dashboard.controller.ts` — entire controller (6 routes), keyed by `parkingCode` not `mallId`. **P1.**
6. `fitout-controls.controller.ts` — entire controller (7 routes). **P1.**
7. `fitout-gantt.controller.ts` — `PATCH`/`DELETE /fitout-tasks/:id` only (list/create are fine). **P1.**
8. `fitout-daily-report.controller.ts` — `:entryId/photos` routes only (list/create are fine). **P2.**
9. `ai.controller.ts` — entire controller (8 routes), chat context unscoped. **P1.**
10. `crm.controller.ts` — `getUnifiedDeals` specifically (DB-level unfiltered, only in-memory optional post-filter). **P1.**
11. `customers.controller.ts` — entire controller (8 routes); model has no `mallId` field at all — needs `BC-016` resolved before a resolver can even be designed (schema question, not just an authorization-wiring question). **P1, BC-dependent.**
12. `tickets.controller.ts` — `escalations`/`rate`/`rating` + SLA-policy admin routes (this is TENANT-scoping, not Mall-scoping — tracked in `AUTH-01` as a related-but-narrower fix, per `08-ROOT-CAUSE-CLUSTERS.md`). **P1.**
13. `files.controller.ts` (`apps/backend/src/files/`) — all 8 document-retrieval route families, cross-Mall IDOR (see `02-FILE-SECURITY-ARCHITECTURE.md`). **P1.**
14. **NEW, found this session** — `announcements.controller.ts` — staff-admin CRUD path (`create`, `findAllAdmin`, presumably `update`/`delete` following the same pattern) has no Mall validation on `dto.mallId`/the list filter. **P1** (financial/operational bulletin content, not merely display).
15. **NEW, found this session** — `service-catalog.controller.ts` — `proposal/:proposalId/services` (GET) and `proposal/:proposalId/services/sync` (POST). **P2** (narrower blast radius — service-catalog line items, not core financial/PII data).

## UNKNOWN routes remaining (must reach zero before implementation approval, per Section 4)

- `deal-scoring.controller.ts` (3 routes) — not independently re-verified this session; flag for a dedicated check before Phase 1 of the migration plan begins (should be quick — 3 routes).
- `sap.controller.ts`'s exact per-route breakdown — module-level MALL-SCOPED/INTERNAL classification is confident, but the 11 individual routes were not each individually re-verified this session.
- Malls/Floors/Zones base routes within `spaces.controller.ts` (as opposed to the confirmed-gap Units routes) — not independently re-verified this session; prior research found no gap here specifically but this was not exhaustively re-confirmed.

These three items are the concrete "shrink UNKNOWN to zero" checklist for whoever executes Phase 1 of `17-CR-101-MIGRATION-PLAN.md`.
