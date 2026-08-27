# CR-101 Phase 3G — Cross-Mall / CEO Scope Implementation Completion

Implements the human-approved BC-CEO-SCOPE Option A decision, the BC-013 Reports/Analytics/Dashboard Mall-scope policy, and the BC-BULK-UNIT-CROSS-MALL: DENY decision. See `docs/architecture-review/35-CR-101-PHASE-3G-IMPLEMENTATION-PLAN.md` for the design this followed and `docs/architecture-review/33-CR-101-CEO-CAPABILITY-MATRIX.md` for a disclosed correction to two of that plan's inputs (below).

## Disclosed correction — Proposals and Parking needed no change

Before implementing, `proposals.controller.ts` and `parking.controller.ts` were re-read directly (not assumed from the prior capability-matrix text, which had itself carried forward an unverified claim). Both already exclude CEO from every mutating route via existing method-level `@Roles` overrides (`PROPOSAL_EDIT_ROLES`/`PROPOSAL_CONVERT_ROLES`, `EDIT`/`FINANCE_EDIT`) — **zero matches for `Role.CEO`** in either file outside the class-level read-only default. This contradicts the capability matrix this session's own readiness review produced (which the approved decision named these two domains based on) — corrected in place in `33-CR-101-CEO-CAPABILITY-MATRIX.md` with a dated, non-silent correction. **No code change was made to either controller.** The two real, freshly-verified contradictions were **Work Orders** and **Sales creation**, plus **Analytics config-write** — all three closed below.

## 1. BC-CEO-SCOPE Option A — mechanism

`MallAccessService`:
- `BYPASS_ROLES` narrowed to `[ADMIN, TENANT]` — CEO removed.
- New `CROSS_MALL_READ_ROLES = [CEO]` and `hasCrossMallRead(role)`.
- `assertMallAccess`, `getAccessibleMallIds`, `extractAndValidateMallAccess` all gained an optional 4th/3rd `opts: { crossMallRead?: boolean }` parameter. A call site must explicitly pass `{ crossMallRead: true }` for CEO to get unrestricted (`null`/no-deny) treatment — mirrors the existing "declared, not granted" philosophy already used by `@Scope`'s `crossMallRead` metadata field. Every call site that does **not** pass it gives CEO exactly the same ordinary `UserMallAccess`-derived scoping as any other non-bypass role.

Explicitly opted in (the 5 documented oversight domains + the Approvals action, per the approved "CEO may" list):
- **Dashboard**: base `getDashboard()`'s accessible-mall-ids branch (the dedicated `/dashboard/cross-mall` route needed no change — it was already always-unrestricted for its `[ADMIN, CEO]`-only role gate, independent of `BYPASS_ROLES`).
- **Reports**: every route via a new `scope()` controller helper.
- **Analytics**: every read route (`occupancy`, `occupancy/trend`, `vacancy`, `category-by-floor`, `renewal-risk` dashboard, `multi-mall`, `mall-policy` GET, `compliance/retention` GET) via the same pattern.
- **AI**: `chat`/`chatStream`/`getSuggestions` (unchanged architecture, just the added opt-in) and the floor-plan **read** routes (`getAnalyses`, `getAnalysis`, `getAnalysisStatus`) — deliberately **not** `analyzeFloorPlan` (upload) or `applyAnalysis` (creates real Floor/Zone/Unit records), since those are writes and "CEO global read DOES NOT imply CREATE."
- **Approvals**: the `mallIds()` list helper (`pending`/`history`/`all`) and the `approve`/`reject`/`getWorkflow` Mall checks — the real authorization gate for approve/reject remains `ApprovalStep.approverRole`, unchanged, in `ApprovalsService`.

## 2. BC-013 — Reports/Analytics/Dashboard Mall-scope policy

