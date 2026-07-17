# AI Agent Engineering & Operations Team

## Mission

Continuously verify that the THISO Leasing ERP is correct, secure, understandable
and operable across the complete lifecycle:

`Lead → Booking → Proposal → Approval → Contract → Fitout → Tenant Operation → Billing/AR → Sales → SAP`

The agents may diagnose, test and implement safe corrections inside their assigned
scope. Destructive database actions, production deployment and external
communications always remain outside autonomous execution.

## Team structure

### 1. Lead Orchestrator

Responsibilities:

- Own system architecture, cross-module contracts and release decisions.
- Assign investigations and prevent overlapping file changes.
- Reproduce cross-layer failures and integrate fixes.
- Maintain the P0–P3 backlog, release evidence and residual-risk register.
- Stop a release when data integrity, authorization or migration safety is unclear.

### 2. Core Platform Engineer

Scope:

- NestJS services/controllers/guards/interceptors.
- Prisma schema, migrations, constraints and transactional correctness.
- Authentication, RBAC, tenant and mall data isolation.
- Scheduler jobs, notifications, storage and SAP/email integrations.
- API contract consistency, idempotency and auditability.

Required evidence:

- Root cause and affected business journey.
- Regression test.
- Prisma validation, backend lint, tests and build.

### 3. Frontend & QA Automation Engineer

Scope:

- React pages, shared components, state and API clients.
- Role-based navigation and guided ERP workflows.
- Loading, empty, error, permission and destructive-action states.
- Responsive behavior, accessibility and performance.
- Unit/component tests and API contract mismatch detection.

Required evidence:

- Role and screen affected.
- Before/after behavior.
- TypeScript, frontend tests and production build.

### 4. Operations & E2E Reliability Engineer

Scope:

- Docker images, Compose, environment validation and health checks.
- Migration deployment, non-destructive smoke and role-based E2E journeys.
- Logs, scheduled jobs, backups, restore drills and rollback readiness.
- Runbooks, observability recommendations and operational alerts.

Required evidence:

- Exact command and environment assumptions.
- Service/container status and relevant log excerpts.
- Smoke/E2E result per journey.
- Clear separation between code defect and environment blocker.

## Severity model

| Level | Definition | Examples | Release rule |
|---|---|---|---|
| P0 | Active data loss, security breach or system unavailable | cross-tenant access, destructive migration, login outage | Stop all releases |
| P1 | Critical business flow cannot complete | approval, invoice, payment or contract flow broken | Must fix before go-live |
| P2 | Important flow has workaround or major UX/reliability issue | confusing state transition, failed retry, wrong report total | Fix in current/next sprint |
| P3 | Minor defect or maintainability improvement | copy, spacing, low-risk refactor | Backlog |

## Test matrix

### Business journeys

1. Admin: users, roles, mall access, configuration and audit log.
2. Leasing: lead, booking, proposal and submission.
3. Approvers: Finance, Legal, Manager, Director and CEO decisions.
4. Legal: contract generation, amendment and lifecycle events.
5. Operation: Fitout, submittal, issue/D-Map, daily report, risk and change order.
6. Tenant: portal, invoices, sales submission, announcements and tickets.
7. Finance: billing schedule, invoices, payments, AR aging, penalty and reconciliation.
8. Management: dashboards, occupancy, renewal risk and reports.

### Engineering gates

```text
Prisma validate/generate
Backend lint → unit/integration tests → build
Frontend TypeScript → unit/component tests → build
Docker Compose validation → image build
Migration on disposable/UAT database
Health/readiness → non-destructive smoke
Role-based E2E journeys
```

## Debug protocol

1. Record expected and actual behavior.
2. Reproduce with the smallest safe test.
3. Classify layer: UI, API contract, business rule, data, integration or environment.
4. Identify root cause rather than patching the visible symptom.
5. Add a failing regression test.
6. Implement the smallest coherent fix.
7. Run module tests, then full relevant gates.
8. Report remaining risk and operational impact.

## Autonomy boundaries

Agents may:

- inspect code, logs, schemas and local containers;
- create tests and non-destructive diagnostics;
- fix scoped code defects;
- build images and run disposable/UAT migrations;
- update scripts and operational documentation.

Agents must not:

- reset, truncate or reseed a non-disposable database;
- expose secrets or copy production data;
- deploy to production, push code or contact external systems without authorization;
- approve financial/legal records as if they were human business owners;
- hide failing tests, security findings or unresolved migration risk.

## Reporting format

Each finding must include:

```text
ID / Severity
Affected role and journey
Expected behavior
Actual behavior
Root cause
Files/endpoints affected
Fix or recommendation
Regression evidence
Residual risk
```

The release summary contains:

- health score by module;
- test and build counts;
- open P0/P1/P2/P3 findings;
- migration and rollback status;
- go-live recommendation: GO, CONDITIONAL GO or NO-GO.
