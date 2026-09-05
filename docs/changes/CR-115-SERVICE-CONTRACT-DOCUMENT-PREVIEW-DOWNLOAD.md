# CR-115 — Authenticated file-stream preservation and Service Contract document behavior

## CHANGE ID
CR-115

## BUSINESS REASON
Staff need to reliably inspect uploaded service-contract evidence and retain non-previewable documents. Investigation of the reported preview failure also established that the global response transformer serializes authenticated file streams into JSON, so every `FilesController` binary response is at risk of being unreadable.

## CURRENT BEHAVIOR
Every service-contract document click fetches an authenticated blob and then attempts to open it in a new tab. It does not distinguish previewable files from Office documents, does not offer a download flow, and does not display an error if opening fails. More critically, `TransformInterceptor` wraps a `StreamableFile` in `{ success, data }`; the browser receives serialized response metadata instead of the stored binary, while the status remains HTTP 200.

## EXPECTED BEHAVIOR
`StreamableFile` responses pass through the global response transformer unchanged, preserving existing authenticated authorization and response headers. For Service Contracts, PDF, JPG/JPEG, and PNG documents open in a new tab. DOC, DOCX, and every other stored type are downloaded with their original filename. A failed authenticated fetch or a blocked preview tab is shown to the user as an actionable error. Browser download settings control whether its native save-location chooser is displayed.

## PRIMARY DOMAIN
Platform file-response capability (`TransformInterceptor`) plus Service Contracts (owns `ServiceContractDocument`); the Service Contracts frontend is the requested consumer.

## AFFECTED JOURNEYS
BP-006 Service-Contract-to-Cash: staff review a contract or payment-proof document. Cross-module regression scope: every authenticated `FilesController` endpoint must stream the authorized binary rather than an API envelope. No payment transfer or invoice creation behavior changes.

## UPSTREAM IMPACT
Consumes the existing authenticated `GET /api/files/service-contract-documents/:fileId` endpoint and the `fileName`/`mimeType` values already returned by `GET /api/service-contracts/:id`. The endpoint remains the source of authorization and binary content.

## DOWNSTREAM IMPACT
`FilesController` consumers across Contracts, Billing, Fitout, Parking, Work Orders, Patrol, Tickets, Maintenance, and Service Contracts rely on `StreamableFile` responses. No page behavior outside Service Contracts is intentionally changed, but the interceptor correction restores their existing server contract: binary content with the controller's existing headers.

## DATA OWNERSHIP IMPACT
No writes. `ServiceContractDocument` remains owned and written by the Service Contracts backend.

## STATE MACHINE IMPACT
N/A — no status or transition changes.

## FINANCIAL IMPACT
N/A — no amount, payment status, billing transfer, or formula changes.

## CURRENCY IMPACT
N/A — document rendering/download does not read, write, aggregate, or infer currency.

## MALL/COMPANY IMPACT
No change. The existing download route resolves Mall access using the document's owning service contract.

## TENANT IMPACT
No change. Tenants remain excluded from the Service Contracts document route.

## AUTHORIZATION IMPACT
No endpoint, authorization decision, role list, Mall scope, or tenant check changes. The client continues using the authenticated axios instance to request `/files/service-contract-documents/:id`; no direct `/uploads/...` URL is exposed. The response envelope is deliberately not applied to `StreamableFile` only, because it is not JSON API data.

## REPORTING IMPACT
N/A — no reporting data or metric is affected.

## TRANSACTION IMPACT
N/A — client-side read-only blob handling only.

## EVENT/JOB IMPACT
N/A — no events, scheduler, queue, or retry contract changes.

## DOCUMENT IMPACT
All authenticated document families stream their stored binary rather than serialized `StreamableFile` internals. Service Contract and payment-proof files are rendered/downloaded differently in the UI only: PDF/JPG/JPEG/PNG preview, all others download. Stored content, metadata, versions, paths, retention, and deletion behavior remain unchanged.

## API IMPACT
No endpoint URL, request shape, or authorization behavior changes. Binary file endpoints correctly cease returning the JSON response-envelope format; their existing `Content-Type` and `Content-Disposition` headers remain authoritative. JSON endpoints remain wrapped exactly as before. The Service Contracts frontend uses existing `fileName` and `mimeType` fields to choose an interaction after the existing authenticated GET response.

## MIGRATION
None.

## BACKWARD COMPATIBILITY
Existing document rows remain readable. MIME type is primary; filename extension is a fallback for older rows with missing/generic MIME type. No historical data rewrite is needed.

## GOLDEN E2E SCENARIOS
Gate 1: add an interceptor regression test proving ordinary JSON remains wrapped and `StreamableFile` remains unwrapped; run focused frontend tests and backend build. Gate 4 module smoke: authorized Service Contracts detail loads a PDF/image and opens preview; an existing DOCX starts browser download. Gate 7: re-run all `FilesController` authorization tests; authorization is preserved by the unchanged protected routes. No baseline GS-01–15 data/state transition is modified.

## RECONCILIATION
N/A — no duplicated money or status values.

## ROLLBACK
Revert the `StreamableFile` pass-through in `TransformInterceptor` and the Service Contracts frontend helper/call-site changes. Stored files, database rows, and backend routes are untouched.

## OPEN BUSINESS QUESTIONS
None. Browser native download preference determines whether a Save As dialog appears; this is platform behavior, not a business rule.

---

## Severity classification
Priority: P1 — Tier: 0. Scope escalated on 2026-09-05 after evidence that the global transformer corrupts the response contract for every authenticated `StreamableFile` route. The user confirmed the global defect and explicitly approved implementing its documented correction on 2026-09-05.

## Gate results
Pre-escalation evidence — PASS: the document helper was subsequently generalized as `authenticatedDocument.test.ts`; it and `ServiceContractsPage.test.tsx` pass (2 files, 12 tests), and `npm run build` passes.
Pre-escalation authorization regression — PASS: `cd apps/backend && npm test -- files.controller.spec.ts` (46 tests) passes, but controller-only tests do not exercise the global transformer.
Root-cause evidence — CONFIRMED: direct execution of the current `TransformInterceptor` with a `StreamableFile` produces a top-level object with `success: true` and `data.constructor.name === "StreamableFile"`; it must not be serialized as an API envelope.
Post-escalation Gate 1 — PASS: `cd apps/backend && npm test -- transform.interceptor.spec.ts files.controller.spec.ts service-contracts.controller.spec.ts service-contracts.service.spec.ts` (4 suites, 63 tests); `cd apps/frontend && npm test -- --run src/lib/serviceContractDocument.test.ts src/pages/service-contracts/ServiceContractsPage.test.tsx` (2 files, 12 tests); backend and frontend `npm run build` both pass.
Post-escalation Gate 7 — PASS: all 46 existing `FilesController` authorization tests pass within the focused backend run; no route, guard, role, Mall scope, or tenant logic changed.
Gate 4 browser smoke — PENDING USER UAT: this agent did not control an authenticated browser session. Stored PDF and PNG signatures and byte counts were verified intact during diagnosis, and the interceptor plus frontend open/download branches are covered by regression tests.
Gates 2, 3, 5, 6, 8, and 9 — N/A: no write path, status transition, financial data, events/jobs, reporting, migration, or cross-display state changed.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Request owner | User | 2026-09-05 | Approved CR-115 global file-response correction after confirming the same defect in `/contracts` |
| Implementation agent | Codex | 2026-09-05 | Implemented and verified the approved interceptor correction and Service Contracts behavior; authenticated browser UAT remains for the request owner |