**Reports** (`reports.controller.ts`/`reports.service.ts`) had zero `MallAccessService` usage anywhere (`CONTRA-008/AUTH-01`) — every route now resolves scope via the same `scope()` pattern (explicit `mallId` validated against the caller; otherwise the caller's accessible set). Every one of the 9 report methods (`occupancy`, `pipeline`, `revenue`, `contract-expiry`, `tenant-sales`, `revenue-receivables`, `ar-aging`, `export/:type`) now takes and applies a `mallIds: string[] | null` filter using the correct relation path per model (`Unit.mallId` direct, `Invoice.mallId` direct, `Proposal`/`Contract`/`SalesTurnover` via `unit.mallId`, `Lead.mallId` direct). `compliance` needed no filter — its `[ADMIN, CEO]`-only role gate means both reachable roles are unrestricted under the approved policy already.

**Analytics**: `getMultiMallComparison` (the confirmed, longest-tracked `CONTRA-008/AUTH-01` gap — previously zero Mall check, unconditionally aggregating every active Mall) now resolves scope identically; `compliance.service.ts`'s `getMultiMallComparison` gained a `mallIds` filter on its Mall query. The four occupancy-analytics read methods and `renewal-risk`'s dashboard gained the same `mallIds` fallback alongside their existing single-`mallId` filter param.

**Policy achieved**: normal staff → own `UserMallAccess` set; `MALL_DIRECTOR` → assigned set (same mechanism, no special case); CEO → unrestricted via `crossMallRead`; ADMIN → unrestricted via `BYPASS_ROLES`. No Reports/Analytics endpoint treats a missing Mall filter as "show everything" for a non-privileged caller anymore.

## 3. CEO operational-write removal

- **Work Orders** (`work-orders.controller.ts`): new `WRITE_ROLES = ROLES.filter(r => r !== CEO)` applied to all 12 mutating routes (`createTemplate`, `updateTemplate`, `toggleTemplate`, `runTemplate`, `create`, `update`, `status`, `review`, `checklist`, `comment`, `toggle`, `evidence`). Read/list/summary/export (`list`, `summary`, `exportCsv`, `templates`, `detail`) unaffected — CEO keeps full read+export visibility.
- **Sales** (`sales.controller.ts`): new `SALES_CREATE_ROLES = MODULE_ROLES.sales.filter(r => r !== CEO)` applied only to `POST /sales` (record creation). `approveSales`/`disputeSales`/read routes unaffected — still inherit `salesStaff`/class default, both of which still include CEO.
- **Analytics config-write**: new `ANALYTICS_CONFIG_WRITE_ROLES = MODULE_ROLES.analytics.filter(r => r !== CEO)` applied to `upsertMallPolicy` and `updateMallRetention`. Read counterparts (`getMallPolicy`, `getMallRetention`) unaffected, and additionally gained `crossMallRead` (oversight-appropriate read).

## 4. BC-BULK-UNIT-CROSS-MALL: DENY

`spaces.service.ts`'s `bulkUpdateUnits` gained an explicit same-Mall guard — `distinctMallIds.length > 1` throws `BadRequestException` before any per-unit access check or write, mirroring the existing pattern already used by its sibling `mergeUnits`. Applies uniformly to every caller, including ADMIN/CEO — no role gets a bypass on this specific check, matching "Do not introduce CROSS_MALL_WRITE."

## 5. Verification checklist (per the authorization's Section, items 1-12)

| # | Item | Result |
|---|---|---|
| 1 | CEO enterprise read works across multiple Malls | ✅ Dashboard/Reports/Analytics/AI/Approvals all resolve `null` (unrestricted) for CEO via `crossMallRead` |
| 2 | CEO cannot perform unauthorized operational writes | ✅ Work Orders/Sales-creation/Analytics-config narrowed; Proposals/Parking already correctly narrowed (see disclosed correction) |
| 3 | CEO Approval remains functional when assigned by workflow | ✅ `crossMallRead` removes the Mall gate; `ApprovalStep.approverRole` (unchanged) remains the real gate |
| 4 | Mall Director A cannot read Mall B unless explicitly assigned | ✅ Unaffected — `MALL_DIRECTOR` never passes `crossMallRead`, ordinary `UserMallAccess` scoping applies everywhere including the newly-scoped Reports/Analytics routes |
| 5 | Normal staff cannot expand scope using mallId parameters | ✅ Every `scope()` helper validates an explicit `mallId` against the caller's own access before use — denies, doesn't expand |
| 6 | `/analytics/multi-mall` follows the approved policy | ✅ Tested — normal staff gets own set, CEO gets `null` |
| 7 | Reports follow the same canonical Mall-scope semantics | ✅ All 9 report methods, tested at both controller and service (query-filter) level |
| 8 | AI follows CEO enterprise-read policy without special bypass logic | ✅ Reuses the same `crossMallRead` opt-in as every other domain — no AI-specific branch |
| 9 | File access follows module authorization | ✅ Unaffected by design — `files.controller.ts` was not modified; its calls to `MallAccessService` never opt into `crossMallRead`, so CEO's file downloads now correctly require real `UserMallAccess` for every family it can still role-reach, which is a *more* correct consequence of module authorization than the previous blanket bypass, not a regression |
| 10 | Cross-Mall bulk Unit update is rejected | ✅ Tested, applies to every role including CEO/ADMIN |
| 11 | ADMIN behavior remains unchanged | ✅ `ADMIN` untouched in `BYPASS_ROLES`; zero ADMIN-specific code path modified anywhere this phase |
| 12 | Existing single-Mall workflows remain unchanged | ✅ Confirmed by full regression — 575/575 backend tests passing, zero pre-existing test modified for behavior (only for the new 4th/3rd `opts` argument shape) |

## 6. Adversarial review

| Attempt | Result |
|---|---|
| CEO calls `upsertMallPolicy`/`updateMallRetention` | Denied — role metadata excludes CEO (tested) |
| CEO calls any Work Orders write route | Denied — role metadata excludes CEO on all 12 (tested) |
| CEO calls `POST /sales` | Denied — role metadata excludes CEO (tested) |
| CEO calls `bulkUpdateUnits` with unit IDs spanning 2 Malls | Denied before any per-unit check — same-Mall guard applies unconditionally (tested) |
| CEO reads Reports/Analytics/Dashboard/AI/Approvals across every Mall | Allowed — `crossMallRead` (tested) |
| CEO attempts a Mall Director's single-Mall route (e.g. Contracts, Billing, Fitout) | Unaffected, unchanged — CEO was never in those `MODULE_ROLES` lists to begin with, and this phase added no new grant anywhere |
| Retry after any of the above denials | No side effects — every narrowed route's guard/check runs before its service is ever called (RolesGuard for the `@Roles` narrowing, the `scope()`/mall-check helpers for the crossMallRead routes) |
| Normal staff passes `crossMallRead` semantics by supplying an out-of-scope `mallId` on Reports/Analytics | Denied — `assertMallAccess` still checks real `UserMallAccess`; `crossMallRead` only ever benefits `CROSS_MALL_READ_ROLES` members (tested directly in `mall-access.service.spec.ts`) |
| ADMIN attempts anything | Unaffected — still full bypass, untouched |

No P0/P1/P2 findings. Zero unknowns.

## Known P0: 0
## Known P1: 0
## Known P2: 0
## Unknown: 0

## CROSS-MALL AUTHORIZATION DOMAIN: **CLOSED**

## Application files changed
`mall-access.service.ts`, `mall-access.service.spec.ts`, `dashboard.service.ts`, `dashboard.service.spec.ts`, `reports.controller.ts`, `reports.service.ts`, `reports.controller.phase3g.spec.ts` (new), `reports.service.mall-scope.spec.ts` (new), `analytics.controller.ts`, `analytics.controller.phase3g.spec.ts` (new), `occupancy-analytics.service.ts`, `renewal-risk.service.ts`, `compliance.service.ts`, `ai.controller.ts`, `ai.controller.spec.ts`, `approvals.controller.ts`, `approvals.controller.spec.ts`, `work-orders.controller.ts`, `work-orders.controller.role-scope.spec.ts` (new), `sales.controller.ts`, `sales.controller.role-scope.spec.ts` (new), `spaces.service.ts`, `spaces.crud.spec.ts`.

## Regression
- Backend: 82 → 87 suites (5 new files), 539 → 575 tests (36 new). All passing.
- Frontend: 28/29 files, 216/225 tests — unchanged baseline, same 9 pre-existing `BookingsPage.test.tsx` failures. Zero frontend files touched.
- Backend `tsc --noEmit`: clean. `eslint` on every changed/new file: clean. `nest build`: clean. `git diff --check`: clean (pre-existing CRLF warnings on 2 files, unrelated content). Route inventory: 523 routes / 41 controllers, unchanged (no routes added/removed, only role/scope metadata changed on existing routes).

## Database: UNCHANGED
## Schema: UNCHANGED
## Migration: NONE
## HEAD: UNCHANGED (`915c96e4b90c8002c238f731a90bd86cc90f4114`)
## Staged: 0
## Commit: NOT CREATED
## Release: RC3 UNCHANGED

**NEXT: CR-101 CONSOLIDATION / UAT CANDIDATE GATE**

**IMPLEMENTATION AUTHORIZATION: CONSUMED**
