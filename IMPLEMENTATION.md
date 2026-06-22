# THISO Leasing Platform — Implementation Notes

> Tài liệu nội bộ ghi lại kiến trúc, logic nghiệp vụ, và trạng thái triển khai.

---

## Cấu trúc dự án

```
leasing-platform-thiso/
├── apps/
│   ├── backend/                    # NestJS 10, port 3000
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Toàn bộ schema DB
│   │   │   └── seed.ts             # Dữ liệu mẫu (30 units, 10 tenants...)
│   │   └── src/
│   │       ├── main.ts             # Global prefix /api, CORS, Swagger
│   │       ├── app.module.ts       # Import tất cả 17 feature modules
│   │       ├── health/             # GET /api/health (public)
│   │       ├── common/
│   │       │   ├── guards/         # JwtAuthGuard, RolesGuard
│   │       │   ├── decorators/     # @Public(), @Roles(), @CurrentUser()
│   │       │   ├── filters/        # HttpExceptionFilter
│   │       │   └── interceptors/   # TransformInterceptor
│   │       ├── prisma/             # PrismaModule (@Global), PrismaService
│   │       ├── storage/            # StorageService (file upload)
│   │       └── modules/
│   │           ├── auth/           # POST /api/auth/login, GET /api/auth/me
│   │           ├── users/          # CRUD users, bcrypt password
│   │           ├── spaces/         # Malls → Buildings → Floors → Zones → Units
│   │           ├── tenants/        # CRUD tenants + portal credentials
│   │           ├── crm/            # Leads + Activities + Pipeline Kanban
│   │           ├── proposals/      # Proposals + tự tính financials + submit
│   │           ├── approvals/      # Pending steps + approve/reject per role
│   │           ├── contracts/      # CRUD + expiring + file upload
│   │           ├── fitout/         # Fitout projects + checklists
│   │           ├── tickets/        # Operation tickets + comments + assign
│   │           ├── sales/          # Sales turnover + summary + top tenants
│   │           ├── billing/        # Invoices + payments + AR aging
│   │           ├── reports/        # Occupancy, pipeline, revenue, expiry, sales
│   │           ├── sap/            # Mock SAP sync + integration logs
│   │           ├── ai/             # Mock AI chatbot dùng real data từ DB
│   │           ├── dashboard/      # KPIs tổng hợp (parallel queries)
│   │           └── notifications/  # Thông báo + mark read
│   └── frontend/                   # React 18 + Vite, port 5173 (dev) / 8080 (Docker)
│       └── src/
│           ├── App.tsx             # React Router v6, PrivateRoute
│           ├── components/
│           │   ├── Layout.tsx      # Sidebar collapsible, nav items, user avatar
│           │   └── ui/             # shadcn/ui components
│           ├── pages/
│           │   ├── auth/LoginPage.tsx
│           │   ├── dashboard/DashboardPage.tsx     # 8 KPI cards, charts
│           │   ├── spaces/SpacesPage.tsx           # Unit grid, color-coded status
│           │   ├── crm/CrmPage.tsx                 # Kanban + list view, CreateLeadDialog
│           │   ├── proposals/ProposalsPage.tsx      # Table, submit/convert actions
│           │   ├── approvals/ApprovalsPage.tsx      # Pending steps, approve/reject
│           │   ├── contracts/ContractsPage.tsx      # Contracts, expiry alerts
│           │   ├── fitout/FitoutPage.tsx            # Pipeline cards, progress bar
│           │   ├── tickets/TicketsPage.tsx          # Tickets + comment thread
│           │   ├── sales/SalesPage.tsx              # Turnover input + top tenants
│           │   ├── billing/BillingPage.tsx          # Invoices + AR aging table
│           │   ├── reports/ReportsPage.tsx          # 4 tabs: Recharts charts
│           │   ├── sap/SapPage.tsx                  # SAP sync + logs
│           │   ├── ai/AiPage.tsx                    # Chat UI, suggestions
│           │   ├── admin/AdminPage.tsx              # User management (ADMIN only)
│           │   └── tenant-portal/TenantPortalPage.tsx
│           ├── api/index.ts        # Tất cả Axios API calls
│           ├── types/index.ts      # TypeScript types cho tất cả entities
│           ├── store/auth.store.ts # Zustand: token persist localStorage
│           └── lib/axios.ts        # Axios instance, interceptors, 401 redirect
├── packages/shared/                # Shared types (future use)
├── docker-compose.yml
├── .env.example                    # Root: POSTGRES_* vars
└── README.md
```

