# CR-GOLDEN-FITOUT-APPROVAL-WORKSPACE — Fitout Approval Decision Area

## CHANGE ID

CR-GOLDEN-FITOUT-APPROVAL-WORKSPACE

## BUSINESS REASON

Fitout submittals already create authoritative shared Approval Workflows, but
approvers currently receive rows designed for Proposals. The Fitout entity has
no Proposal relation, so the Approval page shows an empty or context-free file
and the approver cannot safely inspect the submitted document before deciding.

## CURRENT BEHAVIOR

- `FITOUT_SUBMITTAL` workflows enter the generic pending Approval query.
- Pending/workflow responses hydrate Proposal context only.
- The Approval page labels the queue as Proposal and renders detail only when a
  Proposal exists; Fitout rows therefore have no usable business context.
- Approve/reject still uses the correct shared workflow engine.

## EXPECTED BEHAVIOR

- Add a separate Fitout approval area inside the existing Approval Decision
  Center; do not create a second approval engine or route architecture.
- Filter Proposal and Fitout queues explicitly by authoritative `entityType`.
- A Fitout row/detail exposes the existing authoritative context required to
  decide: submittal title/form type/revision/status, tenant/brand, Unit/floor,
  Fitout stage, submitter, submitted/due dates, attachments, current approval
  step and full decision log.
- Approve/reject continues through the existing `/approvals/:stepId/*` actions,
  role/assignee checks, Mall scope, Serializable transaction and outbox events.
- Existing Proposal, Booking-price and history areas remain behaviorally intact.
- Fitout history navigation is explicitly out of scope; this CR addresses the
  current actionable decision queue and dossier only.

## PRIMARY DOMAIN

Approvals (Tier 1 shared workflow surface), consuming Fitout-owned read context
(Tier 2) and Files read links (Tier 0 authorization overlay).

## AFFECTED JOURNEYS

- BP-003 / GS-05: Contract → Fitout.
- GS-08: Fitout → Handover, because approved Fitout submittals satisfy document
  gates.
- GS-09: Cross-Mall denial.
- GS-10: Tenant isolation.

## UPSTREAM IMPACT

Consumes existing `ApprovalWorkflow(entityType='FITOUT_SUBMITTAL')`,
`FitoutSubmittal`, `FitoutProject`, `FitoutFormType`, Tenant, Unit/Floor,
ApprovalStep and `UnifiedDocument(entityType='FITOUT_SUBMITTAL')` records. It
does not change creation, revision, upload or workflow generation.

## DOWNSTREAM IMPACT

Approval UI and its pending-count query consume the additive context. Existing
approve/reject events continue to drive `FitoutSubmittalService` status updates
and Fitout document gates unchanged. Dashboard, Reports, Billing and Contract
outputs are checked but not changed.

## DATA OWNERSHIP IMPACT

Approvals writes only ApprovalWorkflow/ApprovalStep through its existing service.
The new surface reads Fitout and UnifiedDocument context; it performs no direct
write to Fitout- or Files-owned entities.

## STATE MACHINE IMPACT

N/A — no status, transition, ordering or decision semantics change. Existing
Approval and FitoutSubmittal state machines remain authoritative.

## FINANCIAL IMPACT

N/A — no amount, calculation, aggregation, export or financial action changes.

## CURRENCY IMPACT

N/A — the Fitout approval context contains no new money surface. Existing
Proposal financial rendering is unchanged. No currency inference, conversion or
mixed-currency aggregation is introduced.

## MALL/COMPANY IMPACT

Pending queues remain constrained by the workflow Mall resolver through the
canonical Fitout fallback `fitoutSubmittal.project.unit.mallId ??
fitoutSubmittal.project.unit.floor.mallId`. For Fitout workflows, active ADMIN is
the only global exception; CEO and every other valid approver require active
project-Mall access. Existing Proposal cross-Mall behavior remains unchanged.
Negative cross-Mall and unresolved-Mall tests are required. No Company model or
cross-Mall role expansion is introduced.

## TENANT IMPACT

N/A — TENANT is not granted access to the Approval Decision Center or approval
actions. Tenant ownership data is displayed only to existing authorized
approvers within the project Mall.

## AUTHORIZATION IMPACT

No new route. The additive case-sensitive `entityType` list filter is
allow-listed to `PROPOSAL`/`FITOUT_SUBMITTAL`; unsupported values return 400
before querying. Omitted `entityType` preserves the existing combined queue for
shared badges.

Fitout list/detail/action authorization is entity-aware and fail-closed:

- TENANT is denied.
- Active ADMIN is the global exception.
- Other users require active project-Mall access.
- Fitout dossier detail requires the current actionable step's exact role and,
  when assigned, exact assignee. Earlier/later/terminal steps do not grant
  dossier capability.
- Approve/reject retains and revalidates the existing current-step,
  role/assignee, earlier-step and workflow-state guards inside the Serializable
  decision transaction.
