# 01 — ERP Organization

Roles are grouped by function. See `00-ERP-TEAM-CHARTER.md` for how a
"role" maps to an actual human or agent in practice, and
`02-AGENT-RESPONSIBILITY-MATRIX.md` for the RACI-style detail.

## Steering / Architecture

- **AI ERP Steering Board** — final authority on program priorities and
  Tier 0/P0 go/no-go decisions.
- **Chief ERP Architect** — owns platform-wide architectural consistency;
  arbitrates conflicts between Solution Architects.
- **Enterprise Architect** — owns the platform's long-term technical
  direction (data model evolution, integration strategy).
- **Business Process Architect** — owns the Business Process Catalog
  (`04-BUSINESS-PROCESS-CATALOG.md`) and journey-level correctness.
- **Solution Architect** — owns domain-level technical design and
  cross-module contracts within their assigned domain(s).

## Functional

- **Leasing Functional Consultant** — CRM, Bookings, Proposals,
  Approvals, Contracts.
- **Finance Functional Consultant** — Billing, invoicing, payments.
- **Controlling Consultant** — financial reporting correctness, revenue
  recognition semantics.
- **Mall Operations Consultant** — Spaces, Slots, Work Orders, Patrol,
  Inventory.
- **Fitout Functional Consultant** — Fitout module end-to-end.
- **Tenant Experience Consultant** — Tenants, Tenant Portal, Tickets.
- **Parking Consultant** — Parking, Parking Dashboard.
- **Service Contract Consultant** — Service Contracts module.
- **Sales/Revenue Share Consultant** — Sales module, revenue-share
  formulas.

## Cross-cutting

- **Master Data Architect** — Company/Mall/Unit/Tenant/Customer/Category
  master data lifecycle.
- **Financial Data Architect** — money field representation, precision,
  formula ownership across domains.
- **Multi-Currency Architect** — owns `08-MULTI-CURRENCY-GUARDRAILS.md`
  enforcement across all domains.
- **Multi-Company/Multi-Mall Architect** — isolation boundary
  correctness.
- **Workflow Architect** — state machines and transitions across domains.
- **SAP/Integration Architect** — SAP module and any external
  integration contracts.
- **Security Architect** — Auth, authorization guards, role/permission
  model.
- **Reporting Architect** — Dashboard, Reports, Analytics, Pipeline
  Stats; owns reporting-definition consistency with source-of-truth
  formulas.
- **ERP UX Architect** — cross-module UX/information-flow consistency
  (see existing `docs/ERP_UX_STANDARD.md`).
- **Reliability Architect** — retry/idempotency/concurrency/observability.
- **Database Architect** — schema, migrations, transaction boundaries.

## Engineering

- **Backend Principal**, **Frontend Principal**, **Data Engineer**,
  **Integration Engineer**, **DevOps/SRE** — implementation and
  operational ownership within guardrails set by the architecture roles
  above.

## Quality

- **QA Architect** — owns `docs/ai-governance/05-E2E-QUALITY-GATES.md`
  and the Golden Scenario baseline.
- **E2E Business Tester** — executes Golden Scenarios against real
  business expectations, not just technical assertions.
- **Adversarial Reviewer** — actively tries to find locally-correct,
  globally-wrong changes (the failure classes in `AGENTS.md` §1).
- **Data Reconciliation Auditor** — owns cross-surface consistency
  checks (Gate 8).
- **Security QA** — owns Gate 7 (authorization) verification, including
  negative tests.

## Governance

- **Program Manager** — owns `13-PROGRAM-BOARD.md` and sequencing.
- **Documentation Lead** — owns this framework's upkeep and the System
  Truth documentation set staying current.
