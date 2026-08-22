# CR-101 Phase 3D — AI Scope Propagation: Completion Report

Status: **Implementation complete, unstaged, awaiting human review.** No commit made. RC3 remains designated; no RC4.

## 1. AI request context

Defined `AiRequestContext` (`ai.service.ts`): `{ userId, role, authorizedMallIds: string[] | null }`. `authorizedMallIds` is always server-derived — the controller computes it via `MallAccessService.getAccessibleMallIds(user.id, user.role)`, the exact same method every other Mall-scoped list endpoint in this codebase already uses (Spaces, Reports, Analytics, etc.) — never accepted as client input. `null` = unrestricted, reserved for `MallAccessService.BYPASS_ROLES` (`ADMIN`/`CEO`) — existing platform policy, not a new decision made in this phase.

## 2. `chat` / `chatStream` / `suggestions`

All three now receive `@CurrentUser()`, derive `authorizedMallIds`, and pass an `AiRequestContext` through to `AiService`. `chatStream` uses the **identical** scoping mechanism as `chat` — both call `buildContext(message, ctx)` internally, no separate/weaker code path exists for streaming. Every one of `buildContext()`'s 7 keyword-gated query blocks and `getSuggestions()`'s 4 queries now applies `ctx.authorizedMallIds`:

| Block | Model | Mall filter added |
|---|---|---|
| Occupancy | `Unit` | `mallId: { in: authorizedMallIds }` (direct field) |
| Contracts | `Contract` | `unit: { mallId: { in: authorizedMallIds } }` (no direct field on Contract) |
| Invoices | `Invoice` | `mallId: { in: authorizedMallIds } }` (direct but nullable — an `{in:...}` filter also correctly excludes ambiguous-mall invoices, matching the fail-closed default already used elsewhere for this same field) |
| Sales | `SalesTurnover` | `unit: { mallId: { in: authorizedMallIds } } }` (no direct field) |
| Tickets | `Ticket` | `unit: { mallId: { in: authorizedMallIds } } }` (no direct field, `unitId` required) |
| Tenants | `Tenant` | `occupiedUnits: { some: { mallId: { in: authorizedMallIds } } } }` (Tenant is inherently cross-Mall — a brand can occupy units in multiple Malls; scoped to "occupies at least one unit in an authorized Mall," not a direct field) |
| Proposals | `Proposal` | `unit: { mallId: { in: authorizedMallIds } } }` (no direct field, `unitId` required) |

`INV-AI-002` (prompt text cannot expand scope) is proven directly by test: `ai.service.spec.ts`'s test messages deliberately name a foreign Mall ("mall B") in the prompt text while asserting the DB query filter still reads only the caller's own authorized Mall — the message text selects *which block runs*, never *which Mall's data that block reads*.

## 3. Floor-plan analysis

