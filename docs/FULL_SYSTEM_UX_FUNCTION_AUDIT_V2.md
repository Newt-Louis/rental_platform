# Full System Function & UX/UI Audit — V2

## Executive assessment

The platform has broad functional coverage and can support a complete leasing
lifecycle on a single application instance. Its next maturity step is not adding
more isolated screens. The priority is to turn the existing modules into one
coherent ERP with canonical data, durable workflows, consistent UX and observable
operations.

Current assessment:

| Dimension | Score /5 | Summary |
|---|---:|---|
| Functional breadth | 4 | Strong leasing, Fitout, billing, tenant and analytics coverage |
| End-to-end cohesion | 2 | Cross-stage workflow relies on local events and separate services |
| UX consistency | 3 | Navigation is strong; feedback and terminology remain fragmented |
| Data integrity | 2 | Important multi-write processes are not consistently transactional |
| Operability | 2 | Suitable for one instance; scheduler, backup and observability are immature |
| Enterprise/HA readiness | 2 | No distributed job ownership, outbox or proven DR |

Audit inventory:

- 28 explicit frontend routes and 40 page components.
- Approximately 393 backend REST endpoints.
- 24 business modules.
- 17 scheduled jobs.
- Approximately 100 Prisma models/enums.

## ERP target architecture

The system should expose one durable business process:

```text
Lead
  → Space/Booking
  → Proposal
  → Approval
  → Contract
  → Fitout/Handover
  → Occupancy/Tenant Operation
  → Billing/Payment
  → SAP
  → Renewal/Termination
```

Each transition should have:

- one canonical entity owner;
- explicit prerequisites and resource authorization;
- atomic state change or transactional outbox;
- retry and compensation behavior;
- a named next actor and SLA;
- user-visible history;
- operational metrics and alerts.

## Module improvement matrix

### Dashboard and reporting

Current functions:

- role dashboard, cross-mall dashboard, Deal Pipeline, Pipeline Statistics;
- Reports, Analytics, CRM Overview and compliance exports.

Main gaps:

- Multiple screens calculate or present overlapping pipeline, occupancy, revenue
  and multi-mall KPIs.
- Users cannot easily distinguish operational dashboards, management analysis and
  statutory/finance reports.
- Most report queries have no explicit error/retry state.
- KPI definitions may drift because several services calculate directly from OLTP.

Recommendations:

1. Create a KPI dictionary with formula, owner, refresh cadence and source table.
2. Consolidate information architecture into:
   - Operational Dashboard;
   - Commercial Performance;
   - Finance & Compliance Reports.
3. Use curated snapshots/read models for management reporting.
4. Add “last refreshed”, data scope and active Mall indicators.
5. Standardize report error, retry, export and no-data states.

Priority: P2. Value/Effort: 5/4.

### Spaces, categories, slots and booking

Current functions:

- mall/floor/zone/unit management;
- map/editor, media, merge/split, import, comparison and availability;
- long-term unit booking and short-term slot booking.

Main gaps:

- Unit and booking state transitions are spread across services.
- UnitBooking and SlotBooking are separate concepts without a unified reservation
  vocabulary.
- BookingsPage is a high-complexity monolith with many dialogs and controls.
- Some map editors still use native browser confirmation.

Recommendations:

1. Introduce a canonical `SpaceReservation` concept with long-term and short-term variants.
2. Implement a state machine for unit availability and reservation transitions.
3. Wrap booking → proposal conversion in one transaction/outbox boundary.
4. Split the UI into reservation queue, unit availability and pricing workspaces.
5. Replace native confirms with the shared ERP confirmation pattern.

Priority: P2. Value/Effort: 5/4.

### CRM, customer and tenant master data

Current functions:

- lead pipeline, activity, follow-up, assignment, bulk actions and customer records;
- tenant conversion/linking and tenant detail hub.

Main gaps:

- Lead, Customer and Tenant repeat identity/contact/company fields.
- No visible duplicate detection, merge policy or golden-record ownership.
- CRM is the largest frontend monolith and can silently show empty widgets on query failure.
- Terminology mixes Lead, Customer, Brand and Tenant without explaining lifecycle.

Recommendations:

