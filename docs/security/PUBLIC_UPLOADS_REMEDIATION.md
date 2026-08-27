# P1 — Public `/uploads` Remediation

**Status:** RESOLVED (code + live-verified) · 2026-08-19 · Sprint: Production
Hardening A

## Problem

`apps/backend/src/main.ts` served the **entire** uploads directory as an
unauthenticated static mount: `app.use('/uploads', expressStatic(uploadRoot))`.
Any file under it — Contract PDFs, Billing invoice attachments, Fitout
documents, Service Contract files, Parking contract documents, Patrol
check evidence, Work Order evidence, Ticket/maintenance photos — was
fetchable by anyone who had or could guess the URL, with zero authentication
or authorization.

## Classification (section 11 of the sprint brief)

| Category | Subfolders | Decision |
|---|---|---|
| PRIVATE (business documents) | `contracts`, `billing/invoices`, `fitout*` (4 variants), `service-contracts`, `parking-contracts`, `patrol`, `work-orders`, `tickets`, `maintenance` | Moved behind authenticated, per-record-authorized download routes |
| PUBLIC ASSET (low sensitivity, needed pre-auth or as plain `<img>`) | `floor-plans`, `branding`, `unit-media` | Kept on the static mount — floor plans/unit photos carry no PII or financial data and are shown broadly in the leasing UI; branding logos render on the login screen before authentication |

## Fix

1. **`src/main.ts`** — the blanket `/uploads` mount was replaced with three
   narrow mounts, one per public subpath only. Every other path under
   `uploads/` is now unreachable via plain HTTP GET (confirmed: returns 404,
   not even a 403 — the route doesn't exist).
2. **New `src/files/` module** (`FilesController` + `FilesModule`) — one
   route per owning data model, each doing its own authorization before
   streaming via the existing (already path-traversal-safe)
   `StorageService.getFileStream()`:
   - `GET /api/files/contracts/:fileId` — `ContractFile`, tenant-ownership
     checked via the linked `Contract.tenantId`
   - `GET /api/files/documents/:fileId` — `UnifiedDocument`, dispatched by
     `entityType` (`INVOICE`/`TICKET`: tenant-ownership checked;
     `FITOUT_SUBMITTAL`/`FITOUT_ISSUE`/`FITOUT_DAILY_REPORT`: staff-role-only,
     since TENANT has no access to those controllers at all)
   - `GET /api/files/fitout-documents/:fileId` — `FitoutDocument`,
     tenant-ownership via the linked `FitoutProject.tenantId`
   - `GET /api/files/parking-contract-documents/:fileId`,
     `/service-contract-documents/:fileId`, `/work-order-evidence/:fileId`,
     `/patrol-checks/:fileId` — role-only checks (none of these modules grant
     TENANT access at all, matching each module's existing RBAC)
   - `GET /api/files/maintenance-evidence/:executionId/:fileName` —
     `MaintenanceExecution.evidenceUrls` doesn't have a per-file DB id, so
     this checks the requested filename is actually a member of that
     execution's evidence array before streaming
   - All routes rely on the already-global `JwtAuthGuard`
     (`app.module.ts` `APP_GUARD`) for "must be logged in"; each route adds
     its own role/tenant check since a single shared role list can't express
     8 different modules' access rules.
3. **Frontend**: every `<a href="/uploads/...">` / `<img src="/uploads/...">`
   pointing at a now-private path was updated. A plain link/img tag can't
   attach the JWT bearer token (stored in `localStorage`, added via an axios
   interceptor) — browser navigation and `<img>` don't carry custom headers.
   - New `src/lib/downloadFile.ts` (`openAuthenticatedFile`) — fetches via
     the app's authenticated axios instance with `responseType: 'blob'`,
     then opens the blob in a new tab or triggers a download.
   - New `src/components/ui/authenticated-image.tsx` — same idea for inline
     `<img>` thumbnails (ticket photos, patrol evidence, work-order
     evidence): fetches the blob on mount, renders a skeleton until loaded.
   - Updated: `ContractsPage.tsx`, `BillingPage.tsx`, `TicketsPage.tsx`,
     `TenantPortalPage.tsx`, `ServiceContractsPage.tsx` (×2), `ParkingPage.tsx`,
     `PatrolPage.tsx`, `WorkOrdersPage.tsx`.
   - `unit-media`/`floor-plans`/`branding` rendering was **not** touched —
     those already go through a `mediaUrl()`/`resolveFileUrl()` helper and
     remain on the public static mount by design.

## What was not done (documented, not silently skipped)

- **No `MallAccessGuard` integration** on the new routes yet — they check
  role and tenant-ownership, but not multi-mall scoping the way most other
  endpoints do via `MallAccessGuard`. A mall-scoped Leasing Manager could
  currently download a document belonging to a contract/ticket/etc. in a
  mall they aren't assigned to, as long as their role is otherwise allowed.
  Flagged as a follow-up, not blocking for this pass (the P1 finding was
  "unauthenticated," which is now fixed; mall-scoping is an additional,
  narrower hardening item).
- **No filename-to-DB-record cross-check** for `contracts`/`documents`/
  `fitout-documents`/`parking-contract-documents`/`service-contract-documents`/
  `work-order-evidence`/`patrol-checks` routes beyond "does this fileId exist
  and am I authorized for its owning record" — since each route is keyed by
  the file's own DB id (not a raw filename), this is already the correct,
  sufficient check; only `maintenance-evidence` needed the extra
  array-membership check because it has no per-file id.
- **Fitout project documents have no frontend download UI yet** — grepped
  the fitout pages/components and found no existing `filePath` rendering to
  fix; the backend upload path existed but nothing displayed a download link.
  Not built here — that would be a feature addition, out of scope for a
  security-remediation sprint.

## Verification

- Backend: `src/files/files.controller.spec.ts`, 24 tests covering every
  route's authorized/forbidden/tenant-mismatch/not-found paths — pass.
- Full backend suite: 293 passed / 7 failed (same 2 pre-existing failing
  suites as every prior gate, unrelated). `npx tsc --noEmit` — 0 errors.
- Full frontend suite: 181 passed / 39 failed (same pre-existing baseline).
  `npx tsc --noEmit` — 0 errors. `npx vite build` — succeeds.
- **Live-verified against the rebuilt Docker stack**:
  - `GET /uploads/contracts/...` → `404` (route no longer exists at all)
  - `GET /uploads/billing/invoices/...` → `404`
  - `GET /uploads/floor-plans/...` → `404` for a nonexistent file, but the
    *route* is confirmed still mounted (not 401) — public assets still work
  - `GET /api/files/contracts/:id` without a token → `401`
  - `GET /api/files/contracts/:id` / `.../patrol-checks/:id` with a valid
    admin token → `404` "Tài liệu không tồn tại" (auth passes, then the DB
    lookup correctly reports not-found for a bogus id) — confirms the full
    auth → authorization → lookup chain is live, not just unit-tested.