---

## Database Schema — Entities

| Entity | Mô tả |
|--------|-------|
| `User` | Staff nội bộ, 9 roles |
| `Mall` | Mall (THISO Mall Sala) |
| `Building` | Tòa nhà trong mall |
| `Floor` | Tầng (GF, L1–L4) |
| `Zone` | Khu vực trong tầng |
| `Unit` | Mặt bằng cho thuê |
| `Tenant` | Khách thuê (có portal login) |
| `Lead` | Khách hàng tiềm năng CRM |
| `LeadActivity` | Lịch sử chăm sóc lead |
| `Proposal` | Đề xuất thuê (có tính toán tài chính) |
| `ApprovalWorkflow` | Workflow phê duyệt |
| `ApprovalStep` | Bước phê duyệt từng role |
| `Contract` | Hợp đồng thuê |
| `ContractFile` | File đính kèm hợp đồng |
| `FitoutProject` | Dự án thi công |
| `FitoutChecklist` | Checklist thi công |
| `Ticket` | Yêu cầu vận hành |
| `TicketComment` | Comment trên ticket |
| `TicketFile` | File đính kèm ticket |
| `SalesTurnover` | Doanh thu khách thuê |
| `Invoice` | Hóa đơn |
| `InvoiceLine` | Chi tiết hóa đơn |
| `Payment` | Ghi nhận thanh toán |
| `SapIntegrationLog` | Log sync SAP |
| `Notification` | Thông báo user |
| `AuditLog` | Lịch sử thay đổi |

---

## Business Logic Quan Trọng

### Approval Workflow (proposals.service.ts)

```
discount ≤ 5%   → Leasing Manager
discount ≤ 10%  → Leasing Manager + Mall Director
discount > 10%  → Leasing Manager + Mall Director + CEO
                   + Finance (luôn có)
                   + Legal (luôn có)
```

**CRITICAL**: Workflow phải tạo với `status: WorkflowStatus.IN_PROGRESS` (không phải `PENDING`).
`approvals.service.ts` query WHERE `status = IN_PROGRESS` để lấy pending list.

### Proposal Financial Calculation

```typescript
monthlyRent = area × rentPerSqm × (1 - discount/100)
monthlyCAM  = area × camPerSqm
depositAmount = monthlyRent × depositMonths
endDate = startDate + term months
totalContractValue = monthlyRent × (term - rentFree) + monthlyCAM × term
```

### Convert Proposal → Contract

`POST /api/proposals/:id/convert` chỉ chạy khi proposal status = `APPROVED`.
Sau khi convert:
- Tạo contract mới với dữ liệu từ proposal
- Proposal status → `CONVERTED`
- Unit status → `RESERVED` (sau khi ký xong → `OCCUPIED`)

### AR Aging (billing.service.ts)

Tính từ `invoice.dueDate` so với today:
- **Current**: chưa đến hạn
- **1–30 ngày**: quá hạn 1–30 ngày
- **31–60 ngày**: quá hạn 31–60 ngày
- **61–90 ngày**: quá hạn 61–90 ngày
- **>90 ngày**: quá hạn trên 90 ngày

---

## Roles (9 roles)

