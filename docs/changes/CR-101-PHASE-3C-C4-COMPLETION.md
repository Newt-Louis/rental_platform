# CR-101 Phase 3C — C4 Completion Report

Status: **Implementation complete, unstaged, awaiting human review.** No commit made. RC3 remains designated; no RC4.

## C4-01 — `fitout.controller.ts` `reviewDocument` (P1)

**Root cause** (re-confirmed against executable code, not assumed from prior docs): `FitoutDocumentsService.reviewDocument(documentId, decision, reviewNote, reviewedById)` looked up the document by `prisma.fitoutDocument.findUnique({ where: { id: documentId } })` — no `projectId` parameter existed anywhere in the method, so the controller's already-Mall-checked `id` (the project) was never connected to the child lookup at all.

**Parent-child invariant**: `Document.projectId === authorizedProjectId`, enforced via `findFirst({ where: { id: documentId, projectId } })`. `FitoutDocument.projectId` (`schema.prisma:2638`) confirmed as the correct, direct scalar field — no discrepancy from the readiness review's shorthand.

**ID substitution**: FIXED. A `docId` belonging to a different project than the one authorized in the path can no longer be acted on — the compound `findFirst` returns nothing for a mismatched pair, and the route surfaces the same `NotFoundException` it already threw for a genuinely missing document (no new error type, no API contract change).

**Same-Mall cross-project**: FIXED — proven by a dedicated test (Document B / Project B, same Mall A as the authorized Project A → DENY, no update performed).

**Cross-Mall**: FIXED at the same layer — a document from a different Mall's project is structurally the same "wrong projectId" case to this fix; the Mall dimension itself is enforced one layer up by the unchanged, already-correct `validateProject()`/`fitoutProject` resolver.

**ADMIN integrity**: PROTECTED, explicitly tested. `MallAccessService`'s bypass for ADMIN only ever affects whether the *Mall* check runs — it never substitutes a different `projectId` into the service call. The controller always passes the real, requested `id` through unchanged, so ADMIN cannot make `Document B ∉ Project A` become a valid relationship merely by holding a bypass role; the service's own `findFirst({id, projectId})` is unconditional, independent of caller role.

## C4-02 — `fitout-issue.controller.ts` (P2)

**Routes investigated**: all 9 (`list`, `create`, `getOne`, `update`, `transition`, `listComments`, `addComment`, `listPhotos`, `uploadPhoto`) — the complete controller, not just the photo routes the readiness review's shorthand cited.

**Classification of each route's prior protection** (re-derived from `mall-access.guard.ts`'s actual heuristic, not assumed): `list`/`create` — **INCIDENTALLY PROTECTED** via `query.projectId`/`body.projectId` matching the guard's `fitoutProjectId` field (a different mechanism than the other 7 routes, though the same root cause: no explicit call). The other 7 (`:id`-keyed) — **INCIDENTALLY PROTECTED** via the path containing the substring `fitout-issue`, matching the guard's `fitoutIssueId` field. **None were GAP** (truly unprotected) or N/A — all 9 shared the identical underlying defect (zero explicit `MallAccessService` calls), just reached the guard's heuristic through two different paths. This is recorded as a minor correction to the readiness review's single-mechanism framing, not a scope expansion — remediating "every route sharing the confirmed root cause," as instructed, covers exactly these 9, matching what was predicted.

**Routes remediated**: all 9.

