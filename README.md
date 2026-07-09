# THISO Leasing Platform

Nền tảng quản lý cho thuê mặt bằng Mall nội bộ cho **THISO Mall** — quản lý toàn bộ vòng đời khách thuê từ CRM đến billing, tích hợp SAP.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | TailwindCSS + shadcn/ui |
| Backend | Node.js + NestJS 10 |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Auth | JWT + RBAC |
| Swagger | @nestjs/swagger |
| Docker | docker-compose |

## Kiến trúc

```
leasing-platform-thiso/
├── apps/
│   ├── backend/          # NestJS API (port 3000)
│   │   ├── prisma/       # Schema + migrations + seed
│   │   └── src/
│   │       ├── modules/  # Feature modules
│   │       └── common/   # Guards, decorators, filters
│   └── frontend/         # React Vite app (port 8080)
│       └── src/
│           ├── pages/    # All page components
│           ├── api/      # Axios API client
│           └── components/
├── docker-compose.yml
└── README.md
```

## Chạy với Docker (Production)

```bash
# 1. Copy environment file
cp .env.docker .env
# Chỉnh sửa JWT_SECRET và các biến khác trong .env

# 2. Build và khởi động toàn bộ hệ thống
docker compose up -d --build

# 3. Chạy migration và seed data (lần đầu tiên)
docker compose --profile migrate up migrate

# 4. Truy cập
# Frontend: http://localhost:8080
# API Docs: http://localhost:3000/api/docs

# Xem logs
docker compose logs -f

# Dừng hệ thống
docker compose down

# Dừng và xóa data (reset hoàn toàn)
docker compose down -v
```

**Lưu ý:** Không dùng file `docker-compose.dev.yml` trừ khi muốn chạy dev (hot-reload). File đó **không** được tự load — production mặc định chạy Nginx trên **http://localhost:8080**.

```bash
# Chỉ khi cần dev với hot-reload (Vite port 5173)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Docker Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| postgres | leasing-db | 5432 | PostgreSQL 16 database |
| redis | leasing-redis | 6379 | Redis cache |
| backend | leasing-backend | 3000 | NestJS API server |
| frontend | leasing-frontend | 8080 | React app (Nginx) |
| migrate | leasing-migrate | — | One-time migration runner |

### Useful Docker Commands

```bash
# Xem trạng thái các services
docker compose ps

# Vào shell của backend container
docker compose exec backend sh

# Chạy Prisma Studio trong container
docker compose exec backend npx prisma studio

# Re-seed data
docker compose exec backend npx prisma db seed

# Rebuild một service cụ thể
docker compose up -d --build backend

# Xem resource usage
docker stats
```

## Chạy trong môi trường Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- npm

### Backend

```bash
cd apps/backend

# Cài đặt dependencies
npm install

# Tạo file .env
cp .env.example .env
# Sửa DATABASE_URL cho local PostgreSQL

# Tạo database schema
npx prisma migrate dev

# Seed dữ liệu mẫu
npx prisma db seed

# Chạy server
npm run start:dev
# → http://localhost:3000/api
# → Swagger: http://localhost:3000/api/docs
```

### Frontend

```bash
cd apps/frontend

# Cài đặt dependencies
npm install

