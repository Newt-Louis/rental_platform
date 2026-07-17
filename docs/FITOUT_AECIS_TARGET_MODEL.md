# Fitout Project Control — AECIS-aligned Target Model

## Product objective

Transform Fitout from a status/checklist page into a project-control workspace for
Tenant, Mall Operation, Consultant and Contractor users. The design follows the
publicly documented AECIS capability groups while retaining THISO's leasing,
contract, unit-handover and tenant-opening workflow.

## Capability mapping

| AECIS capability | THISO implementation | Target state |
|---|---|---|
| Dashboard | Portfolio and project dashboards | Enhance with risk, cost and overdue indicators |
| Issue | Defect/NCR/safety issues, comments and photos | Keep; add filters, ownership and aging |
| Submittal | Configurable form types, revisions and approval workflow | Keep; strengthen document register UX |
| D-Map | Issue pins on unit/floor plan | Keep; provide workspace shortcut |
| Risk | Not previously available | Add risk register, scoring, mitigation and ownership |
| Daily Report | Workforce, progress descriptions and photos | Keep; consolidate by project/date |
| D-Form | Configurable fitout form types | Evolve toward schema-driven inspection forms |
| Milestone | SLA milestones and WBS/Gantt | Keep; expose baseline/revised/actual variance |
| Cost/Change Order | Not previously available | Add change orders, cost impact and decision trail |

Reference: AECIS publicly describes these nine feature groups at
https://aecis.com/features.

## Project workspace information architecture

1. Overview — health, stage, schedule, open issues, risk exposure and cost variance.
2. Submittals — document register, revision, approval status and distribution.
3. Issues & D-Map — defect/NCR/safety issue list and spatial plan.
4. Schedule — milestones and detailed Gantt/WBS.
5. Daily reports — field progress, workforce and photo evidence.
6. Risk — probability × impact score, mitigation, owner and due date.
7. Cost & change — original value, proposed/approved variation and status.
8. Inspections/forms — configurable forms, checklist and evidence.
9. Contractors/access — contractor records and worker entry/exit.

## Roles and responsibility

| Role | Primary actions |
|---|---|
| Tenant | Submit documents, respond to comments, view issues, submit change requests |
| Contractor | Daily reports, evidence, issue response, schedule updates |
| Operation | Coordinate workflow, assign owners, inspections, issue/risk management |
| Mall Director | Gate overrides, high-risk acceptance and change-order approval |
| Finance | Validate cost impact and approved variation |
| Admin | Configure stages, forms, gates, SLA and permission policy |

## Workflow controls

- Every submittal, issue, risk and change order belongs to one FitoutProject.
- Status transitions are explicit and recorded in the platform audit log.
- High/critical risks require an owner, mitigation action and target date.
- Change orders separate requested, reviewed and approved values.
- Project opening gates can use approved documents, closed critical issues,
  accepted critical risks and approved change orders as configurable criteria.
- Tenant users can only access projects belonging to their tenant.

## Delivery sequence

1. Risk Register and Cost/Change Order data model, API and project summaries.
2. Project workspace UI with separate responsibility-focused tabs.
3. Schema-driven D-Form inspections and reusable form templates.
4. Enhanced D-Map annotations and mobile field workflow.
5. Notifications, escalation, export and management KPIs.

## Acceptance criteria

- A project manager can understand project health without opening individual records.
- Every overdue/high-impact item has a named owner and due date.
- A submitted drawing can be traced through revisions and approvals.
- Defects can be located on the plan and closed with evidence.
- Schedule variance and cost variance are visible together.
- Tenant, contractor and internal users see only actions allowed for their role.
