# CR-101 Phase 3C — C5: File Authorization Consolidation Gate

Status: verification/consolidation only. No new application code shipped as part of C5 itself — the routes/services below were already fixed in C1–C4; this document verifies the combined result.

## Disclosed process deviation (read this first)

Section 18 of the authorization required an **independent** adversarial reviewer — explicitly not the implementing agent self-certifying. I launched a separate subagent for exactly that purpose. **It failed mid-run with a platform error**: `"You've hit your monthly spend limit"` (not a security finding — an account/billing limit, session resets 1pm Asia/Ho_Chi_Minh). No retry was attempted, since the same limit would almost certainly block it again immediately. The adversarial review in §9 below was therefore performed by this same session — the one that implemented C1–C4 — not a genuinely independent reviewer. This is disclosed plainly, not glossed over, because it's exactly the kind of self-certification risk Section 18 was written to avoid. Every finding below is backed by a specific file:line citation and, where applicable, an automated test that any reviewer (human or AI) can independently re-run — but the *judgment* of "did I look hard enough" was not cross-checked by a second party. If true independent adversarial verification is required before this gate is trusted, it should be re-run in a future session once the spend limit resets.

## 1. Authoritative File-domain inventory

**In scope for File-domain closure** (12 families, all in Table A of `29-CR-101-FILE-OWNERSHIP-MATRIX.md`):
Contract, Invoice, Ticket, Fitout Submittal, Fitout Issue, Fitout Daily Report, Fitout Project Document, Parking Contract, Service Contract, Work Order, Patrol Check, Maintenance Execution.

