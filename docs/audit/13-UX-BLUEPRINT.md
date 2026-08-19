# 13 — UX Blueprint

> Phase 26 (target IA, adapted from 06-INFORMATION-ARCHITECTURE) + Phase 27 (screen
> inventory and redesign priority).

## Target platform blueprint

```text
THISO Leasing Platform
│
├── Trang chủ (Home/Dashboard) — see 07-DASHBOARD-REDESIGN
│
├── Việc của tôi (My Work) — NEW, see 09-TASK-NOTIFICATION-CENTER
│   ├── Cần tôi duyệt
│   ├── Ticket của tôi / chưa phân công
│   ├── Đề xuất của tôi
│   └── Thông báo
│
├── Bán hàng & Cho thuê (unchanged structure, proven pattern)
│   ├── Mặt bằng · Khách hàng tiềm năng · Booking
│   └── Đề xuất · Phê duyệt · Hợp đồng · Khách thuê
│
├── Vận hành mặt bằng (regrouped from 7 flat items → 3 task clusters)
│   ├── Thi công & Bàn giao (Fitout)
│   ├── Xử lý sự cố (Tickets, Work Orders)
│   └── An ninh & Bãi đỗ xe (Patrol, Parking — merged, fixes FR-03)
│
├── Tài chính (Billing/AR, Doanh thu, Hợp đồng dịch vụ, SAP)
│
├── Báo cáo & Phân tích (consolidated, fixes FR-11)
│   ├── Báo cáo vận hành · Hiệu quả kinh doanh · Tài chính & Tuân thủ · Cross-Mall
│
├── Trợ lý AI
│
├── Tìm kiếm toàn cục (Ctrl+K) — NEW, see 08-GLOBAL-SEARCH
│
└── Hệ thống (Thông báo Mall, Nhật ký, Quản trị)
```

Full rationale for each change is in
[06-INFORMATION-ARCHITECTURE](06-INFORMATION-ARCHITECTURE.md); this blueprint is
the adopted target, not a restatement of alternatives.

## Screen inventory (28 routes / ~40 components)

Frequency and Importance are qualitative, derived from RBAC breadth (how many
roles/personas touch it) and position in the core revenue/ops journeys traced in
03-USER-JOURNEYS; UX Score is this audit's 1–5 rating; Redesign column marks
priority tier.

| Screen | Module | Primary Persona(s) | Frequency | Importance | UX Score /5 | Redesign |
|---|---|---|---|---|---|---|
| Dashboard | dashboard | All staff | Daily | Critical | 3 | **P0** — see 07-DASHBOARD-REDESIGN |
| Approvals | approvals | Manager/Director/CEO/Finance/Legal | Daily (for approvers) | Critical | 2 | **P0** — FR-04, context inline |
| NotificationCenter | (shared component) | All | Daily | Critical | 2 | **P0** — FR-07, task/notification split |
| Proposals | proposals | Leasing | Daily | Critical | 2 | **P0** — FR-02, missing entry point |
| Bookings | bookings | Leasing | Daily | High | 2 | P1 — V2: 2,200 lines/17 dialogs, split reservation queue/availability/pricing |
| Tickets | tickets | Operation, Tenant | Daily | High | 4 | Reference implementation — no redesign needed, propagate its patterns instead |
| CRM | crm | Leasing Exec | Daily | High | 2 | P1 — V2: 2,500-line monolith, split Lead/Customer workspaces |
| Contracts | contracts | Leasing Manager, Legal, Finance | Frequent | Critical | 3 | P1 — 7-tab sprawl, summary-first redesign |
| Billing | billing | Finance | Daily | Critical | 3 | P1 — 5+ tabs, separate action-needed vs. reference tabs |
| Fitout | fitout | Operation, Tenant | Frequent | High | 2 | P1 — V2: ~15 tabs, group into 5 workspaces |
| Spaces | spaces | Leasing, Ops | Frequent | High | 3 | P2 |
| Tenant Portal | tenant-portal | Tenant | Frequent | Critical | 4 | Reference implementation for tenant-facing UX |
| Admin | admin | Admin | Occasional | High (config-critical) | 2 | P1 — V2: monolith split into 5 permission domains |
| Sidebar/Nav | (shared) | All | Constant | Critical | 3 | **P0** — see this blueprint + 06-IA |
| CRM Overview | crm-overview | Leasing Manager | Frequent | Medium | 3 | P2 |
| Deal Pipeline | deal-pipeline | Leasing, Director | Frequent | Medium | 3 | P2 — merge with Pipeline Stats per IA |
| Pipeline Stats | pipeline-stats | Leasing, Director | Occasional | Medium | 3 | P2 — merge target |
| Reports | reports | Director, Finance | Occasional | Medium | 3 | P2 — consolidate per IA |
| Analytics | analytics | Director, CEO | Occasional | Medium | 3 | P2 — consolidate per IA |
| Cross-Mall | cross-mall | CEO, Admin | Occasional | Medium | 3 | P3 |
| Tenants | tenants | Leasing, Finance | Frequent | High | 3 | P2 |
| Sales (turnover) | sales | Finance, Tenant | Frequent | Medium | 3 | P2 |
| Service Contracts | service-contracts | Operation, Finance | Occasional | Medium | 3 | P3 |
| Work Orders | work-orders | Operation | Frequent | Medium | 3 | P2 — evolve toward full work-order process per V2 |
| Patrol | patrol | Operation | Frequent | Medium | 3 | P3 |
| Parking | parking | Operation, Finance | Occasional | Medium | 3 | P2 — merge with Parking Central per IA |
| Parking Report/Transaction | parking-dashboard | Operation, Finance | Occasional | Low-Medium | 3 | P2 — merge target |
| SAP | sap | Finance, Admin | Occasional | Medium | 2 | P2 — separate finance actions from technical diagnostics (V2) |
| Announcements | announcements | Operation, Tenant | Occasional | Low | 3 | P3 |
| AI Assistant | ai | All | Occasional | Medium | 3 | P3 |
| Audit Log | audit-log | Admin | Rare | Medium (compliance) | 3 | P3 |
| Inventory | inventory | Operation, Finance | Occasional | Low-Medium | 3 | P3 |
| Profile | profile | All | Rare | Low | 3 | P3 |

## Top 10 screens to redesign first (High Frequency × High Business Impact)

1. Dashboard — 07-DASHBOARD-REDESIGN.md
2. Sidebar / Navigation — see docs/redesign/navigation.md
3. Notification/Task Center — 09-TASK-NOTIFICATION-CENTER.md
4. Approvals — docs/redesign/approvals.md (context-inline redesign)
5. Proposals (incl. creation entry point) — docs/redesign/proposals-contracts.md
6. Contracts — docs/redesign/proposals-contracts.md
7. Bookings — docs/redesign/crm-bookings.md
8. CRM — docs/redesign/crm-bookings.md
9. Billing — docs/redesign/billing.md
10. Fitout — docs/redesign/fitout.md

Tickets and Tenant Portal are intentionally excluded from this list — they are the
platform's reference implementations (see 03-USER-JOURNEYS Journey B, 04-friction
FR-09) and should be used as the pattern source for the other nine, not redesigned
themselves.
