# 02 — File / Document Security Architecture

## FILE SECURITY VERDICT: **SAFE** (for unauthenticated/cross-tenant access) — **PARTIAL** (for cross-Mall access)

This corrects and closes `BC-018` from the prior System Truth pass. See the "System Truth correction" section at the end of this document for the explicit correction record.

## How static files are served, and order relative to the guard chain

`apps/backend/src/main.ts:71-91`:

```text
71  const app = await NestFactory.create(AppModule, { logger, bodyParser: false });
74  app.use(json({ limit: '20mb' }));
75  app.use(urlencoded({ extended: true, limit: '20mb' }));
77-91  // Static uploads mount — deliberately narrow (documented P1 remediation)
88  const PUBLIC_UPLOAD_SUBPATHS = ['floor-plans', 'branding', 'unit-media'];
89  for (const subpath of PUBLIC_UPLOAD_SUBPATHS) {
90    app.use(`/uploads/${subpath}`, expressStatic(path.join(uploadRoot, subpath), { maxAge: '1d' }));
91  }
93  app.setGlobalPrefix('api');
```

There is **no** `ServeStaticModule` and **no** blanket `app.use('/uploads', expressStatic(uploadRoot))` anywhere in the backend (confirmed via exhaustive grep — zero matches). Only three narrow, explicitly-named subpaths are statically served: `floor-plans`, `branding`, `unit-media` — all classified low-sensitivity (unit/floor-plan images, pre-auth mall branding logos; no PII or financial data). **Every other subpath under `uploads/`** (contracts, billing/invoices, fitout*, service-contracts, parking-contracts, patrol, work-orders, tickets, maintenance) **has no static mount at all** — `GET /uploads/<that-subpath>/...` returns 404 because the route doesn't exist in Express's middleware stack, independent of any NestJS guard.

## Per-request authorization on retrieval (not merely at upload)

