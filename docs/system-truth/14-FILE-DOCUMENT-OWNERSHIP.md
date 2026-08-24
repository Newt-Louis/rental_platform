# System Truth — 14 — File / Document Ownership

## Status of this document — SUPERSEDED 2026-08-21, see correction below

**Original status (2026-08-21, System Truth phase): NOT independently re-verified this reconstruction pass** — file/document handling (uploads, static-serving, contract PDFs, ticket photos) was outside the five research streams' assigned scope.

## Correction record (2026-08-21, Architecture Review phase)

**This is an explicit correction, not a silent rewrite.** The carried-forward risk below (originally flagged as the top follow-up priority) was investigated in `docs/architecture-review/02-FILE-SECURITY-ARCHITECTURE.md`. **Verdict: SAFE for unauthenticated/cross-tenant access (the vulnerability described below was real but was already fixed on 2026-08-19, per `docs/security/PUBLIC_UPLOADS_REMEDIATION.md`, before this System Truth reconstruction even ran) — PARTIAL for cross-Mall access** (a newly-found, narrower gap: `FilesController` retrieval routes apply no `MallAccessGuard`, tracked under root-cause cluster `AUTH-01`).

The original carried-forward risk text is preserved below for historical record, but should be read as **resolved**, not open:

## Carried-forward risk (original text, preserved for record — see correction above)

`docs/readiness/SECURITY_READINESS.md:17` (P1, as cited by the Tenant & Security research stream while investigating an adjacent question): **`/uploads` is reportedly served before Nest guards**, bypassing JWT/RBAC/Tenant/Mall checks entirely for any document/photo URL an attacker can guess. If accurate and still current, this would undermine every Mall/Tenant-scoping conclusion in `11-ROLE-PERMISSION-MATRIX.md` and `15-MULTI-MALL-MULTI-COMPANY.md` for any file-based resource (Contract PDFs, Ticket photos, Fitout submittal attachments, Tenant-uploaded documents), regardless of how well the owning API endpoint itself is scoped.

~~This is flagged as the single highest-priority follow-up item for the next System Truth pass~~ — **superseded**: see `docs/architecture-review/02-FILE-SECURITY-ARCHITECTURE.md` for the authoritative current state.

## Document types known to exist (from cross-references in the research streams, not independently traced)

- Contract PDFs/e-signature documents (Contracts module)
- Fitout submittal attachments, gate-requirement documents (`HANDOVER_FORM` document type referenced in `04-STATE-MACHINES.md`)
- Ticket photo attachments (confirmed referenced in `tickets.controller.ts:121-136`, ownership enforced via the same tenantId pattern as the parent Ticket per the Tenant & Security stream — but the underlying file-serving mechanism itself was not verified)
- Tenant Portal uploaded documents (referenced, not traced)
- Billing/Parking/Service-Contracts/Inventory Excel exports (generated on-demand, not stored documents)

## Recommended follow-up scope

A dedicated research pass on `apps/backend/src/main.ts` static-asset mounting, any `files.controller.ts` equivalent, and the actual storage mechanism (local disk vs. object storage) for each document type above — verifying whether access control is inherited from the parent entity's Mall/Tenant scope or is independently (and possibly more weakly) enforced.