| Role | Email mặc định | Password |
|------|----------------|----------|
| `ADMIN` | admin@thiso.com | Admin123! |
| `LEASING_EXECUTIVE` | executive@thiso.com | User123! |
| `LEASING_MANAGER` | manager@thiso.com | User123! |
| `MALL_DIRECTOR` | director@thiso.com | User123! |
| `FINANCE` | finance@thiso.com | User123! |
| `LEGAL` | legal@thiso.com | User123! |
| `OPERATION` | operation@thiso.com | User123! |
| `CEO` | ceo@thiso.com | User123! |
| `TENANT` | tenant@thiso.com | User123! |

Tenant portal: mỗi tenant có `portalEmail` + `portalPassword` (hash). Password mặc định: `Tenant123!`

---

## API — Endpoints Chính

```
Auth
  POST   /api/auth/login
  GET    /api/auth/me

Spaces
  GET    /api/spaces/units
  GET    /api/spaces/units/occupancy
  GET    /api/spaces/units/:id

CRM
  GET    /api/crm/leads
  POST   /api/crm/leads
  PUT    /api/crm/leads/:id
  GET    /api/crm/pipeline

Proposals
  GET    /api/proposals
  POST   /api/proposals
  POST   /api/proposals/:id/submit      → tạo ApprovalWorkflow
  POST   /api/proposals/:id/convert     → tạo Contract, unit RESERVED

Approvals
  GET    /api/approvals/pending          → steps WHERE role = user.role
  POST   /api/approvals/:id/approve
  POST   /api/approvals/:id/reject

Contracts
  GET    /api/contracts
  GET    /api/contracts/expiring
  POST   /api/contracts/:id/files       → multipart upload

Billing
  GET    /api/billing/invoices
  POST   /api/billing/invoices/:id/issue
  POST   /api/billing/invoices/:id/payment
  GET    /api/billing/ar-aging

Reports
  GET    /api/reports/occupancy
  GET    /api/reports/pipeline
  GET    /api/reports/revenue
  GET    /api/reports/contract-expiry
  GET    /api/reports/tenant-sales

Dashboard
  GET    /api/dashboard

AI
  POST   /api/ai/chat
  GET    /api/ai/suggestions

Health
  GET    /api/health                     (Public, no auth)

Swagger
  GET    /api/docs
```

---

## Docker Setup

### Services

| Service | Image | Port nội bộ | Port host |
|---------|-------|-------------|-----------|
| `postgres` | postgres:16-alpine | 5432 | 5432 |
| `backend` | node:20-alpine (multi-stage) | 3000 | 3000 |
| `frontend` | nginx:alpine (build từ node:20) | 80 | 8080 |

### Nginx (frontend production)

Nginx phục vụ static React app và **proxy `/api` → `http://backend:3000`**.
Vì vậy axios `baseURL` để trống (mặc định `/api`) — requests đi qua nginx, không cần biết backend host.

### Volumes
- `postgres_data` — database persistence
- `uploads_data` — file uploads persistence (mount vào `/app/uploads`)

### Chạy lần đầu

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env

docker compose up -d --build

# Đợi ~60 giây cho backend healthy, sau đó:
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx ts-node prisma/seed.ts
```

### Seed có thể chạy vì

`ts-node` và `typescript` nằm trong `dependencies` (không phải devDependencies) của backend `package.json`.
`tsconfig.json` được copy vào production Docker image.
`prisma/seed.ts` được copy vào production image.

---

## Frontend — Luồng dữ liệu

```
Component
  → useQuery / useMutation (React Query)
  → api/index.ts (Axios)
  → lib/axios.ts (interceptor gắn Bearer token từ localStorage)
  → /api/...
  → Vite proxy (dev) hoặc nginx proxy (prod)
  → NestJS backend
