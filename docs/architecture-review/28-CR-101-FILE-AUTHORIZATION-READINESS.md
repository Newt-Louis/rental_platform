# 28 — CR-101 Phase 3C: File Authorization Readiness Review

Audit only. No application code, database, or schema changed. This document is the entry point; see `29-CR-101-FILE-OWNERSHIP-MATRIX.md`, `30-CR-101-FILE-THREAT-MODEL.md`, `31-CR-101-FILE-IMPLEMENTATION-PLAN.md` for the detailed breakdowns this summarizes.

## Methodology

Every claim below was independently re-verified against the current `apps/backend/prisma/schema.prisma`, controller/service source, and `main.ts`'s static-mount configuration this phase — not inherited from prior audit documents without re-checking. Where a prior document's finding was confirmed unchanged, that's stated explicitly; where it was corrected, the correction is recorded (not a silent rewrite — see each doc's "correction" notes).

## 1. Document families — authoritative inventory

Two structurally distinct storage patterns exist:

**A. Dedicated per-family Prisma models** (one row = one file, with format-specific metadata):
`ContractFile`, `FitoutDocument`, `ParkingContractDocument`, `ServiceContractDocument`, `WorkOrderEvidence`, `PatrolCheck` (stores its single evidence file's `fileName`/`filePath`/`fileSize`/`mimeType` directly on the check row, not a join table).

**B. Shared polymorphic model** (`UnifiedDocument`, `entityType` + `entityId` dispatch): Invoice, Ticket, Fitout Submittal, Fitout Issue, Fitout Daily Report — **five** distinct owner types share one table. This was not fully appreciated in prior audits, which treated "Ticket photos," "Fitout Issue photos," etc. as if they might be separate models; they are not — confirmed by reading every upload call site.

**C. Array-field evidence** (no per-file DB id): `MaintenanceExecution.evidenceUrls String[]`.

**Non-file routes discovered and excluded**: `crm.controller.ts`'s `leads/:id/customer-profile` is not a file upload (creates a `Customer` record from `Lead` fields — no `FileInterceptor`). `branding.controller.ts`'s `logo`/`background` routes are file uploads but company-wide singleton config with no Mall dimension at all (`BrandingSettings` has no `mallId` field) — correctly out of the Mall-authorization question entirely.

**Additional family found beyond the original 8** (not searched for previously): `ai.controller.ts`'s `floor-plan/analyze` — a floor-plan image/PDF upload for AI analysis. Cataloged (§13 of `31-...-IMPLEMENTATION-PLAN.md`), explicitly **not** proposed for remediation this phase — AI is Phase 3D, out of scope per this phase's authorization.

## 2. Cross-Mall protection — current state

| Layer | Protected? |
|---|---|
| Upload/list/attach routes in module-specific controllers (tickets, work-orders, patrol, fitout×4, parking, service-contracts, contracts, billing) | **Yes, with two confirmed exceptions** — see §4 |
| Download routes in `files.controller.ts` (the 8 original families) | **No** — role/tenant-only, zero Mall check on any of the 8. This is the well-known `AUTH-01` cluster, previously documented, re-confirmed unchanged this phase. |

The two surfaces are **structurally different codebases with different authorization maturity** — module controllers were hardened incrementally across CR-101 Phases 1–3B; `files.controller.ts` was built once (the 2026-08-19 P1 unauthenticated-access remediation) and has not been touched since for the Mall dimension specifically.

## 3. Cross-Tenant protection — current state

Every route reachable by `Role.TENANT` was checked. All correctly scope to `tenantId === currentUser.tenantId`: `ContractFile` (via `Contract.tenantId`), `UnifiedDocument`/Invoice and Ticket branches, `FitoutDocument` (via `FitoutProject.tenantId`), tickets.controller.ts's own photo routes (double-checked, both at the route layer via `MallAccessService` and at the service layer via `findOne`'s tenant check). **No cross-Tenant IDOR found.** This matches the pre-existing, already-verified "SAFE for cross-tenant" verdict from `02-FILE-SECURITY-ARCHITECTURE.md`, now independently re-confirmed rather than merely inherited.

**Important structural note, newly surfaced this phase**: `MallAccessService.BYPASS_ROLES = [ADMIN, CEO, TENANT]` (`mall-access.service.ts:9`) means **`Role.TENANT` never goes through any Mall-access check anywhere in the codebase, by design** — tenant isolation is intentionally implemented as a per-service `tenantId` check instead. This is a deliberate, documented design choice (comment at the same location explains why), not an oversight — but it means every tenant-reachable route's safety depends entirely on that specific service remembering its own `tenantId` check, with zero platform-level backstop. All routes reachable by `TENANT` were individually verified to have this check (§3 above); none were found missing it. Flagged as a structural risk to watch for in future tenant-accessible routes, not a current finding.

## 4. Confirmed vulnerabilities (headline)

Full detail and classification in `30-CR-101-FILE-THREAT-MODEL.md`. Summary:

- **P1**: `files.controller.ts`'s `patrol-checks/:fileId` never calls the already-existing, already-tested `PatrolService.checkMallId()` helper — any staff user with Patrol role access can download any Mall's patrol evidence file by id. One-line fix available (reuse the existing helper), not implemented this phase (implementation not authorized).
- **P1**: `fitout.controller.ts`'s `PUT :id/documents/:docId/review` validates Mall access against the **project id** in the path but never verifies the **`docId`** in the same path actually belongs to that project — `FitoutDocumentsService.reviewDocument()` does a bare `findUnique({ where: { id: documentId } })` with no `projectId` filter. A caller with legitimate access to their own Mall's fitout project can approve/reject a document belonging to a different Mall's project by supplying its `docId`. This is a genuine "authorize A, act on B" bug — the confirmed ID-substitution pattern Section 10 of the authorization asked to look for. Contrast with `contracts.service.ts` (`deleteFile`/`signFile`) and `service-contracts.service.ts` (`deleteDocument`), which both correctly scope the child lookup to the parent (`findFirst({ id, parentId })`).
- **P2**: the other 7 of `files.controller.ts`'s 8 families have the same class of gap as `patrol-checks` (role-only or tenant-only, no Mall check) but for 4 of them (`ContractFile`, `UnifiedDocument`, `FitoutDocument`) the underlying resolver logic doesn't yet exist as a direct reusable call in `MallAccessService` in quite the shape needed (it does exist as named resolvers already — `contract`, `ticket`, `fitoutProject`, `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry` — so these are wiring tasks, not design tasks) — classified P2 rather than P1 because, unlike patrol-checks, there's no single-line fix available; it's still small, bounded work.
- **P2**: `fitout-issue.controller.ts` has zero explicit `MallAccessService` usage anywhere — its Mall protection today rides entirely on the global `MallAccessGuard`'s incidental path-substring match (`path.includes('fitout-issue')`). Currently works, but fragile — any route restructuring silently drops protection with no build-time signal. The controller's own code comments already flag this.
- **P2**: `ai.controller.ts`'s `GET floor-plan/analyses/:id`, `.../status`, and `POST .../apply` have zero Mall check (neither an explicit call nor global-guard coverage, since the guard has no resolver for "analysis id"). Cataloged for completeness; explicitly not proposed for remediation this phase (AI is Phase 3D).
- **FALSE POSITIVE, closed**: the storage/static-mount bypass concern (Section 11/12 of the authorization) — re-verified independently, the 2026-08-19 P1 remediation holds today with no regression. No direct-path bypass exists for any of the 8 document families.

## 5. Schema blockers

**None found.** Every document family's owner-to-Mall chain terminates in a non-nullable foreign key except two: `Invoice.mallId` (nullable, but the existing `invoice` resolver already fails closed — throws `ForbiddenException` rather than silently skipping — when the invoice exists but no Mall resolves) and `Lead.mallId` (nullable, relevant only to the non-file `customer-profile` route, not a document family). No schema migration is proposed or needed to close any of the file-authorization gaps found this phase.

## 6. Readiness verdict

**PARTIAL.** The canonical architecture needed to close every gap already exists (the `MallAccessService` resolver registry) and most of the resolvers a fix would need are already implemented and in production use elsewhere in the codebase — this is real, low-risk wiring work, not a design problem. Two items (the `fitout.controller.ts` ID-substitution bug and the `patrol-checks` missing-call gap) are precise, bounded, and could each be fixed in isolation with high confidence. The remaining `files.controller.ts` families need the same "call the existing resolver before streaming" pattern applied 6 more times, plus 2-3 genuinely new resolver functions (`workOrder`, `parkingCustomerContract`, `serviceContract` — all confirmed to have direct, non-nullable `mallId` fields, so trivial to write). See `31-CR-101-FILE-IMPLEMENTATION-PLAN.md` for the proposed batch sequencing.

**No implementation authorized this phase.**

---

## Status update — CR-101 Phase 3C, C1+C2 (`docs/changes/CR-101-PHASE-3C-C1-C2-COMPLETION.md`)

**RESOLVED**: the 7-family cross-Mall gap on `files.controller.ts` for Contract, Invoice, Ticket, and the 4 Fitout-family routes (`UnifiedDocument`'s Submittal/Issue/Daily-Report branches, plus `FitoutDocument`) — all now call `MallAccessService` before streaming, using the same already-registered resolvers this document identified as reusable. `fitout.controller.ts`'s `reviewDocument` bug and `fitout-issue.controller.ts`'s incidental-only protection remain **OPEN**, deferred to C4 (not authorized in this batch). Parking/ServiceContract/WorkOrder/Patrol/Maintenance's `files.controller.ts` routes remain **OPEN**, deferred to C3 (not authorized in this batch). See `29-CR-101-FILE-OWNERSHIP-MATRIX.md`'s status update for the row-by-row detail.