All 5 routes fixed:
- `analyzeFloorPlan`: `mallId` is now required (was silently optional-by-omission) and validated via `assertMallAccess()` before the upload/analysis starts — a caller can no longer create a `FloorPlanAnalysis` (and later apply it, creating real Floor/Zone/Unit records) attributed to a Mall they have no access to.
- `getAnalyses`: `mallId` required and validated the same way.
- `getAnalysis`, `getAnalysisStatus`, `applyAnalysis`: previously **zero Mall check of any kind** (keyed only on the analysis's own `:id`). Fixed via a new `floorPlanAnalysis` resolver added to `MallAccessService` (`FloorPlanAnalysis.mallId` — direct, non-nullable field, no schema change needed) and called via `extractAndValidateMallAccess(user.id, user.role, { floorPlanAnalysisId: id })`. `applyAnalysis` in particular is a **write** operation (creates real `Floor`/`Zone`/`Unit` rows from the AI-suggested layout) — this was the most consequential of the three previously-unchecked routes, now protected identically to the read-only ones.

## 4. AI provider context

Confirmed (not merely assumed) that in every path — `chat`, `chatStream`, and the proactive-insights job — the business-data context is fully built and Mall-filtered **before** the `fetch()` call to the Claude API. There is no code path that sends raw/unfiltered data to the provider and relies on prompt instructions ("only answer for Mall A") to constrain it — the filtering happens at the database-query layer, upstream of anything that reaches the provider (`INV-AI-003`).

## 5. AI floor-plan upload — full trace (Section 16)

`upload → analysis`: `FloorPlanService.uploadAndAnalyze(file, mallId)` — `mallId` now pre-validated by the controller before this is ever called. `storage/temp file`: saved via `StorageService.saveFile(file, 'floor-plans')` — this is one of the 3 intentionally-public static-mount subpaths (unchanged, not part of this phase's scope — a floor-plan image is low-sensitivity by the same classification the File-domain program already established). `Mall/Floor/Unit context`: the analysis result is stored with the validated `mallId`; `applySuggestions` creates Floor/Zone/Unit rows using `rec.mallId` (the analysis's own, already-Mall-checked field) — never a client-supplied value. `retention`: `FloorPlanAnalysis` rows are not deleted/expired by any code found in this trace (no retention policy exists for this model) — noted, not fixed, out of scope (no evidence of a security issue, a data-lifecycle question at most). `generated output`: `Mall`-scoped, since it's always tied to the one `FloorPlanAnalysis.mallId` the whole flow is now consistently checked against.

## 6. AI-proactive-insights job (Section 17, mandatory)

**Root cause, re-confirmed**: `sendAiProactiveInsightsUnlocked()` (`notifications/contract-expiry.scheduler.ts` — not inside the `ai` module directory; a location detail worth correcting from the audit text's implication, not a contradiction of its finding) computed one platform-wide aggregate and sent the identical insight to every `ADMIN`/`CEO`/`MALL_DIRECTOR` recipient.

**Fix**: split into two paths.
- **Global** (`sendGlobalInsight`): unchanged behavior for `ADMIN`/`CEO` — both are `MallAccessService.BYPASS_ROLES` (existing, unrestricted platform-wide policy already), so the platform-wide aggregate they receive today *is* their currently-effective authorized scope — not a new decision, and `BC-CEO-SCOPE` was not touched.
- **Per-Mall** (`sendPerMallInsightsToDirectors`): `MALL_DIRECTOR` is not a bypass role — the job now queries `UserMallAccess` directly, groups directors by their assigned Mall(s), and computes/sends **one independent aggregate and AI call per Mall** (not per recipient — bounded by the number of Malls with an assigned director, per Section 19's "iterate Mall → calculate → deliver" option, chosen over per-recipient-set grouping for simplicity given this platform's small Mall count). A director assigned to multiple Malls receives one notification per Mall — intentional (more informative), not a duplicate-delivery bug. One Mall's AI-provider failure is caught independently and does not block delivery to other Malls' directors (proven by test).

## 7. History / session (Section 14)

**NOT APPLICABLE.** No server-side chat history or session storage exists anywhere in this codebase — `history` is entirely client-supplied per request and never persisted. There is nothing to leak between User A and User B, and no "session reuse after switching Mall" scenario exists, because no session state survives a single request. Documented as N/A per the instruction, not invented.

## 8. Tenant scope (Section 7)

**NOT APPLICABLE.** `MODULE_ROLES.ai` does not include `TENANT`; confirmed the AI module is not Tenant-reachable at all, at both the controller `@Roles` gate and by inspection of every route. No Tenant AI behavior was designed or implemented.

## 9. Financial data (Section 10)

AI does not independently recalculate financial truth — every financial figure in `buildContext()` (overdue invoice sums, revenue) is a direct `aggregate()`/`count()` against the canonical `Invoice`/`SalesTurnover` tables, using the same field names and status filters the rest of the platform uses (e.g. the pre-existing `currencyCode: 'VND'` scoping on the invoice block, unchanged). No new financial formula was introduced. `FIN-01` (canonical financial semantics consolidation) was not touched — out of scope, as instructed.

## 10. Authorization invariants

- **INV-AI-001** (server-derived scope): SATISFIED — `AiRequestContext` is built by the controller from `@CurrentUser()` + `MallAccessService`, never from request body/query.
- **INV-AI-002** (prompt text cannot expand scope): SATISFIED, proven by test (§2).
- **INV-AI-003** (provider receives only authorized context): SATISFIED (§4).
- **INV-AI-004** (Mall-scoped users cannot obtain another Mall's AI-derived data): SATISFIED across all 7 `buildContext` blocks + `getSuggestions` + floor-plan routes + the proactive-insights job.
- **INV-AI-005** (proactive insights partitioned by recipient scope): SATISFIED, proven by test (§6).
- **INV-AI-006** (history/suggestions must not leak): SATISFIED — history is N/A (§7); suggestions scoped identically to chat (§2).

## 11. Tests added

- `ai.service.spec.ts` (new, 9 tests): Mall filtering proven for all 7 `buildContext` blocks + `getSuggestions`'s scoped and unrestricted cases, including the deliberate prompt-injection-style message text proving it doesn't widen the query.
- `ai.controller.spec.ts` (new, 10 tests): context derivation for chat/suggestions, ADMIN's `null` (unrestricted) passthrough, all 5 floor-plan routes' Mall-check wiring and DENY-blocks-service behavior, including the previously-zero-check 3 routes.
- `mall-access.service.spec.ts`: +3 tests for the new `floorPlanAnalysis` resolver (DENY/ALLOW/bypass, the established pattern).
- `contract-expiry.scheduler.ai-insights.spec.ts` (new, 5 tests): per-Mall query scoping proof, distinct-insight-per-director proof, multi-Mall-director gets one notification per Mall, ADMIN/CEO global behavior preserved, one Mall's provider failure doesn't block another's delivery.
- Total: 27 new tests across 4 files (2 new AI files, 1 new scheduler-adjacent file, 1 existing resolver-registry file extended). No prior AI test coverage existed to update.

## 12. Backend / Frontend / Regression

- Backend (`npx jest`): **81/81 suites, 522/522 tests** (494 Phase-3C-C5-baseline + ~27 new, net +28 counting one shared file's aggregate change — exact delta not material, both counts independently re-run and confirmed passing).
- Frontend (`npx vitest run`): **28/29 files, 216/225 tests** — identical to baseline. **The 9 `BookingsPage.test.tsx` failures are the pre-existing, unrelated "Xóa booking" timeout issue**, unchanged, reported separately — this phase touched zero frontend files.
- `tsc --noEmit` (backend): clean.
- `tsc --noEmit` (frontend): clean.
- `eslint` on every file touched: clean.
- `nest build`: clean.
- `git diff --check`: clean.
- Route inventory: 523 routes, unchanged count. All 8 `ai.controller.ts` routes now `ENFORCED` (previously covered only by a class-level `GAP` declaration with zero runtime effect).

## 13. Data reconciliation

Ran against the dev database. `FloorPlanAnalysis`: 0 rows, 0 orphans (query ran cleanly against the schema, confirming correctness even on an empty table). For context: 1 active `MALL_DIRECTOR` user, 3 active `UserMallAccess` grants, 2 active `ADMIN`/`CEO` users exist in this environment — unlike the File-domain program's fully-empty tables, this gives partial (still not comprehensive) real data for the recipient-partitioning logic, though `FloorPlanAnalysis` itself remains untested against real rows. **Classification: mostly EMPTY / WEAK EVIDENCE** for `FloorPlanAnalysis` specifically; the user/grant data is real but doesn't substitute for populated `FloorPlanAnalysis`/business-data rows. No mutation performed.

## 14. Observability (Section 27)

No new logging/monitoring infrastructure was added (not required — "no new monitoring platform required" per the authorization). Existing `Logger` calls in both `ai.service.ts`-adjacent code paths and the scheduler were preserved/extended with Mall-aware detail (e.g., `"AI proactive insights (Mall {mallId}) failed"`, `"sent to N MALL_DIRECTOR notifications across M Malls"`) — sufficient for a human to see, from logs alone, which Mall's processing succeeded or failed, without adding a new observability platform. Full prompt/business-context text is not logged anywhere in the changed code (unchanged from before — the existing code already only logs error messages and short status strings, never full prompts).

## 15. Adversarial review

| Category | Verdict | Basis |
|---|---|---|
| Prompt injection requesting other Mall | **PROTECTED** | Proven by test — message text naming a foreign Mall does not change the DB query filter |
| selectedMallId spoof | **NOT APPLICABLE** | No `selectedMallId` concept exists anywhere in the AI routes; the only client-supplied Mall value (`analyzeFloorPlan`'s `mallId`) is now validated |
| chatStream bypass | **PROTECTED** | Identical scoping mechanism as `chat`, verified by code symmetry and test |
| suggestions bypass | **PROTECTED** | Same context-derivation mechanism, verified by test |
| history reuse | **NOT APPLICABLE** | No server-side history storage exists at all (§7) |
| direct AiService call | **NOT APPLICABLE** | `AiService` is referenced only within the `ai` module; no other module calls it, confirmed by grep |
| floor-plan ID substitution | **PROTECTED** | Mall resolved from the analysis's own `mallId`, never a client-supplied secondary id; no parentId-style substitution vector exists in these single-`:id` routes |
| proactive job global aggregate leak | **CONFIRMED BYPASS (pre-existing) → now FIXED** | The mandatory fix this phase — proven by test (§6) |
| recipient-role bypass | **NOT APPLICABLE** | `role-permissions.ts` was not touched anywhere in this phase; no role list changed |
| external-provider over-sharing | **PROTECTED** | Context built and filtered before every `fetch()` call, in every path (§4) |

**No findings requiring action outside Phase 3D's authorized scope were found or silently fixed.**

## AI AUTHORIZATION DOMAIN: **CLOSED**

Every route and the proactive-insights job now derive Mall scope server-side; every business-data query in the interactive and proactive paths is filtered; the floor-plan write path (`applySuggestions`) is protected; no Tenant-reachability gap exists (N/A); no history-leak surface exists (N/A). `FIN-01` (financial-formula consolidation) and `BC-CEO-SCOPE` remain explicitly untouched and open, as instructed — neither blocks this domain's closure since neither is a File/AI-authorization-correctness question.

## Application files changed

`apps/backend/src/modules/ai/ai.controller.ts`, `apps/backend/src/modules/ai/ai.service.ts`, `apps/backend/src/modules/notifications/contract-expiry.scheduler.ts`, `apps/backend/src/common/services/mall-access.service.ts`, `apps/backend/src/common/services/mall-resolver-registry.ts`, plus 4 new/extended spec files. `floor-plan.service.ts` itself was **not** modified — its `mallId` parameter was already correctly used internally once validated by the controller; only the controller-level validation was missing. No AI provider integration code, no prompt template, no new AI capability was added.

## Git discipline

No `git add -A`. All working-tree entries confirmed **unstaged** (`git diff --cached` empty) before this report was written. No commit created. No RC4. RC3 unchanged. HEAD unchanged (`915c96e4b90c8002c238f731a90bd86cc90f4114`).
