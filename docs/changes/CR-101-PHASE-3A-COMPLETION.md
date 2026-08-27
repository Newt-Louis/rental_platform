# CR-101 Phase 3A — Completion Report

Status: **Implementation complete, unstaged, awaiting human review.** No commit made. RC3 remains the designated release candidate; no RC4 created.

## 1. Scope actually implemented

Low-risk HTTP Mall-enforcement for a curated 8-controller / 25-route "Batch A" canary, using the existing `MallAccessService.assertMallAccess` / `extractAndValidateMallAccess` pattern. Zero changes to `MallAccessGuard`'s global fallback, zero fail-closed behavior, zero CI gating, zero role-policy/CEO changes, zero schema migration. Plus read-only verification of the 3 previously-unresolved File owner→Mall reachability chains (Parking/ServiceContract/WorkOrder documents) — no File-controller code touched.

## 2. Route-by-route before/after (from `route-scope-inventory.ts --json`, re-run post-implementation)

| Route | Before | After | Resolver |
|---|---|---|---|
| `POST analytics/renewal-risk/:contractId` | GAP | **ENFORCED** | `contract` (existing) |
| `GET analytics/mall-policy/:mallId` | GAP | **ENFORCED** | direct `mallId` param |
| `POST analytics/mall-policy/:mallId` | GAP | **ENFORCED** | direct `mallId` param |
| `GET analytics/compliance/retention/:mallId` | GAP | **ENFORCED** | direct `mallId` param |
| `PUT analytics/compliance/retention/:mallId` | GAP | **ENFORCED** | direct `mallId` param |
| `POST deal-scoring/proposals/:id` | GAP | **ENFORCED** | `proposal` (existing) |
| `PATCH service-catalog/:id` | GAP | **ENFORCED** | `servicePriceCatalog` (**new**) |
| `DELETE service-catalog/:id` | GAP | **ENFORCED** | `servicePriceCatalog` (**new**) |
| `GET service-catalog/proposal/:proposalId/services` | GAP | **ENFORCED** | `proposal` (existing, reused) |
| `POST service-catalog/proposal/:proposalId/services/sync` | GAP | **ENFORCED** | `proposal` (existing, reused) |
| `POST announcements` | GAP | **ENFORCED** | direct `body.mallId` |
| `PATCH announcements/:id` | GAP | **ENFORCED** | `announcementMall` (**new**) |
| `DELETE announcements/:id` | GAP | **ENFORCED** | `announcementMall` (**new**) |
| `POST sap/sync/customer` | GAP | **ENFORCED** | `tenant` (existing) |
| `GET/POST/PATCH fitouts/:projectId/controls/*` (7 routes: summary, risks list/create, risk update, change-orders list/create, decision) | GAP | **ENFORCED** ×7 | `fitoutProject` (existing) |
| `PATCH fitout-tasks/:id` | GAP | **ENFORCED** | `fitoutGanttTask` (**new**) |
| `DELETE fitout-tasks/:id` | GAP | **ENFORCED** | `fitoutGanttTask` (**new**) |
| `GET fitout-daily-reports/:entryId/photos` | GAP | **ENFORCED** | `fitoutDailyReportEntry` (**new**) |
| `POST fitout-daily-reports/:entryId/photos` | GAP | **ENFORCED** | `fitoutDailyReportEntry` (**new**) |

**25 routes flipped GAP → ENFORCED.** 4 new resolvers added to `MallAccessService` (`servicePriceCatalogId`, `fitoutGanttTaskId`, `fitoutDailyReportEntryId`, `announcementId`), all additive, none replacing or modifying existing resolver logic.