- Proposal workflow authorization remains behaviorally unchanged.

Fitout attachment download gains a narrow capability-based read path: existing
Fitout staff access remains unchanged, and an otherwise valid current actionable
Fitout approver may read the attachment only after exact workflow relation,
role/assignee and project-Mall validation. This does not broadly grant Files
access to Approval roles. TENANT's existing own-project rule is unchanged. UI
separation is not treated as security.

## REPORTING IMPACT

N/A — no reporting metric or dashboard formula changes.

## TRANSACTION IMPACT

N/A for new reads. Decisions continue through the existing Serializable
Approvals transaction. No new multi-step writes are introduced.

## EVENT/JOB IMPACT

N/A — existing `approval.workflow.completed`/`rejected` outbox events and
step-advanced notifications are unchanged.

## DOCUMENT IMPACT

Read-only display/download of existing Fitout submittal attachments is added to
the decision sheet. API projections contain safe metadata only (`id`, file name,
MIME type, size, version/latest and upload time); raw `filePath` and storage URLs
are never returned. Downloads use the existing authenticated Files endpoint.
Upload, versioning, retention and approval immutability are unchanged.

## API IMPACT

Additive only:

- `GET /approvals/pending` accepts an allow-listed `entityType` filter and
  rejects invalid/lowercase/unknown values with 400.
- Pending rows and `GET /approvals/:workflowId` hydrate the matching existing
  FitoutSubmittal context and attachment metadata when the workflow entity type
  is `FITOUT_SUBMITTAL`.

Fitout filters are entity-specific: search covers submittal/form/Tenant/Unit;
floor and Unit resolve through the Fitout project; Proposal filters remain
unchanged and `leaseTermType` remains Proposal-only. Proposal policy-reason
enrichment runs only for Proposal workflows, never for Fitout step-name/role
collisions. Fitout hydration uses explicit minimal selects and verifies
`workflow.entityType`, `workflow.entityId` and the related submittal id match;
orphan/mismatched/unresolved context fails closed without attachment access.

Existing routes, request bodies and Proposal response fields remain compatible.

## MIGRATION

N/A — no schema, database migration or data rewrite.

## BACKWARD COMPATIBILITY

Default pending behavior remains the combined authorized queue so shared badges
and notifications do not lose Fitout work. The Approval page opts into explicit
Proposal/Fitout filters. Existing in-flight workflows remain readable.

## GOLDEN E2E SCENARIOS

- Authorized Operation/Mall Director sees only current actionable Fitout steps,
  opens complete project/submittal/document context and approves through the
  existing workflow.
- Rejection requires the existing reason and returns the submittal to the
  existing rejected/resubmit journey.
- Proposal and Booking-price approval surfaces remain unchanged.
- Wrong role, wrong Mall and TENANT cannot read or decide the workflow.
- A valid non-Fitout-role approver configured on the current Fitout step can
  inspect attachments only when exact role/assignee and project-Mall access all
  match; unrelated/later-step users cannot.
- Proposal queue, detail, policy reason and existing cross-Mall behavior regress
  neither response shape nor authorization.

## RECONCILIATION

Verify Fitout submittal title, revision, status, project stage, Tenant, Unit,
attachments and approval steps match the Fitout Documents workspace for the same
IDs. No financial reconciliation applies.

## ROLLBACK

Revert the Approval/Fitout presentation and additive hydration commit. No data
rollback is required.

## OPEN BUSINESS QUESTIONS

None. The requested separate Fitout approval area is presentation/read-context
work; decision authority and workflow semantics are provable from current code,
tests and System Truth and are explicitly preserved.

---

## Severity classification

Priority: P0 worst-case confidentiality if Mall scoping regresses — Tier 0
authorization overlay / Tier 1 Approval presentation.

## Gate results

- BA / Architecture pre-code review: APPROVED.
- Backend / Security pre-code review: APPROVED.
- Independent post-implementation integration review: APPROVED after the
  reject authorization-order, ADMIN Mall-filter and stage-presentation
  corrections were verified.
- Backend focused Approvals/Fitout/Files: PASS (15 suites / 180 tests).
- Backend full regression: PASS (107 suites / 757 tests).
- Frontend focused Approval/Fitout: PASS (17 tests in the implementation gate;
  reviewer subset 8 tests).
- Frontend full regression: PASS (49 files / 285 tests).
- Backend production build: PASS.
- Frontend TypeScript and production build: PASS.
- `git diff --check`: PASS (line-ending conversion warnings only).
- Schema/migration/database changes: NONE.
- Approval/Fitout business state or decision semantics changed: NO.

## Sign-off

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Fitout Functional | ERP Team BA / Architect | 2026-08-25 | APPROVED |
| Solution / Security Architecture | ERP Team Backend / Security | 2026-08-25 | APPROVED |
| Implementation / QA | Codex + ERP Team QA | 2026-08-25 | PASS |
