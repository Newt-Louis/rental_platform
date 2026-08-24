# CR-101 Phase 3C — C1+C2 Completion Report

Status: **Implementation complete, unstaged, awaiting human review.** No commit made. RC3 remains designated; no RC4.

## 1. C1 — Resolver infrastructure

**Resolvers reused (0 new resolver code needed)**: `contract`, `invoice`, `ticket`, `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry`, `fitoutProject` — all 7 already registered in `MallAccessService`, already production-proven elsewhere in the codebase (Phases 1–3B). This was confirmed, not assumed, during the Phase 3C readiness review and re-confirmed correct during implementation.

**Resolvers added**: none. C1's actual deliverable, once the resolver-reuse fact was confirmed, was infrastructure `FilesController` itself lacked: injecting `MallAccessService` into its constructor (it had neither that dependency nor any `@CurrentUser`-driven Mall check before this batch).

**Registry integrity**: `mall-resolver-registry.spec.ts` (duplicate-name check + every `resolver:` string referenced by a `@Scope(...)` declaration across every controller must resolve to a registered name) — 2/2 tests pass. One design note: `documents/:fileId` is polymorphic (5 branches, 5 different resolvers chosen at runtime by `doc.entityType`), which can't be expressed as a single `resolver:` string in the `@Scope` decorator without breaking the registry's one-name-per-declaration convention — resolved by omitting the `resolution` field for that route and describing the branch-aware dispatch in `trackedAs` instead (`resolution` is optional per `scope.types.ts`).

**C1 Gate: PASS.**
- `npx jest src/common/services/mall-resolver-registry.spec.ts src/files/files.controller.spec.ts` — 2 suites, 38 tests, all pass.
- `tsc --noEmit` — 0 errors.
- No existing resolver's behavior changed (regression-only for `mall-access.service.spec.ts`, unchanged, not re-touched this batch).
- No existing authorization behavior changed unexpectedly — verified via the full backend suite (§7 below) and the specific compatibility check in §6.

Per Section 8's instruction, C1 passing gated the continuation into C2 below.

## 2. C2 — Download authorization

**Families remediated**: Contract file (`ContractFile`), Invoice document, Ticket photo, Fitout Submittal attachment, Fitout Issue photo, Fitout Daily Report photo (all 5 as `UnifiedDocument` branches), Fitout project document (`FitoutDocument`) — the exact 7 families authorized (Contract/Invoice/Ticket/approved Fitout `UnifiedDocument` branches).

**Routes**: `GET /api/files/contracts/:fileId`, `GET /api/files/documents/:fileId` (5 branches), `GET /api/files/fitout-documents/:fileId` — 3 routes, 7 authorization paths total.

**Pattern applied to every route** (the "File First" invariant, Section 3): fetch the file record by its own `fileId` → read the owner reference already present ON that fetched record (`file.contractId`, `doc.entityId`, `doc.projectId`) → call `MallAccessService.extractAndValidateMallAccess()` with that server-derived id → only then stream. No route accepts or trusts any client-supplied parent/owner identifier — there is none in any of these 3 routes' request shape (no query/body field for contractId/entityId/projectId exists at all; the only client input is the `fileId` path param itself).

**Cross-Mall protection**: RESOLVED for all 7 families. A DENY from `MallAccessService` now throws `ForbiddenException` before `stream()` is ever called — verified by test (§5).

**Cross-Tenant protection**: PRESERVED, not replaced. Every pre-existing tenant-ownership check (`Contract.tenantId`, `Invoice.tenantId`, `Ticket.tenantId`, `FitoutProject.tenantId`) is unchanged, still runs, and the new Mall check is strictly additive — added as a further condition after the existing tenant/role checks in each branch, never in place of them.

**UnifiedDocument branches**: each of the 5 `entityType` cases resolves via its own distinct, correct resolver (`invoiceId`/`ticketId`/`fitoutSubmittalId`/`fitoutIssueId`/`fitoutDailyReportEntryId`) — the `switch (doc.entityType)` dispatch is server-controlled (read from the DB row, never client-supplied), so there is no way for a caller to select a different branch's (weaker or stronger) resolver than the one matching the document's actual, stored type. The pre-existing `default: throw NotFoundException` for an unrecognized `entityType` is unchanged — fail-safe, not fail-open.

