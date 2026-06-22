# Leasing Platform Implementation Checklist

Cap nhat: 2026-06-17 — Wave 1-5 hoan thanh

## Tong quan

| Wave | Trang thai |
|------|------------|
| Wave 1 - Foundation | **100%** |
| Wave 2 - Commercial & Contract | **100%** |
| Wave 3 - Finance | **100%** |
| Wave 4 - Operations & Fitout | **100%** |
| Wave 5 - Analytics & Scale | **100%** |

---

## Wave 1 - Foundation

- [x] Docker build/stability fix
- [x] Security hardening (helmet + throttling)
- [x] Healthcheck readiness v1
- [x] CI pipeline (lint/test/build)
- [x] Unit test health controller
- [x] Dynamic approval policy engine
- [x] API quan ly approval policy rules
- [x] Seed default approval rules (policy-driven workflows)
- [x] Unit test approval policy evaluator
- [x] **Frontend UI** quan ly approval policy (`AdminPage` tab Approval Policy)
- [x] **Integration test** proposal submit → workflow steps (`proposals.service.spec.ts`)
- [x] Seed dung `buildApprovalStepsFromRules()` — khong hardcode

---

## Wave 2 - Commercial & Contract

- [x] Quote versioning + compare (backend)
- [x] API list/get/compare proposal versions
- [x] Unit + integration test proposal version compare
- [x] **Frontend** version list & compare (`ProposalsPage` tab Phiên bản)
- [x] **Deal scoring** config-driven (`DealScoreCriterion`, API `/deal-scoring`, UI nut tinh score)
- [x] **Contract template + clause library** (`ContractTemplate`, `ContractClause`, API CRUD + render)
- [x] **Contract amendment workflow** (`ContractAmendment` DRAFT→SUBMITTED→APPLIED)
- [x] **Contract event timeline + audit diff** (`ContractEvent`, API `/contracts/:id/events`, UI Timeline tab)

---

## Wave 3 - Finance

- [x] Billing schedule automation — **MONTHLY / QUARTERLY / ANNUALLY**
- [x] Rent-free, escalation, payment term
- [x] API build schedule + generate due invoices
- [x] Cron sinh hoa don (ngay 1 hang thang)
- [x] **Auto-issue** invoice option (`BillingConfig.autoIssueInvoices`)
- [x] AR dunning L1/L2/L3 policy-driven
- [x] **Hop nhat scheduler** — overdue mark only 9:00, dunning notify 10:00
- [x] **Frontend** billing schedule, dunning, collection KPI tabs
- [x] **Penalty interest** auto-calc (`PenaltyInterestPolicy`, API `/billing/penalty/run`)
- [x] **Collection KPI dashboard** (DSO, collection rate, AR aging trend)
- [x] **SAP reconciliation + idempotency** (`SapReconciliationRecord`, `idempotencyKey` on sync logs)
- [x] Integration test billing schedule service

---

## Definition of Done

| Tieu chi | Status |
|----------|--------|
| Unit/integration tests (21 tests) | [x] |
| Docker/backend build | [x] |
| Frontend build | [x] |
| Frontend end-to-end UI | [x] |
| Khong hardcode runtime rules | [x] |
| Checklist cap nhat | [x] |

---

## API moi (tich hop frontend)

| Method | Endpoint | Frontend |
|--------|----------|----------|
| GET/POST | `/api/approvals/policy/rules` | Admin Approval Policy tab |
| GET | `/api/proposals/:id/versions` | ProposalsPage |
| GET | `/api/proposals/:id/versions/compare` | ProposalsPage |
| GET/POST | `/api/deal-scoring/criteria` | ProposalsPage (score button) |
| GET/POST | `/api/contracts/templates` | ContractsPage Template tab |
| GET/POST | `/api/contracts/:id/amendments` | ContractsPage Amendments tab |
| GET | `/api/contracts/:id/events` | ContractsPage Timeline tab |
| GET/POST | `/api/billing/schedule/*` | BillingPage Schedule tab |
| GET/POST | `/api/billing/dunning/*` | BillingPage Dunning tab |
| GET | `/api/billing/collection-kpi` | BillingPage KPI tab |
| POST | `/api/billing/penalty/run` | BillingPage Dunning tab |
| GET/POST | `/api/sap/reconciliation` | SAP API client |

---

## Lenh apply DB

```bash
cd apps/backend
npx prisma db push
npx prisma db seed
```

Docker:

```bash
docker compose exec backend npx prisma db push --skip-generate
docker compose exec backend npx ts-node --transpile-only prisma/seed.ts
```