### Deliberately deferred (remain GAP/PENDING_BUSINESS_CONFIRMATION/EXEMPT — not touched, not claimed fixed)
- Analytics: `getOccupancyV2`, `getOccupancyTrend`, `getVacancyAnalysis`, `getCategoryByFloor`, `getRenewalRiskDashboard` (optional-mallId, would need a service-layer accessible-mall-set fallback — out of scope for a conservative canary), `getMultiMallComparison` (inherently cross-mall, belongs to future CEO/cross-mall policy work), `listExports`/`requestExport`/`generateExport`/`triggerMonthlyReports`/`getDefaultRetention` (export subsystem, no traced mallId dimension).
- Announcements: `findAllAdmin` (query-param `mallId` is optional; would need the same accessible-mall-set fallback as the analytics list routes).
- SAP: `getLogs`, `getStats`, `listReconciliation`, `listMappings`, `getMappingSummary`, `getMapping`, `upsertMapping` — all remain `PENDING_BUSINESS_CONFIRMATION` (FINANCE cross-mall SAP visibility policy is genuinely undecided, not a wiring gap). `reconciliation/run` and `mappings/sync-pending` remain correctly `EXEMPT` (system-internal batch jobs, not single-Mall operations).
- `deal-scoring/criteria` (GET/POST) confirmed and left `GlobalScope` — platform-wide scoring configuration table, no `mallId` on the model.

Route-inventory platform-wide totals unchanged in shape: 523 routes, 473 DECLARED (up from 448 DECLARED / 25 GAP among Batch A specifically before this phase — the 25 newly-ENFORCED routes were already counted as DECLARED, since GAP is a sub-status of DECLARED, not a separate top-level bucket), 50 EXEMPT, 0 UNDECLARED, 0 UNKNOWN.

## 3. Testing

- **Positive/negative cross-Mall coverage**: extended the existing parameterized harness in `mall-access.service.spec.ts` (the pattern already used for the 8 pre-existing resolvers) with 3 new `it.each` blocks covering the 4 new resolvers this phase added: **DENY** (caller has no `UserMallAccess` row for the resolved mall → `ForbiddenException`), **ALLOW** (caller does have the row → resolves), **ADMIN/CEO/TENANT bypass** (no resolver lookup performed at all, matching `BYPASS_ROLES` semantics). 12 new tests, all passing.
- **Why resolver-level, not per-route e2e**: every Batch A route's authorization decision is a direct delegation to `assertMallAccess`/`extractAndValidateMallAccess` — there is no route-specific authorization logic to test beyond "is the right resolver/mallId wired to the right param." That wiring was verified by code review (see §5) and by `tsc --noEmit` (parameter/type correctness). No supertest/e2e harness exists elsewhere in this codebase to extend for true HTTP-level negative tests; building one from scratch was not authorized this phase and is flagged as a followup, not silently skipped.
- **Full regression**:
  - Backend (`npx jest`): **72/72 suites, 405/405 tests passing** (393 baseline + 12 new).
  - Frontend (`npx vitest run`): **28/29 files, 216/225 tests passing** — identical to baseline. The 9 failures are the pre-existing, unrelated `BookingsPage.test.tsx` "Xóa booking" timeout issue, unchanged by this phase.
  - `tsc --noEmit` (backend): clean, 0 errors.
  - `eslint` on every file touched this phase: clean, 0 errors/warnings.
  - `nest build`: clean, exit 0.
  - `git diff --check`: clean, 0 whitespace errors.

## 4. Adversarial review (bypass-attempt classification)

Reviewed every Batch A route for: (a) an alternate route reaching the same entity without the check, (b) a body/query field that could substitute a different ID than the one checked, (c) a body field letting a caller "move" an already-checked entity to a different Mall post-check, (d) a route alias or duplicate controller, (e) list/export endpoints doing post-filter instead of query-level scoping.

- **(a) Alternate route**: grepped for any other controller touching `servicePriceCatalog`, `mallAnnouncement`, `fitoutTask`, `fitoutDailyReportEntry` directly — none found. The 8 Batch A controllers are the sole HTTP entry points for these entities. **No finding.**
- **(b) ID substitution**: every ENFORCED route resolves its Mall from the same param/body field it uses for the underlying service call (e.g., `service-catalog.controller.ts` `updateItem` checks and updates the same `:id`; `sap.controller.ts` `syncCustomer` checks and syncs the same `body.tenantId`). No route accepts a second, unchecked identifier for the same operation. **No finding.**
- **(c) Post-check entity reassignment**: checked every mutation DTO in scope (`UpdateCatalogItemDto`, `UpdateGanttTaskDto`, the announcements update DTO) for a field that could reassign the entity to a different Mall/project after the check runs — none of the three include a `mallId`/`projectId` field. `createItem`/`create` (announcements) use the *same* `mallId` for both the check and the write, so there's no create-then-redirect vector either. **No finding.**
- **(d) Route alias**: none of the 8 controllers have a sibling/legacy controller serving overlapping paths (confirmed against the full 41-controller route inventory). **No finding.**
- **(e) List/export query-level scoping**: no Batch A route in this canary is a list/export endpoint — all 25 are single-entity read/write operations, so the "query-level not post-filter" requirement doesn't apply to this batch. The list/export routes that do exist in these controllers (`analytics` compliance-exports family, `announcements findAllAdmin`, all `sap` list routes) were deliberately left GAP/PENDING_BC and are **not** claimed as scoped — see §2.