1. Define canonical Party/Organization/Contact master data.
2. Add duplicate detection by tax ID, phone, email and normalized company/brand name.
3. Provide controlled conversion:
   `Lead → Qualified Customer → Contracted Tenant`.
4. Split CRM into Lead Workspace, Customer 360 and Activity/Follow-up views.
5. Display record source, linked entities and conversion history.

Priority: P2. Value/Effort: 5/3.

### Proposal and approval

Current functions:

- pricing, services, scenarios, versions, document editor and PDF;
- configurable approval policy, multi-step decisions and deal scoring.

Main gaps:

- Approval step and workflow updates are not consistently transactional.
- In-process events can be lost if the process crashes.
- Scenario/version/editor state needs clearer saved, submitted and published status.
- Concurrent approval can produce race conditions.

Recommendations:

1. Use transactional workflow transition with optimistic versioning.
2. Publish workflow events through a transactional outbox.
3. Show next approver, elapsed SLA and blocking conditions in the UI.
4. Separate “Lưu bản nháp”, “Gửi phê duyệt” and “Phát hành”.
5. Add journey tests for concurrent approve/reject attempts.

Priority: P2. Value/Effort: 5/3.

### Contracts

Current functions:

- template/clause rendering, amendments, files/signing, events and termination.

Main gaps:

- Contract status, event history and downstream Fitout creation are not one atomic process.
- Contract activation is connected through a local event rather than durable orchestration.
- Six or more detail tabs create high cognitive density.
- Billing kickoff, unit occupancy and Fitout are not presented as one activation checklist.

Recommendations:

1. Add a Contract Activation workflow:
   signature → effective date → unit occupancy → Fitout → billing schedule → SAP mapping.
2. Use outbox/saga with retry and compensation.
3. Add an activation readiness panel and missing-prerequisite explanation.
4. Reorganize detail into Summary, Documents, Commercial Terms, Changes and Lifecycle.
5. Make termination settlement and final billing explicit.

Priority: P2. Value/Effort: 5/4.

### Fitout

Current functions:

- project dashboard, stage gates, checklists, documents, submittals, D-Map/issues;
- daily reports, Gantt/milestones, contractors/access, risk and change orders.

Main gaps:

- Project detail has approximately 15 tabs and risks information overload.
- Configuration APIs are not clearly restricted to Admin-level roles.
- Tenant-scoped access for submittal/issues/daily-report resources needs resource lookup.
- Risk and change-order numbering uses count + 1 and can race.
- D-Form remains form-type configuration rather than a full schema-driven inspection engine.

Recommendations:

1. Reorganize into Overview, Documents, Field Control, Schedule, Risk/Cost and Administration.
2. Add role-specific default views for Tenant, Contractor, Operation and Director.
3. Restrict pipeline/gate/SLA/form configuration to explicit administration permissions.
4. Generate business numbers through sequences or unique retry-safe allocation.
5. Build schema-driven inspection forms with signatures, evidence and reusable templates.

Priority: P2. Value/Effort: 5/3.

### Tickets and maintenance

Current functions:

- ticket CRUD, assignment, comments, photos, SLA/escalation, rating and maintenance schedules.

Main gaps:

- Status and assignment can be changed through several paths.
- Update DTOs are broad and weaken workflow control.
- Maintenance is not a complete work-order process with vendor, labor, parts and cost.
- SLA notifications do not use a durable delivery ledger.

Recommendations:

1. Introduce explicit ticket commands and allowed transitions.
2. Evolve maintenance into Work Orders with asset/vendor/cost/evidence.
3. Add technician queue, planned/actual work and completion acceptance.
4. Move escalation notifications to outbox/retry.
5. Improve mobile field layout and offline/photo workflow.

Priority: P2. Value/Effort: 4/3.

### Sales turnover

Current functions:

- tenant sales submission, approval/dispute, audit and revenue-share calculation.

Main gaps:

- Submitted unit ownership is not fully proven against the active tenant contract.
- Sales update and audit trail are not consistently transactional.
- Relationship between tenant sales, percentage rent and invoices is not obvious in the UI.

Recommendations:

