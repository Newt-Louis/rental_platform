# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

THISO Leasing Platform — internal mall leasing management for THISO Mall: CRM → proposal → approval → contract → billing lifecycle, plus operations (fitout, tickets, work orders, patrol, parking) and a SAP integration mock. Monorepo: `apps/backend` (NestJS 10 + Prisma + PostgreSQL), `apps/frontend` (React 18 + Vite + TypeScript), `packages/shared` (shared types).

## Commands

### Primary dev workflow: Docker (dev compose), not local npm
This project is normally run and developed **inside Docker**, layering the dev override on top of the base compose file:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
`docker-compose.dev.yml` is not auto-loaded by plain `docker compose up` — it must always be explicitly passed. In dev mode, `leasing-frontend` runs the Vite dev server (HMR, port **5173**, source bind-mounted) instead of Nginx; `leasing-backend` runs `start:dev` (watch mode, port **3000**, `/api/docs` for Swagger). The frontend container's built-in healthcheck targets the prod Nginx port, so it commonly shows `unhealthy` under dev mode even when Vite is serving fine at :5173 — check with `curl` instead of trusting `docker ps` health status.

Containers are typically left running persistently across sessions (host-mounted source + HMR means edits apply live) — check `docker ps` before starting anything new. First-run only: `docker compose --profile migrate up migrate` (migration + seed).

Run one-off commands inside the running containers rather than on the host:
```bash
docker compose exec backend npx jest path/to/file.spec.ts   # single backend test
docker compose exec backend npm run lint
docker compose exec backend npx prisma studio
docker compose exec backend npx prisma db seed
docker compose exec frontend npx vitest run path/to/file.test.ts   # single frontend test
```
Also see `Makefile` for wrapped versions (`make dev`, `make migrate`, `make seed`, `make reset`, `make prisma`, `make psql`, `make shell`).

### Bare-metal alternative (no Docker)
```bash
# backend (apps/backend)
npm run start:dev        # watch mode, http://localhost:3000/api
npm run lint
npm run test              # jest; npm run test -- <pattern> for a subset
npm run test:e2e          # jest-e2e config
npx prisma migrate dev
npx prisma db seed

# frontend (apps/frontend)
npm run dev                # http://localhost:5173
npm run build
npm run test                # vitest run; npm run test:watch for watch mode
```

### E2E (repo root, Playwright)
```bash
npx playwright test                 # runs specs in ./e2e against http://localhost:5173 (must already be up — Docker dev or bare-metal)
npx playwright test e2e/foo.spec.ts # single spec
```

### Production-style Docker (no hot-reload)
```bash
docker compose up -d --build
```
Without the dev override, the frontend builds a static bundle served via Nginx on :8080 (not :5173).

## Architecture

### Mall as the tenancy boundary
Every core entity (`Unit`, `Contract`, `Proposal`, `Tenant`, `Ticket`, `Invoice`, etc.) is scoped by `mallId`. `UserMallAccess` grants a user access to specific malls; `MallAccessGuard` (`apps/backend/src/common/guards/mall-access.guard.ts`) reads `mallId`/`unitId`/`floorId`/`contractId`/`fitoutProjectId`/`invoiceId` off each request and validates access via `MallAccessService` before the handler runs. `Lead` is a notable exception — it has no `mallId` and lives outside mall scoping until it converts.

### Auth/RBAC layering (backend)
Three guards compose on every request: `JwtAuthGuard` → `RolesGuard` → `MallAccessGuard`. Roles come from the Prisma `Role` enum; `@Roles(...)` + `@Public()` decorators (in `common/decorators/`) drive `RolesGuard`. `ADMIN` always bypasses per-endpoint `@Roles` restriction (treated as super-admin) — don't rely on `@Roles` alone to lock ADMIN out of anything.

### Backend module layout
`apps/backend/src/modules/<domain>/` — one NestJS module per business domain (crm, proposals, approvals, contracts, billing, fitout, tickets, sap, patrol, parking, inventory, work-orders, sales, spaces, tenants, users, auth, ai, reports, analytics, audit-log, announcements, bookings, service-contracts, categories, notifications, slots, branding). Cross-cutting concerns (guards, decorators, filters, interceptors, shared services like `MallAccessService`) live in `apps/backend/src/common/`.

Global request pipeline set up in `main.ts`: helmet, CORS from `CORS_ORIGIN` env (required in production), global `/api` prefix, global `ValidationPipe`, `HttpExceptionFilter`, and response-wrapping `TransformInterceptor` (`{ success, data }` — paginated responses keep `total`/`page` alongside `data`). `AuditLogInterceptor` logs all write operations. Swagger UI only mounts outside production unless `SWAGGER_ENABLED=true`.

### Deal approval workflow
Discount-based routing: ≤5% → Leasing Manager, 5–10% → Mall Director, >10% or rent-free >60 days → CEO; Finance + Legal are always added as approvers. Modeled via `ApprovalWorkflow`/`ApprovalStep`/`ApprovalPolicyRule` in the Prisma schema.

### Frontend structure
`apps/frontend/src/pages/<domain>/` mirrors the backend module list. `src/api/<domain>.ts` are thin Axios wrappers (shared instance in `src/lib/axios.ts`, which attaches the bearer token from `localStorage`, unwraps the `{success,data}` envelope, and redirects to `/login` on 401). `src/store/` holds Zustand stores (`auth.store.ts`, `mall.store.ts` for the active-mall selector, `spaces.store.ts`). Route/module access control is centralized in `src/lib/permissions.ts` (`ROUTE_PERMISSIONS`, `canAccessModule`/`canAccessPath`) and must stay in sync with backend `@Roles` guards per module — check both sides when changing who can access a module. `NAV_GROUPS` in the same file defines sidebar structure and is grouped by real business phase (sales process vs. CRM vs. operations vs. finance), not by entity type.

### i18n
Frontend UI strings and code comments are primarily Vietnamese (`src/lib/i18n.ts`, `src/locales/`). Match existing language when editing UI copy or comments in Vietnamese-authored files.

### Database
Single Prisma schema at `apps/backend/prisma/schema.prisma` (~3000 lines, 100+ models) is the source of truth for the domain model — check it before assuming a field/relation exists. Seed data (`prisma/seed.ts`) creates one sample mall (THISO Mall Sala) with units, tenants, leads, contracts, invoices, tickets, and 3 months of sales history; default seeded logins are documented in `README.md`.
