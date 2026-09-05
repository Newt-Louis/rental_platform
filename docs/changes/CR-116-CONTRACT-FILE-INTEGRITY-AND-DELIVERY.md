# CR-116 — Contract file integrity and browser delivery

## CHANGE ID
CR-116

## BUSINESS REASON
Leasing staff must be able to upload and retrieve contract evidence without silently storing a previously corrupted download as if it were a valid PDF, image, or Office document.

## CURRENT BEHAVIOR
The `/contracts` upload path trusts the browser-provided filename and MIME type and writes every byte without validating recognizable file signatures. Two files uploaded during UAT on 2026-09-05 are confirmed JSON representations of the former globally wrapped `StreamableFile`, despite being named `.pdf` and `.xlsx`; later downloads faithfully return those already-corrupt stored bytes. The Contracts UI also forces every type into the download branch and does not report retrieval failures.

## EXPECTED BEHAVIOR
The backend rejects missing, unsupported, extension/MIME-mismatched, and known response-envelope-corrupted uploads before writing a file or database row. PDF, JPG/JPEG, PNG, DOC/DOCX, and XLS/XLSX remain accepted when their byte signatures match. On `/contracts`, PDF/JPG/JPEG/PNG open in a new tab; other accepted types trigger a browser-native download using the original filename. The two confirmed UAT records are restored from their intact original server files, with quarantined copies retained for rollback.

## PRIMARY DOMAIN
Leasing Contracts, using the existing platform authenticated file endpoint.

## AFFECTED JOURNEYS
Contract document upload/retrieval within the leasing Contract lifecycle. Existing create, activation, billing schedule, amendment, signature, and termination transitions are not changed.

## UPSTREAM IMPACT
Depends on Multer memory storage supplying `file.buffer`, `originalname`, `mimetype`, and `size`, and on the CR-115 global `StreamableFile` pass-through remaining active.

## DOWNSTREAM IMPACT
`ContractFile` list/sign/verify/delete and `/api/files/contracts/:fileId` continue using the same records and routes. No Billing, Service Contracts, Parking, Fitout, Work Orders, reports, exports, notifications, or SAP logic changes.

## DATA OWNERSHIP IMPACT
Only Leasing-owned `ContractFile` data and its physical files are affected. The two confirmed corrupt UAT files will have their bytes restored from their corresponding intact Contract files and `fileSize` reconciled; a quarantined copy of each corrupt JSON payload will be retained.

## STATE MACHINE IMPACT
N/A — no Contract or document status transition changes.

## FINANCIAL IMPACT
N/A — no rent, deposit, invoice, schedule, formula, or rounding changes.

## CURRENCY IMPACT
N/A — no currency value is read, written, aggregated, or inferred.

## MALL/COMPANY IMPACT
No scope change. Existing Contract validation and file-first Mall resolution remain unchanged.

## TENANT IMPACT
No authorization expansion. Tenant ownership checks on downloads remain unchanged.

## AUTHORIZATION IMPACT
No route, role, JWT, Mall, company, or tenant access logic changes. Validation runs only after the existing upload endpoint authorization and Contract access checks.

## REPORTING IMPACT
N/A — no dashboard, report, or analytics data changes.

## TRANSACTION IMPACT
Validation occurs before filesystem/DB writes. Existing upload write ordering remains unchanged. UAT repair updates bytes first and reconciles only the two exact records identified by ID and path.

## EVENT/JOB IMPACT
N/A — no events, outbox, queue, scheduler, webhook, or retry behavior changes.

## DOCUMENT IMPACT
Recognizable document signatures are enforced for allowed Contract uploads. This is integrity validation, not content malware scanning. Existing valid documents remain unchanged.

## API IMPACT
Endpoint URLs and successful response shapes remain unchanged. Invalid uploads now return HTTP 400 with an actionable message instead of creating a corrupt `ContractFile` record.

## MIGRATION
No schema migration. One scoped data repair covers only `cmtnztwuq00boxp9s1u5vtr8m` and `cmtnzu8pn00buxp9se35nsu8k`, whose JSON payloads directly reference intact originals on the same storage root.

## BACKWARD COMPATIBILITY
Existing valid PDF/image/Word/Excel documents remain accepted and downloadable. Old documents are not bulk-revalidated or rewritten.

## GOLDEN E2E SCENARIOS
Gate 1: focused backend tests cover valid signatures and corrupt/mismatched rejection; frontend tests cover preview/download routing and error handling; backend/frontend builds pass. Gate 4: user re-tests PDF/image preview and Office download in an authenticated browser. Gate 7: existing `FilesController` authorization tests remain green.

## RECONCILIATION
For each repaired UAT record, database `fileSize` must equal physical bytes and the restored file signature/hash must equal its referenced intact original.

## ROLLBACK
Revert validation/UI changes. Restore quarantined JSON bytes to the two exact UAT paths and reset their original 444/450-byte `fileSize` values if the data repair itself must be reversed.

## OPEN BUSINESS QUESTIONS
None. The accepted extensions already match the Contracts page upload control. Browser settings determine whether native download prompts for a location or saves automatically.

---

## Severity classification
Priority: P1 — Tier: 1. Scoped to the Leasing Contract document capability and two confirmed UAT records; no business state, money, cross-domain write, or authorization contract changes.

## Gate results
Gate 1 — PASS: `cd apps/backend && npm test -- contract-file-validation.spec.ts transform.interceptor.spec.ts files.controller.spec.ts` (3 suites, 59 tests); `cd apps/frontend && npm test -- --run src/lib/authenticatedDocument.test.ts src/pages/service-contracts/ServiceContractsPage.test.tsx src/pages/contracts/ContractsPage.test.ts` (3 files, 18 tests). Backend and frontend `npm run build` both pass.

Gate 4 — PENDING USER UAT: authenticated browser interaction is owned by the request owner. Both route modules and the shared helper return HTTP 200 from the running Vite server after the HMR rename; a hard refresh is required for a tab that held the removed helper module.

Gate 7 — PASS: all existing `FilesController` authorization tests pass within the 59-test backend run; no access logic changed.

Data repair — PASS: both corrupt payloads were backed up under `/app/uploads/quarantine/cr-116/`. Restored XLSX and PDF hashes exactly match their intact sources; database `fileSize` values were reconciled from 444 to 6,148 and from 450 to 143,704 bytes, with exactly one row updated for each exact ID/path/old-size predicate.

Runtime — PASS: backend watch compilation reports zero errors and successful Nest startup; `/`, `/api/health/ready`, both page modules, and the shared frontend helper respond HTTP 200.

Gates 2, 3, 5, 6, 8, and 9 — N/A: no lifecycle state, money, currency, event/job, reporting, schema, or cross-domain data changed.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Request owner | User | 2026-09-05 | Approved diagnosis and fix for broken `/contracts` uploads/downloads |
| Implementation agent | Codex | 2026-09-05 | Implemented and verified integrity validation, browser delivery, and scoped UAT repair; authenticated browser UAT remains for the request owner |