1. Validate tenant → active contract → unit before accepting sales.
2. Make submission and audit atomic.
3. Display reporting deadline, approval owner and resulting revenue-share invoice.
4. Add anomaly detection against historical sales and operating days.

Priority: P2. Value/Effort: 5/2.

### Billing, AR and finance

Current functions:

- billing schedules, invoice lifecycle, lines, payment, reversal, void;
- AR aging, dunning, penalty, collection KPIs and revenue share.

Main gaps:

- Invoice creation, payment/balance update, reversal/void and audit use weak multi-write boundaries.
- Concurrent billing jobs can create duplicate invoices.
- Missing production finance concepts: accounting period close, credit note, deposit,
  tax/e-invoice lifecycle and immutable subledger.
- UI terminology mixes English and Vietnamese across eleven tabs.

Recommendations:

1. Add an atomic finance subledger and unique invoice business key.
2. Implement atomic schedule claim before invoice generation.
3. Add accounting period close and controlled adjustment/credit-note flows.
4. Standardize terms:
   - AR Aging → Tuổi nợ;
   - Dunning → Nhắc nợ;
   - Collection KPI → Hiệu quả thu hồi;
   - Billing Schedule → Lịch thu phí.
5. Reorganize UI into Invoices, Collections, Billing Rules and Finance Control.

Priority: P1/P2. Value/Effort: 5/4.

### SAP integration

Current functions:

- customer/invoice sync, mapping, logs, retries and reconciliation.

Main gaps:

- Missing payment, vendor, GL, chart-of-account and cost-center integration.
- No durable outbox/distributed lock for exactly-once delivery.
- OAuth lacks explicit timeout; retries lack backoff/jitter/DLQ.
- Operational UI mixes finance actions with technical Endpoints diagnostics.

Recommendations:

1. Create integration outbox with deterministic business keys.
2. Add retry schedule, dead-letter queue and operator resolution actions.
3. Move Endpoints/configuration to Admin/Integration settings.
4. Translate labels:
   Entity Mapping → Ánh xạ dữ liệu;
   Integration Log → Nhật ký tích hợp.
5. Expand reconciliation to payments and GL postings.

Priority: P2. Value/Effort: 5/4.

### Notifications, email and announcements

Current functions:

- in-app notifications, email and Mall announcements.

Main gaps:

- Email is often sent inline without durable retry or delivery history.
- No template versioning, bounce/delivery status or user preference center.
- Notification idempotency sometimes depends on message text.

Recommendations:

1. Add NotificationOutbox and DeliveryAttempt models.
2. Use template codes/version and stable business idempotency keys.
3. Add email/SMS/in-app preference and escalation policy.
4. Monitor delivery failure and dead-letter volume.

Priority: P2. Value/Effort: 4/3.

### AI

Current functions:

- leasing chat and floor-plan analysis/application.

Main gaps:

- Limited prompt/response audit, cost tracking and PII governance.
- No consistent timeout/circuit breaker.
- Applying floor-plan analysis requires stronger preview and confirmation.

Recommendations:

1. Add AI request ledger with model, tokens, cost, data scope and outcome.
2. Redact or classify sensitive fields before provider calls.
3. Make floor-plan apply a reviewed draft → approval → apply workflow.
4. Add timeout, rate limiting and circuit breaker.

Priority: P2/P3. Value/Effort: 3/3.

### Administration and audit

Current functions:

- users, Mall access, categories, approval policy, branding, configuration and audit logs.

Main gaps:

- Admin page is a large monolith with technical terminology and many mutations.
- Audit log is asynchronous fire-and-forget and lacks tamper evidence.
- Shared configuration permissions are not granular enough.

Recommendations:

1. Split Admin into Users & Access, Commercial Rules, Operations Rules,
   Integrations and Branding.
2. Create explicit permissions rather than broad role lists for configuration actions.
3. Add immutable audit retention/export, request correlation and before/after diff.
4. Require reason and elevated confirmation for high-impact configuration changes.

Priority: P2. Value/Effort: 4/3.

## Cross-system UX/UI findings

### Highest-complexity screens

