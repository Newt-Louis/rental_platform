# CR-124 — Service Contract user-friendly upload and date-input errors

## Change request

**Business reason:** Operators must receive actionable, localized feedback instead of Nginx/Node error text when an attachment exceeds the configured upload limit, and instead of a developer-oriented date parsing error when a create-form date is malformed.

**Current behavior:** A reverse-proxy `413` response or a Multer file-size failure can surface its raw response in the Service Contract UI. A date value with an overlong ISO year can reach the create request and surface a backend parsing error.

**Expected behavior:** The Service Contract UI shows `File upload vượt giới hạn cho phép` in Vietnamese or `Reach maximum upload file size` in English for upload-size failures. Before a create request, the UI rejects any supplied Service Contract date that is not a real, four-digit ISO calendar date and shows `Sai định dạng thời gian` / `Incorrect time format`.

## Impact map

| Area | Impact / decision |
|---|---|
| Primary domain / journey | Service Contracts; create contract, attach contract document, attach payment invoice. |
| Upstream / downstream | Browser receives HTTP errors from Nginx or Nest and maps only upload-size failures to a localized UI message. No request, response, database record, file, report, or integration shape changes. |
| Data ownership / state machine | None. Service Contract ownership and lifecycle transitions are unchanged. |
| Financial / currency / reconciliation | None. No monetary value, formula, currency, invoice state, or duplicated display changes. |
| Mall / tenant / authorization | None. Existing endpoint and guards remain unchanged. |
| Transaction / event / job | None. Client-side validation occurs before `create`; no event or job is added or changed. |
| Document / API | Only error presentation changes. The existing upload API and configured server limits remain authoritative. |
| Migration / compatibility / rollback | No migration. Existing valid dates and all upload responses retain behavior except size-limit errors now have a stable localized message. Revert the frontend/locales change to roll back. |

## Golden E2E scenarios

1. Upload a Service Contract document or payment invoice within the server limit: it is persisted unchanged.
2. Receive an upload `413` or `LIMIT_FILE_SIZE`: the UI shows the localized maximum-size message and no raw HTML/Node message.
3. Submit a valid Service Contract date: create request is unchanged.
4. Submit an overlong/malformed/non-calendar Service Contract date: no create request is sent and the localized time-format message is shown.

## Open business questions

None. This CR implements the exact user-provided wording and does not change the server upload limit or accepted business date range beyond the ISO `YYYY-MM-DD` representation already used by the form/API.