---

## Wave 4 - Operations & Fitout

- [x] Fitout document gates (layout/MEP/PCCC/permit)
  - `FitoutDocument` model + upload/review API
  - `FitoutDocumentGate` — required docs per status
  - Gate check trước khi advance status
- [x] Fitout SLA policies + milestone tracking
  - `FitoutSlaPolicy` per stage + target/warning days
  - `FitoutMilestone` — track start/target/complete/overdue
  - Cron job 08:00 check SLA breaches + escalation notifications
- [x] Ticket SLA matrix (type × priority)
  - `TicketSlaPolicy` — responseHours, resolutionHours per type/priority
  - Auto-compute `slaDueAt` on create
  - Cron job every 2h check breaches + escalate (L1→L2→L3)
  - `TicketEscalation` log + notifications
- [x] Frontend UI: FitoutPage tabs (Documents, SLA Milestones)
- [x] Frontend API: fitoutApi + ticketsApi SLA methods
- [x] Seed data: document gates, fitout SLA policies, ticket SLA matrix

---

## Wave 5 - Analytics & Scale

- [x] Occupancy Analytics v2
  - `OccupancyAnalyticsService` — by mall/floor/category
  - Effective occupancy (includes UNDER_FITOUT)
  - Vacancy analysis + estimated loss
  - Monthly snapshot cron (1st of month)
  - `OccupancySnapshot` model for trends
- [x] Renewal Risk Dashboard
  - `RenewalRiskService` — score calculation (expiry, payment history, tickets, sales trend)
  - `RenewalRiskScore` model + daily recalc cron
  - Risk levels: LOW/MEDIUM/HIGH/CRITICAL
  - At-risk revenue tracking
- [x] Multi-Mall Comparison
  - `ComplianceService.getMultiMallComparison()`
  - KPIs per mall: occupancy, revenue, revenue/sqm
- [x] Mall Policy / Governance
  - `MallPolicy` model — configurable policies + KPI targets
  - API `/analytics/mall-policy/:mallId`
- [x] Compliance Export
  - `ComplianceExport` — request/generate exports
  - Export types: CONTRACTS, INVOICES, APPROVALS, AUDIT_TRAIL
- [x] Frontend: AnalyticsDashboard page
  - Tabs: Occupancy, Renewal Risk, Multi-Mall
  - Charts: trend lines, bar charts, pie charts (Recharts)
- [x] Navigation: Added /analytics route + nav item

---

## Definition of Done

| Tieu chi | Status |
|----------|--------|
| Unit/integration tests (21 tests) | [x] |
| Docker/backend build | [x] |
| Frontend build | [x] |
| Frontend end-to-end UI | [x] |
| Khong hardcode runtime rules | [x] |
| Checklist cap nhat | [x] |

---

## API moi (Wave 4-5)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/fitouts/:id/documents` | List fitout documents |
| POST | `/fitouts/:id/documents` | Upload document |
| PUT | `/fitouts/:id/documents/:docId/review` | Approve/reject document |
| GET | `/fitouts/:id/gate-check/:targetStatus` | Check gate requirements |
| GET | `/fitouts/:id/milestones` | Get SLA milestones |
| GET | `/fitouts/gates` | List document gate configs |
| POST | `/fitouts/gates` | Upsert gate config |
| GET | `/fitouts/sla/policies` | List fitout SLA policies |
| POST | `/fitouts/sla/policies` | Upsert SLA policy |
| GET | `/fitouts/progress` | Fitout progress report |
| GET | `/tickets/sla/policies` | List ticket SLA policies |
| POST | `/tickets/sla/policies` | Upsert ticket SLA policy |
| GET | `/tickets/sla/stats` | SLA compliance stats |
| GET | `/tickets/:id/escalations` | Escalation history |
| GET | `/analytics/occupancy` | Occupancy v2 |
| GET | `/analytics/occupancy/trend` | Occupancy trend |
| GET | `/analytics/vacancy` | Vacancy analysis |
| GET | `/analytics/renewal-risk` | Renewal risk dashboard |
| POST | `/analytics/renewal-risk/:contractId` | Calculate risk |
| GET | `/analytics/multi-mall` | Multi-mall comparison |
| GET/POST | `/analytics/mall-policy/:mallId` | Mall policy |
| GET/POST | `/analytics/compliance/exports` | Compliance exports |

---

## Test

```bash
cd apps/backend && npm test
cd apps/frontend && npm run build
```