# Chạy dev server
npm run dev
# → http://localhost:5173
```

## Tài khoản mặc định (sau khi seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@thiso.com | Admin123! |
| Leasing Manager | manager@thiso.com | User123! |
| Mall Director | director@thiso.com | User123! |
| Finance | finance@thiso.com | User123! |
| Legal | legal@thiso.com | User123! |
| Operation | operation@thiso.com | User123! |
| CEO | ceo@thiso.com | User123! |
| Leasing Executive | executive@thiso.com | User123! |

## Modules

### 1. Dashboard
Tổng quan: occupancy rate, doanh thu, công nợ, hợp đồng sắp hết hạn, deals chờ duyệt.

### 2. Mall Spaces
Quản lý layout: Mall → Building → Floor → Zone → Unit.
Color-coded: 🟢 Occupied | 🔴 Vacant | 🟡 Reserved | 🟣 Under Fit-out.

### 3. Leasing CRM
Pipeline khách hàng tiềm năng: Kanban view theo status (New → Won/Lost), lịch sử chăm sóc.

### 4. Proposals
Lập đề xuất thuê: tự động tính toán chi phí, xuất PDF, submit approval.

### 5. Deal Approval Workflow
Quy tắc phê duyệt theo discount:
- ≤ 5%: Leasing Manager
- 5-10%: Mall Director
- > 10% hoặc rent-free > 60 ngày: CEO
- Finance + Legal luôn được thêm

### 6. Contracts
Quản lý hợp đồng: LOI, Lease Agreement, Renewal, Termination.
Cảnh báo hết hạn 180/90/60/30 ngày.

### 7. Tenant Portal
Portal cho khách thuê: xem hợp đồng, hóa đơn, gửi ticket, nhập doanh thu.

### 8. Fit-out Management
Pipeline thi công: Design → PCCC → Permit → Construction → Inspection → Open.

### 9. Operation Tickets
Yêu cầu vận hành: SLA tracking, assign, comment thread.

### 10. Sales Turnover
Doanh thu khách thuê: daily/monthly, top tenant ranking, revenue/sqm.

### 11. Billing & AR
Hóa đơn hàng tháng, ghi nhận thanh toán, AR aging report.

### 12. SAP Integration
Mock integration với SAP FI/CO: sync customers, invoices, payments. Integration log.

### 13. AI Assistant
Chatbot nội bộ trả lời câu hỏi về mặt bằng, hợp đồng, công nợ (sử dụng real data từ DB).

### 14. Reports
Occupancy, Pipeline, Revenue, Contract Expiry, AR Aging, Tenant Sales, Fitout Progress.

## API Documentation

Swagger UI tại: `http://localhost:3000/api/docs`

API endpoints chính:
- `POST /api/auth/login` — Đăng nhập
- `GET /api/dashboard` — Dashboard data
- `GET /api/spaces/units` — Danh sách mặt bằng
- `GET /api/crm/leads` — CRM leads
- `POST /api/proposals` — Tạo proposal
- `GET /api/approvals/pending` — Duyệt deal
- `GET /api/billing/invoices` — Hóa đơn
- `POST /api/ai/chat` — AI assistant

## Seed Data

Dữ liệu mẫu tại `apps/backend/prisma/seed.ts`:
- **Mall**: THISO Mall Sala
- **Floors**: GF, L1, L2, L3, L4
- **Units**: 30 mặt bằng
- **Tenants**: 10 khách thuê (Highlands Coffee, Jollibee, Uniqlo, Guardian...)
- **Leads**: 20 khách hàng tiềm năng
- **Contracts**: 15 hợp đồng
- **Invoices**: 30 hóa đơn (3 tháng)
- **Tickets**: 20 tickets
- **Sales**: Doanh thu 3 tháng

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://leasing:leasing123@localhost:5432/leasing_platform

# Auth
JWT_SECRET=thiso-leasing-super-secret-jwt-2026
JWT_EXPIRES_IN=7d

# App
PORT=3000
UPLOAD_DIR=./uploads
NODE_ENV=development
```

## Mở rộng trong tương lai

- [ ] eSign integration (DocuSign / VSign)
- [ ] SAP ECC live integration
- [ ] OpenAI / Claude AI agent thật
- [ ] Mobile app (React Native)
- [ ] QR code check-in
- [ ] S3 / MinIO file storage
- [ ] Multi-mall support
- [ ] Tenant app riêng biệt
- [ ] Automated billing cron job
- [ ] Email notifications (SendGrid)

## License

Internal use only — THISO Group © 2026

kai update


docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
