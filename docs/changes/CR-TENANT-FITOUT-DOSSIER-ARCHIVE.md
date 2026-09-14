# CR-TENANT-FITOUT-DOSSIER-ARCHIVE — Searchable Fitout dossiers in Tenant profiles

## CHANGE ID
CR-TENANT-FITOUT-DOSSIER-ARCHIVE

## BUSINESS REASON
Operations must be able to retrieve a tenant's completed Fitout dossiers from the tenant profile long after the approval work is finished, without knowing the original project or approval queue.

## CURRENT BEHAVIOR
Approved Fitout submittals and their attachments remain in the Fitout and UnifiedDocument source tables, but the Tenant detail workspace has no archive or search surface for them.

## EXPECTED BEHAVIOR
Tenant details expose a searchable Fitout dossier archive. A completed dossier is an approved or published Fitout submittal. Search covers dossier title, form code/name, project stage, contract number, unit code/name, submitter/approver, approval or discussion comments, and attachment filename. Every retained active attachment version can be opened through the authenticated UnifiedDocument route, with approval and discussion history available beside it.

## PRIMARY DOMAIN
Tenants (read surface), consuming Fitout-owned submittals and Files-owned UnifiedDocument metadata without copying or writing either domain's data.

## AFFECTED JOURNEYS
BP Contract → Fitout → Handover; GS-05 Contract → Fitout; GS-08 Fitout → Handover; GS-09 Cross-Mall denial.

## UPSTREAM IMPACT
Relies on FitoutProject.tenantId, FitoutSubmittal status/form/project relations, and UnifiedDocument `entityType=FITOUT_SUBMITTAL` / `entityId=submittal.id` remaining authoritative.

## DOWNSTREAM IMPACT
Adds a read-only Tenant detail tab and one Tenant API endpoint. No dashboard, report, export, notification, SAP, billing, contract, or Tenant Portal behavior changes.

## DATA OWNERSHIP IMPACT
No cross-domain writes and no copied file records. The Tenant service performs an indexed read-through of Fitout and UnifiedDocument source data.

## STATE MACHINE IMPACT
No transition changes. The archive reads existing terminal accepted states `APPROVED` and `PUBLISHED`; rejected, pending, in-progress, obsolete, and draft dossiers are not presented as completed.

## FINANCIAL IMPACT
N/A — no money fields or formulas are read or written.

## CURRENCY IMPACT
N/A — no monetary values are involved.

## MALL/COMPANY IMPACT
Tenant is multi-Mall by design. Each request first resolves and validates the tenant against the authenticated user's Mall access; the data query is anchored by both `FitoutProject.tenantId` and the user's accessible Mall IDs through the project's Unit. File opening independently revalidates the submittal's owning Mall.

## TENANT IMPACT
Staff gain a consolidated archive in Tenant details. Tenant Portal permissions and visibility do not change.

## AUTHORIZATION IMPACT
Integrated with `CR-AUTH-FITOUT-001`: `GET /tenants/:id/fitout-archive` uses the narrow `fitout-dossier-view` action key instead of implying general Tenant access, then constrains results to server-derived accessible Mall IDs. Negative coverage must prove denial creates no archive query and service coverage must prove the Mall filter precedes search/count/pagination.

## REPORTING IMPACT
N/A — no reporting definitions or metrics change.

## TRANSACTION IMPACT
N/A — read-only. Results may reflect the latest committed state between requests.

## EVENT/JOB IMPACT
N/A — no events, workers, or scheduled jobs.

## DOCUMENT IMPACT
Adds discoverability only. Files are not duplicated, moved, deleted, or re-versioned; all active versions continue to follow UnifiedDocument retention and access rules.

## API IMPACT
Adds a paginated/searchable Tenant endpoint consumed only by Tenant details. Existing response shapes are unchanged.

## MIGRATION
N/A — current indexes cover Fitout project/status and UnifiedDocument entity lookup; no schema change.

## BACKWARD COMPATIBILITY
Existing approved/published dossiers appear automatically because the archive is derived from authoritative existing rows.

## GOLDEN E2E SCENARIOS
Verify an authorized Mall user can search and open a completed dossier; verify a Mall A user cannot query a Mall B tenant; rerun Fitout submittal/file authorization regressions and frontend typecheck/build.

## RECONCILIATION
Compare archive attachment IDs/versions to Fitout submittal attachment results. No duplicate stored records should be created.

## ROLLBACK
Remove the Tenant archive route, service query, API client method, and UI tab. Source Fitout/file data remains untouched.

## OPEN BUSINESS QUESTIONS
N/A for this scope. “Completed dossier” is implemented using the system's accepted terminal states (`APPROVED`, `PUBLISHED`), while full retained attachment-version history is shown.

---

## Severity classification
Priority: P2 — Tier: 2 (cross-domain, read-only, authorization-sensitive).

## Gate results
- Impact/data ownership review: PASS — read-through only, no duplicated documents.
- Mall/Tenant authorization: PASS — controller denial has zero service reads; service query is restricted to accessible Mall IDs.
- Tenant/Fitout/File targeted backend tests: PASS — 4 suites, 78 tests.
- Backend typecheck: PASS.
- Frontend Fitout attachment regression: PASS — 17 tests.
- Frontend production build/typecheck: PASS.
- Schema/migration gate: N/A — no schema change.
- Live signed-in visual verification: NOT RUN in this implementation environment.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Requester | User | 2026-09-08 | Requested |
