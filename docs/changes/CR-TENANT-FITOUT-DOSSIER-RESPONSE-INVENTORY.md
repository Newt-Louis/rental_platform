# Tenant Fitout dossier archive — explicit response boundary

This inventory is the allow-list for both `GET /tenants/:id/fitout-archive` and restricted `GET /tenants/fitout-archive` (UI `/fitout-dossiers`). Any field not listed is outside the response contract.

## Pagination envelope

- `data`
- `total`
- `page`
- `limit`
- `totalPages`

`total` and pagination are calculated after server-derived Mall scope, terminal-status scope, optional Tenant scope, and search filters.

## Dossier fields

- `id`, `title`, `revisionNo`, `status`, `stageCode`
- `submittedAt`, `updatedAt`
- `formType`: `id`, `code`, `name`, `category`
- `submittedBy`: `id`, `fullName`
- `tenant`: `id`, `brandName` (dedicated Fitout route only; omitted as redundant on a Tenant-specific route)
- `project`: `id` only; operational project notes, dates, assignees and status are excluded
- `project.unit`: `id`, `code`, `name`, `mallId`
- `project.unit.floor`: `id`, `name`, `level`
- `project.contract`: `id`, `contractNumber`

## Approval history fields

- `workflow`: `id`, `status`
- `workflow.steps`: `id`, `stepOrder`, `stepName`, `approverRole`, `status`, `comment`, `decidedAt`
- `workflow.steps[].approver`: `id`, `fullName`

No email address, phone, auth field, raw audit payload, or unrelated workflow entity is returned.

## Discussion fields

- `comments`: `id`, `body`, `createdAt`
- `comments[].author`: `id`, `fullName`

Discussion is limited to `entityType=FITOUT_SUBMITTAL` for an already authorized returned dossier.

## File-version fields

- `attachments`: `id`, `category`, `documentType`, `fileName`, `fileSize`, `mimeType`, `version`, `isLatest`, `uploadedAt`, `retentionYear`

Explicitly excluded: `entityId`, `filePath`, `fileHash`, signed/internal URL, storage credentials, uploader email, and inactive/revoked documents.

## Explicitly absent data

- Tenant company/contact/tax/address/portal-user data
- Tenant financial summaries
- BillingSchedule and BillingScheduleEntry
- Invoice, Payment, AR, revenue, turnover
- bank/payment details
- unrelated Tenant UnifiedDocuments
- ContractFile and unrelated Contract UnifiedDocuments
- Fitout issues, daily reports, risks, change orders, costs, worker access logs
- raw AuditLog/event/outbox/job payloads

## Authoritative sources

- FitoutProject/FitoutSubmittal/FitoutFormType: dossier/project metadata
- ApprovalWorkflow/ApprovalStep: approval history
- EntityComment: dossier discussion
- UnifiedDocument: active retained file-version metadata and authenticated file ID
- StorageService through FilesController: authenticated file streaming

No archive table, copied blob, copied file path, or second source of truth is introduced.