**Result: 0 confirmed or plausible bypasses found** in the 25 routes enforced this phase.

## 5. File owner→Mall reachability verification (read-only, no code changed)

All 3 previously-unresolved chains confirmed reachable in a single hop, directly against `prisma/schema.prisma` (not inferred):
- `ParkingContractDocument.contractId → ParkingCustomerContract.mallId` (direct field, `schema.prisma:901-902`).
- `ServiceContractDocument.contractId → ServiceContract.mallId` (direct field, `schema.prisma:1650`).
- `WorkOrderEvidence.workOrderId → WorkOrder.mallId` (direct field, `schema.prisma:638-639`).

No schema migration required for any of the three. `docs/architecture-review/23-CR-101-FILE-OWNER-VERIFICATION.md` updated to close the "Unknown: 3" status to "Unknown: 0" and record the confirmed paths. **No resolver code was added to `mall-access.service.ts` and no route in `files.controller.ts` was changed** — these three document families remain `GAP`-status, explicitly deferred to a future batch that (per the pre-existing "Key finding" in that doc) will also need to build owner-entity/ownership-check machinery from scratch for these families, since today they have no per-record ownership check at all (not even tenant-based), unlike the Contract/Invoice/Fitout families.

## 6. Documentation updated
- `apps/backend/src/common/services/mall-resolver-registry.ts` — moved `servicePriceCatalog`, `fitoutGanttTask`, `fitoutDailyReportEntry`, `announcementMall` from `PLANNED_MALL_RESOLVERS` to `EXISTING_MALL_RESOLVERS` with `implementedAt` pointers.
- `docs/architecture-review/23-CR-101-FILE-OWNER-VERIFICATION.md` — closed the 3 unknown reachability items (§5 above).
- This document.

## 7. Git discipline
- No `git add -A` used at any point.
- All 90 modified/added files in the working tree — the Batch A edits plus all carried-forward prior-phase work — were confirmed **unstaged** via `git reset` (non-destructive; unstages only) before this report was written, specifically so the human reviewer sees one consistent unstaged diff rather than a mix of staged/unstaged state.
- No commit created. No RC4 created. RC3 (`c61fdb9`) remains the designated release candidate, unchanged.

## 8. Operational incident disclosed (transparency)

Mid-session, GitHub Desktop auto-stashed the entire working tree (`!!GitHub_Desktop<kyle>` stash, triggered by a branch switch outside this session) — this briefly made it appear that Phase 1/2's infrastructure files and roughly 130 files of prior-phase work had vanished from disk. Root-caused via `git reflog --all` and `git stash list` (not data loss, not caused by any command run in this session). Recovered via `git stash apply stash@{0}` (deliberately `apply`, not `pop`, leaving the stash as a fallback). Verified full recovery via `git status` and by confirming the restored `analytics.controller.ts` already contained 3 of the 5 Phase 3A edits in progress at the time — meaning effectively no implementation work was lost, only a few minutes of investigation time. Flagging this because it's a real event that happened during this work session, not because it affected the delivered result.

## 9. Stop conditions / scope boundaries respected
- Global fail-closed switch: **not touched**, `MallAccessGuard`'s existing heuristic fallback is untouched.
- CI merge blocking: **not added** — `route-scope-inventory.ts` remains a manually-run, non-blocking script.
- Role-policy / CEO permission model: **not touched** — `role-permissions.ts` untouched.
- Schema migration: **none** — every resolver added this phase reads existing fields (`ServicePriceCatalog.mallId`, `FitoutTask.project.unit.mallId`, `FitoutDailyReportEntry.project.unit.mallId`, `MallAnnouncement.mallId`), all already present and populated.
- Phase 3B/3C/3D/3E/3G: **not implemented**.