**Explicit Mall enforcement**: every route now calls `MallAccessService.extractAndValidateMallAccess()` directly — `list`/`create` via the registered `fitoutProject` resolver (keyed on the request's own `projectId`), the other 7 via the registered `fitoutIssue` resolver (keyed on the route's own `:id`). No new resolver logic — both resolvers already existed and are already production-proven elsewhere (Phases 1–3B, and C2's `documents/:fileId` FITOUT_ISSUE branch).

**Cross-Mall**: RESOLVED for all 9 — proven by test (a DENY blocks every route before the service is called).

**Cross-Tenant**: N/A — `Role.TENANT` is not in `MODULE_ROLES.fitout` and has no route-level override in this controller; confirmed unreachable by tenant users, unchanged from before this batch. Nothing to preserve or weaken.

**Resolvers reused**: `fitoutProject`, `fitoutIssue` — both pre-existing, zero new resolver code for C4-02.
**Resolvers added**: none for C4-02 (C4-01 required none either — the fix is a service-layer query change, not a new Mall resolver).

## Data reconciliation (Section 19)

Ran against the dev database. **Result: EMPTY / WEAK EVIDENCE** — `FitoutDocument` and `FitoutIssue` both contain **0 rows** in this dev environment, same as every prior C-batch this phase. Stated plainly: an empty dataset cannot validate anything about real-world orphan/mismatch behavior; it is not treated as meaningful production validation.

## Tests added

- `fitout-documents.service.spec.ts` (new file, 5 tests): the mandatory parent-child substitution matrix — ALLOW (same project), DENY (same-Mall cross-project), DENY (cross-Mall via a different project), safe-failure unknown docId, safe-failure unknown projectId.
- `fitout.controller.review-document.spec.ts` (new file, 3 tests): controller-level evidence — the route calls the service with *both* `docId` and the authorized `projectId` (not `docId` alone); a Mall DENY blocks the operation before the service is ever called; ADMIN's Mall bypass does not change what `projectId` gets passed to the service (so it cannot weaken the parent-child check).
- `fitout-issue.controller.spec.ts` (new file, 11 tests): the full 9-route DENY matrix (`it.each`, one entry per route, proving each calls the correct resolver with the correct source and blocks the service on denial) + same-Mall-ALLOW regression + ADMIN-bypass-still-works.
- Total: 19 new tests across 3 new files (no existing test file needed modification — this route pair had no prior test coverage).

## Backend / Frontend / Regression

- Backend (`npx jest`): **78/78 suites, 494/494 tests** (475 C3-final + 19 new).
- Frontend (`npx vitest run`): **28/29 files, 216/225 tests** — identical to baseline. **The 9 `BookingsPage.test.tsx` failures are the pre-existing, unrelated "Xóa booking" timeout issue**, unchanged, reported separately — this batch touched zero frontend files.
- `tsc --noEmit` (backend): clean.
- `tsc --noEmit` (frontend): clean.
- `eslint` on every file touched: clean.
- `nest build`: clean.
- `vite build`: clean (pre-existing chunk-size warning only, unrelated).
- `git diff --check`: clean.
- Route inventory re-run: all 9 `fitout-issue.controller.ts` routes and `fitout.controller.ts`'s `reviewDocument` confirmed `ENFORCED`.

## Adversarial review

- **parentId substitution / docId substitution**: CONFIRMED BYPASS (before this batch) → now PROTECTED, proven by test (the exact thing C4-01 fixed).
- **same-Mall cross-project substitution**: PROTECTED, proven by test.
- **cross-Mall substitution**: PROTECTED (same fix layer catches it).
- **wrong Fitout document type**: NOT APPLICABLE — `reviewDocument` operates on a single, non-polymorphic model (`FitoutDocument`); no `entityType` dispatch exists to confuse.
- **unknown document / unknown project**: PROTECTED — both surface the pre-existing `NotFoundException`, proven by test.
- **role-only bypass**: NOT APPLICABLE to C4-01 (role gating was never the defect here). PROTECTED for C4-02 (role checks were already correct; the fix adds the Mall dimension without touching role gates).
- **ADMIN integrity bypass**: PROTECTED, explicitly tested for both C4-01 and C4-02 — ADMIN's Mall-check bypass never substitutes or weakens the parent-child/entity data itself.
- **alternate Fitout endpoint**: FALSE POSITIVE — grepped the entire backend for other callers of `FitoutDocumentsService.reviewDocument()`; exactly one caller exists, the one route already fixed.
- **Fitout-Issue route bypass**: PROTECTED — `fitout.controller.ts`'s own `getDMap` route also uses `FitoutIssueService` but operates on the already-Mall-checked project id directly (via `issueService.getDMap(id)`, `id` being the project), not on an issue id — not a bypass of the 9 newly-protected routes, a different, already-correctly-scoped access pattern.
- **direct file route**: NOT APPLICABLE to C4 — covered by C2's `files.controller.ts` FITOUT_ISSUE branch, unchanged, consistent with this batch's fix (both now key off the same `fitoutIssue` resolver).
- **module-native vs FilesController inconsistency**: PROTECTED, verified consistent — `fitout-issue.controller.ts`'s `uploadPhoto`/`listPhotos` and `files.controller.ts`'s FITOUT_ISSUE branch both now resolve via the identical `fitoutIssue` resolver.

**No findings requiring action outside C4's authorized scope were found or silently fixed.**

## File-domain status (per the authorization — C5 is the only step that may declare the domain closed)

- **Table A**: 12/12 CLOSED (unchanged from C3).
- **C4 findings total**: 2.
- **C4 resolved**: 2/2.
- **Remaining**: 0 known findings in Table A or Table B.
- **Known P0**: 0.
- **Known P1**: 0 (C4-01 was the last one; now resolved).
- **Known P2**: 0 in File-domain scope (the previously-noted `ai.controller.ts` unguarded analysis routes remain out of scope — Phase 3D, unrelated to the Files C-series).
- **Unknown**: 0.

**This report does not declare the File Authorization domain closed** — per the authorization's explicit instruction, that determination is reserved for C5.

## Application files changed

`apps/backend/src/modules/fitout/fitout-documents.service.ts`, `apps/backend/src/modules/fitout/fitout.controller.ts`, `apps/backend/src/modules/fitout/fitout-issue.controller.ts`, plus 3 new spec files (`fitout-documents.service.spec.ts`, `fitout.controller.review-document.spec.ts`, `fitout-issue.controller.spec.ts`). No other application file touched. No Fitout state-machine, transaction-boundary, or business-logic code modified — only the authorization/ownership-scoping layer, per the explicit instruction not to refactor unrelated Fitout functionality.

## Git discipline

No `git add -A`. All working-tree entries (this batch's edits plus everything carried forward) confirmed **unstaged** (`git diff --cached` empty) before this report was written. No commit created. No RC4. RC3 (`c61fdb9`) unchanged. HEAD unchanged (`915c96e4b90c8002c238f731a90bd86cc90f4114`).