| Screen | Approximate complexity signal | Recommendation |
|---|---|---|
| CRM | 2,500 lines, many queries/dialogs/actions | Split into Lead and Customer workspaces |
| Bookings | 2,200 lines, 17 dialogs | Split long-term/short-term/reservation queue |
| Admin | 1,390 lines, 18 mutations | Convert tabs to subroutes and permission domains |
| Fitout | 15 project tabs | Group into five task-oriented workspaces |
| Billing | 11 tabs | Group by invoice, collection, rules and control |
| Contracts/Tenants | Many detail tabs | Use summary-first progressive disclosure |

### Shared UI work still required

- Consolidate `ConfirmDialog` and `ConfirmActionDialog`.
- Adopt or remove currently underused `PageHeader`, `EmptyState` and `LoadingButton`.
- Create one `AsyncState`/`QueryBoundary` and migrate Reports, Approvals,
  Contracts, SAP, Sales, Dashboard and CRM first.
- Create a responsive scrolling tab primitive.
- Add a Vietnamese ERP terminology dictionary.
- Add route-level axe and keyboard smoke tests.

## Duplicate or overlapping functions

| Overlap | Decision required |
|---|---|
| Lead / Customer / Tenant | Define canonical master data and conversion ownership |
| UnitBooking / SlotBooking | Define unified reservation vocabulary and shared rules |
| FitoutDocument / UnifiedDocument / attachments | Define one document register and version model |
| Dashboard / Pipeline Stats / Deal Pipeline / Reports / Analytics | Define report purpose and KPI source of truth |
| Contract-expiry scheduler implementations | Delete inactive duplicate after reference verification |
| Confirmation components | Consolidate into one shared component |

## Operations roadmap

### Release blockers before HA production

1. Prevent duplicate billing with atomic claim and unique business keys.
2. Run scheduled jobs in a dedicated worker with distributed locks.
3. Move email/SAP/notification side effects to a transactional outbox.
4. Automate encrypted off-host database and upload backups; prove restore.
5. Define expand/contract migration policy and compatibility gate.
6. Alert when Redis degradation weakens logout/token revocation.

### Observability baseline

- request/correlation ID;
- structured HTTP logs with rotation and centralized collection;
- Prometheus/OpenTelemetry metrics;
- scheduler job-run ledger and heartbeat;
- alerts for failed/missed jobs, email/SAP failures and audit-write failures;
- readiness components for DB, Redis, storage and schema version;
- SLOs for p95 latency, error rate and critical ERP journey completion.

## Prioritized delivery plan

### Sprint A — Integrity and reliability

- Atomic billing generation.
- Distributed scheduler lock and job ledger.
- Transactional outbox foundation.
- Resource-level tenant/Mall authorization.

### Sprint B — ERP workflow orchestration

- Durable process instance across Contract activation, Fitout and Billing.
- Approval concurrency control.
- Contract activation readiness checklist.
- Cross-stage SLA and compensation.

### Sprint C — UX consistency

- AsyncState/QueryBoundary adoption.
- Vietnamese terminology migration.
- Consolidated confirmation and responsive tabs.
- Page headers, empty states and retry patterns across all functions.

### Sprint D — Information architecture

- Consolidate reporting surfaces and KPI definitions.
- Split CRM, Bookings and Admin monoliths.
- Simplify Fitout/Billing/Contract/Tenant tab structures.

### Sprint E — Finance and integrations

- Finance subledger, period close, credit notes and deposits.
- SAP outbox/retry/DLQ and expanded mappings.
- Payment/GL reconciliation.

### Sprint F — Enterprise operations

- Backup/restore automation and RPO/RTO evidence.
- Metrics, tracing, centralized logs and alerting.
- Isolated UAT role-based E2E and load tests.
- Dependency remediation and security operations cadence.

## Recommended success metrics

- Critical journey completion rate ≥ 99.5%.
- No duplicate invoice or duplicate scheduled side effect.
- p95 interactive page load < 2.5 seconds on corporate network.
- p95 API latency < 500 ms for transactional endpoints.
- 100% critical queries have loading/error/retry states.
- 100% destructive actions require contextual confirmation.
- 100% configuration changes carry actor, reason and before/after diff.
- Scheduled jobs have heartbeat, ownership and durable result history.
- Monthly backup restore drill meets approved RPO/RTO.