```

**Auth state**: Zustand store (`store/auth.store.ts`), persist token vào localStorage.
**401**: Axios interceptor tự redirect về `/login` và xóa token.

---

## Các Bugs Đã Fix

| Bug | Mô tả | Fix |
|-----|-------|-----|
| WorkflowStatus | Workflow tạo với `PENDING`, nhưng approvals query `IN_PROGRESS` | Đổi sang `IN_PROGRESS` khi tạo |
| Occupancy API path | Frontend gọi `/spaces/occupancy`, backend có `/spaces/units/occupancy` | Sửa frontend path |
| PUT vs PATCH | `usersApi.updateUser` dùng `PUT`, controller là `@Patch` | Đổi sang `api.patch()` |
| Missing POST /users | AdminPage gọi `createUser` nhưng controller chưa có endpoint | Thêm `@Post()` + `UsersService.create()` |
| Seed command Docker | README dùng `node dist/prisma/seed.js` — file không tồn tại | Đổi sang `npx ts-node prisma/seed.ts` |
| VITE_API_URL Docker | `environment:` không ảnh hưởng Vite build (bake lúc build) | Đổi sang `build.args.VITE_API_URL: ""` |

---

## Seed Data

| Entity | Số lượng |
|--------|----------|
| Users (staff) | 9 (mỗi role 1 user) |
| Mall | 1 (THISO Mall Sala) |
| Buildings | 1 |
| Floors | 5 (GF, L1, L2, L3, L4) |
| Zones | 25 (5 zones/floor) |
| Units | 30 (đa dạng diện tích, category, trạng thái) |
| Tenants | 10 (Highlands Coffee, Jollibee, Uniqlo...) |
| Leads | 20 (cover đủ 7 statuses) |
| Proposals | 8 (có DRAFT, SUBMITTED, APPROVED) |
| Contracts | 15 (10 ACTIVE, 2 EXPIRING, 1 PENDING_SIGN, 2 DRAFT) |
| FitoutProjects | 12 (cover đủ pipeline statuses) |
| Invoices | 30 (3 tháng × 10 tenant/tháng) |
| Payments | Gắn với PAID + PARTIALLY_PAID invoices |
| Tickets | 20 (đủ types và priorities) |
| SalesTurnover | 30 (3 tháng × 10 tenants) |
| ApprovalWorkflows | 5 (gắn với proposals đã submit/approve) |
| Notifications | 15 (proposal + invoice overdue) |

---

## Environment Variables

### Root `.env` (cho docker-compose postgres service)
```env
POSTGRES_USER=leasing
POSTGRES_PASSWORD=leasing123
POSTGRES_DB=leasing_platform
```

### `apps/backend/.env` (cho backend NestJS)
```env
DATABASE_URL=postgresql://leasing:leasing123@localhost:5432/leasing_platform
JWT_SECRET=thiso-leasing-super-secret-jwt-change-me-in-production
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
UPLOAD_DIR=./uploads
```

> Trong Docker: `DATABASE_URL` bị ghi đè bởi docker-compose `environment:` để trỏ vào `postgres` container.

---

## Hạn chế Hiện Tại (Known Limitations)

- **PDF export proposals**: Chưa có (spec yêu cầu). Cần thêm `pdfmake` hoặc `puppeteer`.
- **AuditLog middleware**: Schema có model nhưng chưa có NestJS interceptor tự động log mọi thay đổi.
- **Contract expiry notifications**: Chưa có cron job tự động gửi thông báo 180/90/60/30 ngày.
- **eSign integration**: Chưa có (DocuSign/VSign — đánh dấu future work).
- **SAP integration**: Mock only — random success/fail, không call real SAP API.
- **AI chatbot**: Pattern-matching trên DB thật, chưa tích hợp LLM (OpenAI/Claude).
- **Tenant portal**: Admin view only — tenant login riêng biệt chưa có flow hoàn chỉnh.
- **File upload**: Backend có StorageService + controller endpoint, chưa có disk/S3 config hoàn chỉnh.
- **RBAC granular**: Chủ yếu `@Roles(Role.ADMIN)` trên admin endpoints, chưa có per-field RBAC.
- **Fitout checklist UI**: Backend đủ, frontend hiện chỉ show project cards, chưa có checklist management UI.