`apps/backend/src/files/files.controller.ts` implements one `GET /api/files/...` route per owning data model: `contracts/:fileId`, `documents/:fileId` (Invoice/Ticket/Fitout), `fitout-documents/:fileId`, `parking-contract-documents/:fileId`, `service-contract-documents/:fileId`, `work-order-evidence/:fileId`, `patrol-checks/:fileId`, `maintenance-evidence/:executionId/:fileName`. Each:
- Requires authentication via the global `JwtAuthGuard`.
- Performs its own **per-request** DB lookup + role/tenant-ownership check before streaming — e.g. Contract files check `contract.tenantId` against the requester (TENANT role denied unless it's their own contract); Invoice/Ticket documents follow the same pattern; staff-only document types (Parking/ServiceContracts/WorkOrders/Patrol) are role-gated since TENANT has no module access to them at all.
- Streams via `StorageService.getFileStream()`, which path-traversal-guards the resolved path before opening the file.

This means authorization is checked **on every retrieval**, not only once at upload time.

## Upload path (representative sample)

Contracts (`contracts.controller.ts:190-192`), Fitout (submittals/issues/daily-reports), Tickets, Parking, Service-Contracts, Work-Orders, Patrol, Spaces, Billing — all use `FileInterceptor`/`multer` behind `JwtAuthGuard` + module-specific `@Roles(...)`. `StorageService.saveFile()` writes to `{uploadDir}/{subfolder}/{timestamp}_{sanitizedOriginalName}{ext}` and returns a `fileUrl: /uploads/{relativePath}`. **Filenames are timestamp+sanitized-name, not UUID-random** — this only matters for the three still-public subpaths (private paths aren't reachable by raw URL at all regardless of filename predictability).

## Reverse proxy — no independent static serving found

`scripts/nginx-site.conf:56-63` and `apps/frontend/nginx.conf:80-89` both proxy `/uploads/` to the backend application (`proxy_pass http://backend:3000`) rather than serving from disk with `root`/`alias`. `docker-compose.yml` mounts the uploads volume only into the backend container, not into any nginx/frontend container. **No reverse-proxy-level bypass exists in either config found in this repository.**

## Document-metadata ownership and retrieval-time scoping

| Model | Owning relation checked at retrieval | Enforced? |
|---|---|---|
| `ContractFile` | `contract.tenantId` | Yes |
| `UnifiedDocument` (Invoice/Ticket/Fitout types) | `invoice.tenantId` / `ticket.tenantId`, else role-only | Yes for tenant-owned types |
| `FitoutDocument` | `project.tenantId` | Yes |
| `ParkingContractDocument`, `ServiceContractDocument`, `WorkOrderEvidence`, `PatrolCheck` | Role-only (no TENANT module access) | Yes, by role |
| `MaintenanceExecution.evidenceUrls` | Array-membership against `executionId` | Yes |

## Residual gap — PARTIAL, not full SAFE

**`FilesController` routes apply no `MallAccessGuard`/`MallAccessService` check.** A role-eligible staff user (e.g. a Leasing Manager assigned only to Mall A) can currently download a document belonging to a record in Mall B, provided their role passes the module-level check — this is a genuine, **documented-but-unresolved** cross-Mall IDOR on file retrieval (per `docs/security/PUBLIC_UPLOADS_REMEDIATION.md:72-79`), distinct from and narrower than the original "fully unauthenticated" risk, which is closed. This is the same root cause as `AUTH-01` (see `08-ROOT-CAUSE-CLUSTERS.md`) and should be folded into that remediation program rather than treated as a standalone document-security fix.

A secondary, lower-severity note: filenames on the three public subpaths use a predictable timestamp+sanitized-name scheme rather than random IDs — worth tightening opportunistically, not urgent given the low-sensitivity classification of those specific subpaths.

## Blast radius (given the fix already applied)

- **Private business documents** (Contracts, Invoices, Fitout, Tickets, Service Contracts, Parking, Patrol, Work Orders, Maintenance): not exposed to unauthenticated or cross-tenant access. **Exposed to cross-Mall access** by role-eligible staff (residual gap above).
- **Public subpaths** (floor-plans, branding, unit-media): openly accessible by design, low-sensitivity, acceptable as documented.

## System Truth correction (explicit — per governance requirement to never silently rewrite history)

- **What the prior System Truth pass said**: `docs/system-truth/14-FILE-DOCUMENT-OWNERSHIP.md` and `BUSINESS_CONFIRMATION_REQUIRED.md` (BC-018) carried forward, **without independent verification**, a claim originating in `docs/readiness/SECURITY_READINESS.md:17/43` that `/uploads` might be served before NestJS auth guards, bypassing all authorization for any file URL an attacker could guess.
- **What this investigation found**: That historical vulnerability **was real and has since been fixed** (per `docs/security/PUBLIC_UPLOADS_REMEDIATION.md`, dated 2026-08-19, status RESOLVED, with 24 passing unit tests and a documented live-verification pass showing the correct 404/401/403 behavior). `SECURITY_READINESS.md` itself is stale relative to this newer, more specific remediation document and should be updated or made to explicitly cross-reference it.
- **Correction applied**: `docs/system-truth/BUSINESS_CONFIRMATION_REQUIRED.md` BC-018 is updated below (not deleted) to record: original claim → found stale → superseded by `PUBLIC_UPLOADS_REMEDIATION.md` → residual scope narrowed to the cross-Mall IDOR gap on `FilesController`, now tracked under `AUTH-01`. `docs/system-truth/14-FILE-DOCUMENT-OWNERSHIP.md`'s "NOT independently re-verified" framing is superseded by this document, which should now be treated as authoritative for file/document security.
- **Unresolved from this investigation** (genuine unknowns, not code questions): whether the actual deployed production/UAT environment is running the fixed code (this audit covers source code only, not deployed state); whether any file was uploaded to a public subpath in error while the old blanket mount existed and remains exposed today (requires a data audit, not a code audit).