**ID substitution**: not applicable to these 3 routes as a distinct new test category — none of them accept a parent/owner id from the client at all (see "File First" pattern above), so there is no substitutable secondary identifier to test against. This is a structural property of the routes, not an untested gap: the "forged parent ID" scenario the authorization mandates a test for is the exact pattern `fitout.controller.ts`'s `reviewDocument` has (client supplies both a project id AND a doc id, only the first is checked) — that route is C4, not touched this batch, and remains an open, tracked finding.

## 3. Read-only data reconciliation (Section 19)

Ran against the dev database (`leasing_platform`, the same instance used throughout this program). **Result: CLEAN — but with a strong caveat, stated plainly rather than overclaimed**: every C2-relevant table (`ContractFile`, `UnifiedDocument` — all 5 entityTypes, `FitoutDocument`) currently contains **0 rows** in this dev environment. Every orphan/mismatch check (file→owner FK existence, `UnifiedDocument.mallId` vs. resolved-chain mismatch where set) correctly returned 0, but an empty table cannot meaningfully demonstrate the absence of a real-world data-integrity problem — this "CLEAN" result is honest but weak evidence, structurally identical to Phase 3B's single-Mall-dataset caveat. **Classification: CLEAN (0 rows, not meaningfully exercised)**, not `DIRTY-AMBIGUOUS` — nothing dirty was found, so no stop condition was triggered, but this should be re-run once these tables have real UAT/production data before being treated as conclusive.

## 4. Tests added

- `files.controller.spec.ts` — 10 new tests in a "Mall access (CR-101 Phase 3C C2)" block: one per family proving the route calls `extractAndValidateMallAccess` with the correct server-derived id and that a DENY blocks the stream (`storage.getFileStream` never called); a same-Mall-ALLOW regression test; an ADMIN-bypass-still-streams test; and an explicit "Parking/etc. unchanged, no accidental Mall check added" test proving C3's families were not touched.
- Every pre-existing test in the same file (27 tests covering tenant/role logic across all 8 families) updated only mechanically — added `id: 'u1'` to mock user objects (now read by the new Mall check) and a default-ALLOW `mallAccess` mock in `beforeEach` — and re-verified to assert the exact same outcomes as before. No pre-existing test's expected behavior was changed.
- Underlying resolver correctness (DENY-on-cross-Mall, ALLOW-on-same-Mall, bypass-role-skips-check) for all 7 resolvers reused is unchanged, regression-covered by the existing `mall-access.service.spec.ts` suite (not re-touched, not re-tested — it wasn't modified this batch, so re-running it is pure regression, covered in §7's full suite run).

## 5. Controller-level security evidence (Section 18)

Every one of the 10 new tests in §4 is a controller-level (not just resolver-unit-level) test: it constructs a real `FilesController` instance, calls the actual route handler method, and asserts on the actual thrown exception / actual call arguments to the injected `MallAccessService` mock. This directly proves the vulnerability class being remediated — "valid authentication + valid role + wrong Mall = DENY" — at the layer where the real HTTP request would be rejected, not merely that the underlying resolver function is correct in isolation.

## 6. Compatibility

**Response schema, filename, content type, stream behavior, download behavior, and existing legitimate Tenant behavior are all unchanged** — verified by the fact that every pre-existing test in `files.controller.spec.ts` (§4) still passes with its original assertions untouched. Only the previously-untested cross-Mall-staff scenario's outcome changes (ALLOW → DENY), which is precisely the fix being authorized.

## 7. Regression

