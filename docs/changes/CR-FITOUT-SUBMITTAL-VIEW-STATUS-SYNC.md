# CR-FITOUT-SUBMITTAL-VIEW-STATUS-SYNC — Restore attachment viewing and status synchronization

## CHANGE ID

CR-FITOUT-SUBMITTAL-VIEW-STATUS-SYNC

## BUSINESS REASON

Fitout submitters and approvers must be able to inspect the exact attachment they are acting on and see the authoritative submittal decision status without manually reloading or guessing whether an approval succeeded.

## CURRENT BEHAVIOR

Fitout submittal attachments are `UnifiedDocument` rows, but the Fitout project and Fitout approval pages request the `FitoutDocument` download route. The request therefore cannot resolve the uploaded attachment. After a final approval or rejection, the shared Approval workflow commits and emits a durable outbox event; the Fitout UI refetches before that event is processed and does not refetch again, leaving an `IN_PROGRESS` status visible after the workflow is terminal.

## EXPECTED BEHAVIOR

Both Fitout surfaces open submittal attachments through the authenticated `UnifiedDocument` route. While a terminal Approval workflow is waiting for its durable event to synchronize `FitoutSubmittal.status`, the project detail polls only for that short mismatch window and stops as soon as the statuses agree.

## PRIMARY DOMAIN

Fitout, consuming the existing Files and Approvals contracts.

## AFFECTED JOURNEYS

BP-003 Contract-to-Fitout-to-Handover; GS-05 Contract → Fitout; GS-08 Fitout → Handover; GS-09 Cross-Mall denial; GS-10 Tenant isolation; GS-15 retry after commit/network loss.

## UPSTREAM IMPACT

Consumes existing `UnifiedDocument(entityType='FITOUT_SUBMITTAL')`, `ApprovalWorkflow`, and outbox-driven Fitout submittal status updates. No producer or persistence behavior changes.

## DOWNSTREAM IMPACT

Fitout project Documents and the dedicated Fitout approval queue are updated. Approval decisions, document gates, project-stage advancement, Unit status, SLA, notifications, reports, and exports are checked but not changed.

## DATA OWNERSHIP IMPACT

Read-only presentation correction. No direct writes to Files-, Approvals-, or Fitout-owned data are added.

## STATE MACHINE IMPACT

No transition is added or reordered. Existing `SUBMITTED → IN_PROGRESS → APPROVED/REJECTED` remains authoritative. This change only keeps the UI synchronized during the outbox delivery window.

## FINANCIAL IMPACT

N/A — no money or formula surface.

## CURRENCY IMPACT

N/A — no monetary value, currency inference, conversion, or aggregation.

## MALL/COMPANY IMPACT

The existing authenticated file route and Mall resolver remain authoritative. No cross-Mall visibility or Company behavior changes.

## TENANT IMPACT

An authorized Tenant can view its own submittal attachment through the existing ownership checks. No additional Tenant capability is granted.

## AUTHORIZATION IMPACT

No endpoint or permission change. The corrected route retains per-document role, Tenant ownership, current-approver capability, and Mall-access enforcement.

## REPORTING IMPACT

N/A — no metric or reporting data changes.

## TRANSACTION IMPACT

N/A — the shared Approval transaction and durable outbox remain unchanged. Polling observes committed state only.

## EVENT/JOB IMPACT

No event or job behavior changes. The existing `approval.workflow.completed` and `.rejected` outbox events remain the source of Fitout status synchronization.

## DOCUMENT IMPACT

Existing uploaded bytes, metadata, storage paths, versions, and download counters remain unchanged. Only the frontend route is corrected from the `FitoutDocument` family to the `UnifiedDocument` family.

## API IMPACT

No API shape or route changes. Existing frontend consumers switch to the already-supported `/files/documents/:id` route.

## MIGRATION

N/A — no schema or data migration.

## BACKWARD COMPATIBILITY

Existing submittals and attachments become viewable without rewriting records. Existing workflow/outbox records continue processing unchanged.

## GOLDEN E2E SCENARIOS

GS-05, GS-08, GS-09, GS-10, and GS-15 are relevant. Focused frontend tests prove route selection and the bounded status-sync condition; existing backend Files and Fitout tests cover authorization and lifecycle behavior.

## RECONCILIATION

For a terminal Fitout Approval workflow, the displayed submittal status must converge to the corresponding `APPROVED` or `REJECTED` state. Attachment IDs shown by Fitout must resolve through the same UnifiedDocument row stored at upload.

## ROLLBACK

Revert this frontend-only CR. No data rollback is required.

## OPEN BUSINESS QUESTIONS

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** whether approval of all required documents should also auto-advance `FitoutProject.status`. Current System Truth and training require an explicit adjacent-stage action because later stages can trigger `Unit.status`; this CR does not change that business rule.

## Severity classification

Priority: P1 — Tier 2 Fitout presentation, retaining Tier 0 file authorization.

## Gate results

- Frontend focused Fitout presentation: 2 suites / 21 tests PASS.
- Existing backend Files/Fitout regression: 4 suites / 90 tests PASS.
- Backend typecheck: PASS.
- Frontend typecheck and production build: PASS.
- `git diff --check`: PASS.
- Browser visual/runtime gate: NOT EXECUTED — no local browser session was available.

## Sign-off

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Implementation | Codex `/root` | 2026-09-08 | COMPLETE — engineering gates PASS; project-stage automation remains a separate business decision |
