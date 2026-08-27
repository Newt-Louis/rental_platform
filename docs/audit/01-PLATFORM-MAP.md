# 01 — Platform Map

> Phase 1. Structural map of the platform's building blocks, independent of how the
> current UI groups them (see [06-INFORMATION-ARCHITECTURE](06-INFORMATION-ARCHITECTURE.md)
> for the proposed regrouping).

```text
PLATFORM (THISO Leasing ERP)
│
├── Users — 9 roles (ADMIN, CEO, MALL_DIRECTOR, LEASING_MANAGER, LEASING_EXECUTIVE,
│                     FINANCE, LEGAL, OPERATION, TENANT)
├── Organizations — single-tenant-of-malls model: Mall → Building → Floor → Zone → Unit
├── Modules — 27 backend modules (00-SYSTEM-INVENTORY §3)
├── Processes — Lead→Booking→Proposal→Approval→Contract→Fitout→Occupancy→Billing→SAP
├── Tasks — Approval steps, ticket assignments, fitout issues/milestones,
│           patrol shifts, work orders (currently scattered, not unified — see
│           09-TASK-NOTIFICATION-CENTER)
├── Approvals — config-driven policy engine (ApprovalPolicyRule → ApprovalWorkflow →
│               ApprovalStep), reused only for Proposals today
├── Notifications — 1 model, ~15 free-form types, fed by 8 modules + 1 cron
├── Documents/Data — FitoutDocument, contract files/signing, tenant sales evidence,
│                    patrol photos, ticket photos (no single document register — a
│                    V2-flagged consolidation gap)
├── Reports — Dashboard, Reports, Analytics, Cross-Mall Dashboard, Pipeline Stats,
│             Deal Pipeline (6 surfaces, overlapping KPIs)
├── Administration — Users & Mall Access, Categories, Approval Policy, System settings
└── Integrations — SAP FI/CO (mock), Anthropic Claude (chat + insights cron), Email
```

## Module classification

| Module | Purpose | Primary users | Class |
|---|---|---|---|
| Dashboard | Role-shaped KPI + action surface | All staff | Core |
| Spaces | Mall/floor/unit inventory & floor plan | Leasing, Ops, Director | Core |
| CRM | Lead/customer pipeline | Leasing Exec/Manager | Core |
| Bookings | Long-term hold + short-term slot reservation | Leasing Exec/Manager | Core |
| Proposals | Pricing, scenarios, approval submission | Leasing Exec/Manager | Core |
| Approvals | Multi-step decision workflow | Manager/Director/CEO/Finance/Legal | Core |
| Contracts | Lease lifecycle, signing, amendments, termination | Leasing Manager, Legal, Finance | Core |
| Fitout | Tenant construction pipeline | Operation, Tenant, Contractor | Core |
| Tickets | Tenant-reported issues, SLA | Operation, Tenant | Core |
| Work Orders | Internal maintenance | Operation | Supporting |
| Billing/AR | Invoicing, payments, collections | Finance | Core |
| Sales (turnover) | Tenant revenue reporting | Finance, Tenant | Supporting |
| Parking | Parking service contracts/transactions | Operation, Finance | Supporting |
| Patrol | Security checkpoint verification | Operation | Supporting |
| Service Contracts | Vendor contracts | Operation, Finance | Supporting |
| Tenant Portal | Tenant self-service hub | Tenant | Core |
| SAP | Finance system sync | Finance, Admin | Supporting |
| AI Assistant | Chat + proactive insights | All staff (insights: leadership) | Supporting |
| Reports/Analytics/Cross-Mall/Pipeline Stats | Aggregated reporting | Director, CEO, Finance | Reporting |
| Announcements | Broadcast to tenants/staff | Operation, Tenant | Supporting |
| Admin | Users, mall access, policy, categories, system | Admin | Admin/Config |
| Audit Log | Change history | Admin | Admin/Config |

## Dependency notes (why this matters for UX)

- **Bookings is a mandatory bridge**, not optional: a Proposal cannot be created
  without first creating a Booking tied to a Lead + Unit. A first-time user looking
  for "create proposal" will not find a button for it under Proposals — it lives
  inside Bookings (`ConvertToProposalDialog`). This single fact explains a large share
  of the "I don't know where to start" friction reported for new users — see
  [03-USER-JOURNEYS](03-USER-JOURNEYS.md) Journey A and
  [04-UX-FRICTION-REPORT](04-UX-FRICTION-REPORT.md) FR-02.
- **Proposal→Contract conversion is a single fan-out action**: one button creates a
  Tenant (if missing) + Contract + updates Unit status, in one mutation. This is
  good UX (few clicks) but means the user needs to understand *before* clicking that
  a lot is about to happen — the confirmation/preview step matters (see
  [05-TASK-EFFICIENCY](05-TASK-EFFICIENCY.md)).
- **Parking is split across two nav groups** (`operations` → "Vận hành bãi xe" vs.
  `parkingCentral` → "Báo cáo/Giao dịch bãi đỗ xe") for what a user experiences as
  one subject area — a concrete IA fragmentation, not a hypothetical one.
- **Notifications fan in from 8 modules but fan out to one undifferentiated feed** —
  the module map shows *many* producers and *one* consumer surface with no
  type-based filtering, which is the root of the "how do I know what needs me"
  friction (see 09-TASK-NOTIFICATION-CENTER).