- Backend (`npx jest`): **75/75 suites, 456/456 tests passing** (446 Phase-3B.1-baseline + 10 new this batch).
- Frontend (`npx vitest run`): **28/29 files, 216/225 tests** — identical to the established baseline. **The 9 failures are the pre-existing, unrelated `BookingsPage.test.tsx` "Xóa booking" timeout issue** — reported here separately per the authorization's instruction, not described as a regression; this batch touched zero frontend files.
- `tsc --noEmit` (backend): clean, 0 errors.
- `tsc --noEmit` (frontend): clean, 0 errors.
- `eslint` on every file touched this batch: clean, 0 errors/warnings.
- `nest build`: clean, exit 0.
- `vite build`: not re-run separately this batch (no frontend file was touched; frontend `tsc --noEmit` and the full frontend test suite are the meaningful regression signal for zero-frontend-change work — `vite build`'s only additional signal beyond `tsc` is bundler-level, and nothing bundler-relevant changed).
- `git diff --check`: clean, 0 whitespace errors.

## 8. Adversarial review

Attempted every category from the authorization's Section 20 against the post-C1+C2 code:

- **C1/C2 BYPASS** (found, now fixed as part of this very batch — listed for completeness, not a residual finding): the original cross-Mall gap on all 7 families — this is the thing C2 fixed, confirmed closed by the DENY-path tests in §4.
- **fileId substitution**: NOT APPLICABLE — every route is keyed by the requested resource's own primary key; there is no second, substitutable file reference anywhere in these 3 routes.
- **parentId substitution**: NOT APPLICABLE to C2's routes (structural — no client-supplied parent id exists in any of the 3 routes' request shape, per §2). **C4** (confirmed, unaddressed, unchanged from the readiness review): `fitout.controller.ts`'s `reviewDocument`.
- **cross-Mall IDOR**: C1/C2 BYPASS category, now closed for these 7 families; **C3** for the remaining 5 (Parking/ServiceContract/WorkOrder/Patrol/Maintenance), confirmed still open, confirmed untouched this batch (the dedicated regression test in §4 proves no accidental change).
- **cross-Tenant IDOR**: PROTECTED, unchanged — re-verified via the untouched, still-passing tenant-check tests.
- **role-only access**: PROTECTED for the 7 C2 families (role checks preserved, Mall check now additionally required); still the known, open **C3** gap for the other 5.
- **wrong UnifiedDocument branch**: PROTECTED — `entityType` dispatch is server-controlled, not client-influenceable (§2).
- **alternate download endpoint**: FALSE POSITIVE, re-confirmed closed — no code in the storage/static-mount layer was touched this batch; the readiness review's finding (no bypass exists) stands unchanged.
- **preview bypass**: NOT APPLICABLE — no separate preview endpoint exists for any C2 family, unchanged from the readiness review.
- **direct static path**: PROTECTED, unchanged — not touched this batch.
- **malformed ownership**: PROTECTED — not a new scenario; the pre-existing `NotFoundException` paths (missing file record, missing owner entity) fire before the Mall check is ever reached, for every role including ADMIN, unchanged by this batch.
- **ADMIN integrity bypass**: PROTECTED, explicitly tested (§4's ADMIN-bypass test) — `MallAccessService`'s `BYPASS_ROLES` bypass only ever affects whether the *Mall* dimension is checked; it is invoked strictly after the file/owner existence and tenant/role checks already ran and passed, so ADMIN cannot use the Mall bypass to reach a file that fails those earlier, unconditional integrity checks.

**No findings requiring action outside C1/C2's authorized scope were silently fixed.** C3 and C4 items are recorded, not touched.

## 9. Confirmed remaining C3 (unchanged, not authorized this batch)

Parking (`ParkingContractDocument`), Service Contract (`ServiceContractDocument`), Work Order (`WorkOrderEvidence`), Patrol (`PatrolCheck`) — all 4 still role-only, no Mall check, on their `files.controller.ts` download routes. `patrol-checks/:fileId` remains the single most precisely-confirmed, smallest fix in the whole program (the existing `checkMallId()` helper is not called) — explicitly not pulled forward this batch, per the authorization's exact scope list.

## 10. Confirmed remaining C4 (unchanged, not authorized this batch)

`fitout.controller.ts`'s `reviewDocument` — `docId` still not verified against the already-Mall-checked project id. `fitout-issue.controller.ts` — still protected only incidentally by the global `MallAccessGuard`'s path-substring heuristic, no explicit `MallAccessService` call added.

## 11. Known P0/P1 after C2

- **P0**: none (none were found before this batch either — no unauthenticated access, no cross-Tenant IDOR).
- **P1**: the C3 families (Parking/ServiceContract/WorkOrder/Patrol/Maintenance) and the C4 `reviewDocument` bug — same severity classification as before this batch, now a smaller, more precisely bounded remaining set (7 of the original 12 `files.controller.ts` gap-rows are closed).

## 12. Application files changed

`apps/backend/src/files/files.controller.ts` (constructor injection + 3 route handlers), `apps/backend/src/files/files.controller.spec.ts` (10 new tests + mechanical updates to existing tests' fixtures/mocks). No other application file touched.

## 13. Git discipline

No `git add -A`. All 102 working-tree entries (this batch's edits plus everything carried forward from every prior phase) confirmed **unstaged** (`git diff --cached` empty) before this report was written. No commit created. No RC4. RC3 (`c61fdb9`) unchanged. HEAD unchanged (`915c96e4b90c8002c238f731a90bd86cc90f4114`).