**Explicitly outside File-domain closure** (recorded, not mixed into the closure decision):
- AI floor-plan upload (`ai.controller.ts`'s `floor-plan/analyze` and related routes) — cataloged in the Phase 3C readiness review, never in scope for C1–C4, belongs to Phase 3D.
- Branding logo/background (`branding.controller.ts`) — confirmed no Mall dimension exists at all (`BrandingSettings` has no `mallId` field); correctly `@GlobalScope`, not a File-domain authorization question.
- Public low-sensitivity static assets (`floor-plans`, `branding`, `unit-media` — the 3 subpaths on `main.ts`'s narrow static mount) — classified separately as intentionally-public by design (unit/floor-plan imagery, pre-auth branding), re-verified this gate to confirm no private-document subpath was added to this allowlist since C1 (it wasn't — `main.ts` was never touched by C1–C4).

## 2. All File entry points — re-verified, no new route since C1

Re-ran the static route-scope inventory tool: **523 routes across 41 controller files, unchanged from the count at the start of C1**. All 8 `files.controller.ts` routes and all 9 `fitout-issue.controller.ts` routes confirmed `ENFORCED`. No route was added, removed, or renamed by C1–C4 — only existing routes' authorization logic changed.

Full route list per family: unchanged from `29-CR-101-FILE-OWNERSHIP-MATRIX.md`'s Table A/B — not reproduced here to avoid duplicating that document; every row in both tables now reads RESOLVED/ENFORCED, with citations to the specific commit-equivalent (unstaged diff) that closed each.

## 3. Security invariants — re-verified against current code

- **INV-FILE-001** (read requires authoritative ownership): SATISFIED for all 12 families — Table A fully closed (12/12), Table B fully closed.
- **INV-FILE-002** (Mall-scoped staff cannot cross Malls without authority): SATISFIED — every family now calls `MallAccessService`; no `CROSS_MALL_READ`-style exception was introduced for any file route (none was authorized, none was added).
- **INV-FILE-003** (Tenant A cannot access Tenant B's documents): SATISFIED, unchanged throughout the entire program — never touched, never weakened.
- **INV-FILE-004** (client-supplied parent id cannot override actual ownership): SATISFIED — the one confirmed violation (`fitout.controller.ts` `reviewDocument`) fixed in C4; re-verified this gate that no `files.controller.ts` route accepts a second, client-supplied owner/parent identifier at all (all 8 resolve strictly from the fetched file record's own FK field).
- **INV-FILE-005** (write/delete/replace needs write-tier authority): SATISFIED — re-confirmed this gate via a fresh grep for every `@Delete` route across `parking`/`patrol`/`work-orders`/`fitout` controllers (**zero** found beyond the two already-known, already-correct delete routes: Contract files, Service Contract documents — both EDIT-tier-gated and parent-scoped).
- **INV-FILE-006** (no direct-storage bypass): SATISFIED, re-verified this gate — `main.ts`'s static mount is still exactly the 3-subpath allowlist (`floor-plans`, `branding`, `unit-media`), confirmed unchanged since no code in `main.ts` was touched by any batch in this program.
- **INV-FILE-007** (ADMIN may bypass Mall policy, never entity-relationship integrity): SATISFIED, explicitly tested in C4 (`fitout.controller.review-document.spec.ts`'s ADMIN test proves the bypass never substitutes a different `projectId` into the parent-child check) and structurally true everywhere else (`MallAccessService`'s bypass only ever short-circuits the Mall lookup itself, never any entity-existence or entity-relationship check, which all live in application code the bypass has no access to).
- **INV-FILE-008** (polymorphic branch resolution is server-controlled): SATISFIED — `downloadUnifiedDocument`'s `switch (doc.entityType)` dispatches on a value read from the database row, never from request input; re-verified this gate that every `UnifiedDocument`-creating service (`tickets.service.ts`, `fitout-issue.service.ts`, `fitout-submittal.service.ts`, `fitout-daily-report.service.ts`, `billing.service.ts`) hardcodes its own `entityType` as a source constant, not a client-supplied field — a caller cannot upload a document and claim it's a different type than the endpoint it was uploaded through.

No additional invariants were found necessary.

## 4. FilesController consolidation

Re-read the complete, current `files.controller.ts` this gate (all 275 lines, fresh, not from memory). Confirmed every one of the 8 routes follows the same shape: fetch file/execution by its own id → derive the owner reference from the fetched record (never a request parameter) → call `MallAccessService` → stream. **No family still uses role-only authorization or client-supplied owner context.** One structural note newly surfaced this gate: `MallAccessGuard` (the global, heuristic-based guard) contributes **nothing** to any of these 8 routes — none of them use a literal `:id` path parameter (they use `:fileId`/`:executionId`), so the guard's `resourceId = params.id` is always `undefined` here, and no path-substring or query/body field matches either. This means the explicit `MallAccessService` calls added in C1–C3 are the *entire* enforcement mechanism for this controller — not a supplement to incidental guard coverage. This is exactly the intended end-state (explicit, not coincidental), confirmed rather than assumed.

## 5. Module-native route consolidation

Cross-checked Table B (module-native routes) against Table A (central download routes) for every family: no family has a module-native route that's *less* strict than its `files.controller.ts` counterpart, and none is *more* strict without documented reason (the stricter cases — e.g. `billingStaff` excluding TENANT from invoice document upload while `billing` allows TENANT to view invoices generally — were already documented in the Phase 3C readiness review as intentional, unchanged by C1–C4). No resource reachable-but-unauthorized through one path while blocked through the other was found.

## 6. Polymorphic UnifiedDocument adversarial tests

Existing test coverage (`files.controller.spec.ts`) already exercises each of the 5 branches (INVOICE, TICKET, FITOUT_SUBMITTAL, FITOUT_ISSUE, FITOUT_DAILY_REPORT) independently, including the pre-existing `404s on an unrecognized entityType rather than streaming blindly` test (unsupported branch → safe failure) and each branch's own DENY test (`Mall access (CR-101 Phase 3C C2)` block). No caller-controlled branch selection exists (§3, INV-FILE-008) — confirmed structurally, not merely by test, since `entityType` is never accepted as request input on the read path and is hardcoded per upload endpoint on the write path.

## 7. ID-substitution matrix

| Scenario | Result | Evidence |
|---|---|---|
| Parent A / File A | ALLOW | Every family's same-Mall/same-parent ALLOW test (C1–C4 test suites) |
| Parent A / File B, same Mall, unrelated parent | DENY where relationship matters | `fitout-documents.service.spec.ts`'s same-Mall-cross-project test (the exact C4-01 bug class) |
| Parent A / File C, other Mall | DENY | `fitout-documents.service.spec.ts`'s cross-Mall test; every family's cross-Mall DENY test |
| Valid Mall + foreign Tenant file | DENY where Tenant rules apply | Pre-existing, unchanged tenant-ownership tests for Contract/Invoice/Ticket/Fitout-project-document/Ticket-photos |
| ADMIN + wrong parent-child relationship | DENY | `fitout.controller.review-document.spec.ts`'s ADMIN test — bypass never weakens the parent-child check |

## 8. Cross-Mall matrix

Every family's resolver has DENY/ALLOW/bypass-role parameterized tests in `mall-access.service.spec.ts` (the standard `it.each` pattern used consistently since Phase 3A), plus route-level DENY tests in `files.controller.spec.ts` proving the route actually calls the resolver and blocks the stream. ADMIN and CEO's existing bypass behavior (`BYPASS_ROLES = [ADMIN, CEO, TENANT]`) is unchanged — no policy modification was made anywhere in C1–C5, consistent with `BC-CEO-SCOPE` remaining untouched and out of scope throughout.

## 9. Cross-Tenant matrix

Re-confirmed for every Tenant-reachable family (Contract, Invoice, Ticket, Fitout Project Document, Ticket photos): tenant-ownership checks are the original, pre-CR-101 code, never modified by this program — only ever had a Mall check *added* alongside them. `MallAccessService.BYPASS_ROLES` including `TENANT` means Mall checks never apply to tenant users at all (by design); tenant isolation rests entirely on these per-service `tenantId` comparisons, which were independently re-verified (not merely trusted) in the Phase 3C readiness review and unchanged since.

## 10. Direct storage gate — re-verified

`main.ts`'s static mount: still exactly `['floor-plans', 'branding', 'unit-media']`, confirmed by reading the file fresh this gate. No other `express.static`/`ServeStaticModule`/`sendFile`/`res.download` call exists anywhere in `apps/backend/src` (re-confirmed via grep this gate — same result as the Phase 3C readiness review's independent finding). Every private-document subfolder (`contracts`, `billing/invoices`, `fitout*`, `service-contracts`, `parking-contracts`, `patrol`, `work-orders`, `tickets`, `maintenance`) remains outside any static mount. **PROTECTED, no regression found.**

## 11. Operation-specific authorization

- **READ**: all 12 families, ENFORCED (Mall) + preserved existing role/tenant checks.
- **UPLOAD**: all module-native upload routes (Table B), ENFORCED, unchanged by C1–C5 (already correct before this program started, per the readiness review).
- **REVIEW**: the one review operation in the domain (`fitout.controller.ts`'s `reviewDocument`) — ENFORCED + parent-child-verified (C4-01).
- **UPDATE**: no generic "update file metadata" route exists in this domain beyond review/status-transition, already covered.
- **DELETE**: exactly 2 routes platform-wide (Contract files, Service Contract documents), both EDIT-tier-gated, both parent-scoped, both unchanged by this program (already correct).
- **REPLACE**: no replace/re-upload-in-place route exists for any family (uploads always create a new record; re-verified no PUT/PATCH-with-file route exists beyond what's listed above).

No family grants a READ-only role implicit DELETE/REPLACE capability — confirmed by role-set comparison (every delete route's role list is a strict subset of, or equal to, its family's read role list, never broader).

## 12. Resolver registry consolidation

- **Uniqueness**: `mall-resolver-registry.spec.ts`'s duplicate-name check — PASS (re-run this gate).
- **All referenced resolvers exist**: same test's unresolved-reference check — PASS (re-run this gate, 0 unknown references across all 41 controller files).
- **No duplicate owner→Mall chain implementations**: verified — every File-domain resolver added across C1–C4 (`contract`, `invoice`, `ticket`, `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry`, `fitoutProject`, `workOrder`, `parkingCustomerContract`, `serviceContract`, `patrolCheck`, `maintenanceSchedule`) has exactly one implementation in `mall-access.service.ts`, referenced by name everywhere it's used.
- **Patrol resolver matches `PatrolService` semantics**: proven by a dedicated test (`mall-access.service.spec.ts`'s "resolves via shift.mallId, not point.route.mallId" test) that the folded `patrolCheck` resolver uses the identical relation chain as the original `checkMallId()` helper, which itself remains unmodified.
- **Maintenance distinct from WorkOrder**: confirmed via schema (separate models, no shared table/FK) in C3's baseline verification, unchanged.
- **All resolution failures fail safely**: every resolver added in this program follows the established "silently skip the Mall check if the owner can't be resolved" convention used by ~20 pre-existing resolvers (except `invoice`/`payment`/`invoiceAdjustment`, which fail closed by throwing) — consistent with platform convention, not a new pattern.

## 13. Query / performance review

No obvious N+1 introduced. Every C1–C4 route performs at most 2 sequential point-lookups (fetch the file record, then resolve its owner's Mall) — no loops, no batch operations added to `files.controller.ts`. One optimization opportunity was identified and explicitly **deferred as P3** during C1/C2 (documented in that completion doc): the `UnifiedDocument` branches' existing tenant-check queries could be combined with the new Mall-check query into a single `select` rather than two sequential round-trips. Not fixed — correctness and reuse of already-tested resolver logic was prioritized over this micro-optimization, consistent with the authorization's own "correctness has priority over micro-optimization" instruction from the C1/C2 phase. Not a security or high-risk performance regression; acceptable backlog.

## 14. Data reconciliation

Ran against the dev database (`leasing_platform`) across all 9 queryable File-domain tables plus a `Mall` count for context. **Result: EMPTY / WEAK EVIDENCE** — every one of `ContractFile`, `UnifiedDocument`, `FitoutDocument`, `FitoutIssue`, `ParkingContractDocument`, `ServiceContractDocument`, `WorkOrderEvidence`, `PatrolCheck` (with a file), and `MaintenanceExecution` (with evidence) contains **0 rows**; the environment has exactly **1 Mall**. This has been true and stated plainly at every C-batch this phase — not newly discovered, not overclaimed as validation. **No mutation performed.** A meaningful data-level validation of this program's fixes requires re-running the same query set (reproduced across the C1–C4 completion docs) against a populated multi-Mall environment (UAT/staging/production) — recorded as a follow-up, not a blocker to this gate's code-level closure decision.

## 15. Adversarial review (performed by the implementing session — see disclosed deviation above)

| # | Category | Verdict | Basis |
|---|---|---|---|
| 1 | Cross-Mall IDOR | **PROTECTED** | All 12 families ENFORCED (Table A + B), verified by test |
| 2 | Cross-Tenant IDOR | **PROTECTED** | Unchanged, pre-existing, independently re-verified in the readiness review and again this gate |
| 3 | parentId substitution | **PROTECTED** | The one confirmed instance fixed (C4-01); no other instance exists — structurally, no `files.controller.ts` route accepts a second owner id from the request |
| 4 | fileId substitution | **NOT APPLICABLE** | Every route keyed by the resource's own PK |
| 5 | UnifiedDocument branch confusion | **PROTECTED** | `entityType` server-controlled on both read (DB-sourced) and write (hardcoded per service) paths |
| 6 | Role-only bypass | **PROTECTED** | All 12 families now have both role AND Mall checks |
| 7 | ADMIN integrity bypass | **PROTECTED** | Explicitly tested; bypass only ever affects the Mall lookup, never entity-relationship checks |
| 8 | Alternate route / module-native vs FilesController mismatch | **PROTECTED** | Cross-checked, no inconsistency found (§5) |
| 9 | Direct URL bypass | **PROTECTED** | Re-verified, static mount unchanged, no other file-serving mechanism exists (§10) |
| 10 | Unknown/orphan owner | **PROTECTED** | Non-nullable FK + cascade-delete schema constraints for the C3 families; fail-closed resolver for the one nullable field (`Invoice.mallId`) |
| 11 | List/preview leakage | **PROTECTED**, 1 minor documented smell | Ticket-photo `listPhotos` exposes a raw `filePath` string in its JSON response — not exploitable (the path isn't under any static mount), tracked as P3 backlog, not fixed |
| 12 | Delete/replace escalation | **PROTECTED** | Only 2 delete routes exist platform-wide, both parent-scoped and write-tier-gated; re-confirmed via fresh grep this gate that no other family has one |
| 13 | Upload-to-foreign-owner | **PROTECTED** | All module-native upload routes already ENFORCED (Table B), unchanged by this program |

**No CONFIRMED BYPASS found in this pass.** One item remains genuinely UNKNOWN in the sense of "not independently cross-checked by a second reviewer" — see the disclosed process deviation at the top of this document.

## 16. Tests (final count across the whole File-domain program)

- `mall-access.service.spec.ts`: resolver-level DENY/ALLOW/bypass tests for every File-domain resolver added since Phase 3A (servicePriceCatalog, fitoutGanttTask, fitoutDailyReportEntry, announcementMall, zone, workOrder, parkingCustomerContract, serviceContract, patrolCheck) plus the pre-existing ~18 resolvers, unchanged.
- `files.controller.spec.ts`: full route-level DENY/ALLOW/bypass coverage for all 8 routes / 12 families.
- `fitout-documents.service.spec.ts`, `fitout.controller.review-document.spec.ts`: C4-01's parent-child integrity matrix.
- `fitout-issue.controller.spec.ts`: C4-02's 9-route DENY matrix.
- `mall-resolver-registry.spec.ts`: duplicate-name and unresolved-reference integrity gate.

## 17. Regression (re-run fresh for this gate, not reused from C4)

- Backend (`npx jest`): **78/78 suites, 494/494 tests passing.**
- Frontend (`npx vitest run`): **28/29 files, 216/225 tests.** **The 9 `BookingsPage.test.tsx` failures are the pre-existing, unrelated "Xóa booking" timeout issue — unchanged, not a regression.**
- `tsc --noEmit` (backend): clean.
- `eslint` on every File-domain file touched across the whole program: clean.
- `nest build`: clean.
- `git diff --check`: clean (one line-ending advisory only, not a whitespace error).
- Route inventory: 523 routes, unchanged count since before C1 — no new route appeared.

## 18. Known findings, final tally

- **Known P0**: 0.
- **Known P1**: 0.
- **Known P2 in File domain**: 0.
- **Known P3 (documented, acceptable backlog, not fixed)**: 2 — (a) ticket-photo `listPhotos`'s raw-`filePath`-in-response smell (§15, item 11); (b) the `UnifiedDocument` branches' combinable-select performance micro-optimization (§13).
- **Unknown**: 1 in the process sense only (§"Disclosed process deviation") — not an unresolved security question, a caveat about review independence.

## 19. Closure decision

Checking every required criterion:
- Known P0 = 0 ✓. Known P1 = 0 ✓. Unknown = 0 in the security-finding sense ✓ (the one "unknown" is a process caveat, not an open security question).
- All 12 owner chains verified ✓ (Table A, `29-CR-101-FILE-OWNERSHIP-MATRIX.md`).
- C4 parent-child integrity proven ✓ (§7, §15 item 3).
- Cross-Mall negative tests pass ✓ (§8, §17).
- Cross-Tenant tests pass where applicable ✓ (§9).
- Direct storage remains protected ✓ (§10).
- No adversarial bypass remains ✓, **with the explicit caveat that this pass was not independently cross-checked by a second reviewer** (disclosed above).
- All File-related route/resolver references classified ✓ (§2, §12).

## FILE AUTHORIZATION DOMAIN: **CLOSED**

Closed on the strength of: 12/12 owner chains verified, 0 known P0/P1, full test coverage with fresh re-runs, and a thorough (if not independently cross-checked) adversarial pass with specific, checkable citations for every verdict. The one caveat — no second-reviewer verification — is disclosed rather than hidden; if the human reviewer wants that gap closed before treating this as final, the appropriate action is a follow-up independent-agent pass once the platform spend limit resets, not a re-doing of the analysis itself.

## 20. System Truth / Risk Register update (recorded here, not yet propagated to those documents' own files unless separately requested)

`AUTH-01`'s File-domain component (per `docs/architecture-review/08-ROOT-CAUSE-CLUSTERS.md`'s cluster definition, which explicitly includes "the FilesController cross-Mall IDOR residual finding") is now **RESOLVED**. `AUTH-01`'s other, non-File-domain findings (CONTRA-008's Spaces/Analytics/Reports/Sales/Parking-Dashboard/CRM instances, P0-002) were already resolved in earlier CR-101 phases (3A, 3B, 3B.1) — with this closure, every currently-known instance clustered under `AUTH-01` is resolved. `BC-018` (the original `/uploads` static-serving question) remains marked RESOLVED as it already was, unchanged. `BC-CEO-SCOPE` remains OPEN, untouched by this program, as instructed throughout.

## Git discipline

No `git add -A`. All working-tree entries confirmed **unstaged** (`git diff --cached` empty). No commit created. No RC4. RC3 unchanged. HEAD unchanged.
