# System Truth — Module Inventory

Authoritative, verified 2026-08-21. Supersedes the hypothesis in `docs/ai-governance/01-PLATFORM-SCOPE.md` (which recorded 30 backend modules; corrected to 31 here).

## Backend modules (31)

| Module | Business capability | Frontend page(s) | Functional owner (verified vs. hypothesis) |
|---|---|---|---|
| crm | Lead pipeline + Customer (post-win) profile | `crm`, `deals` (unified Kanban) | Leasing Functional Consultant — hypothesis MATCHES, but boundary is not clean (many modules write `prisma.lead`/`prisma.customer` directly) |
| booking | Pre-proposal unit-hold queue (PENDING/ACTIVE/EXPIRED/CANCELLED/CONVERTED) | `bookings` | Leasing Functional Consultant — MATCHES, cleanest write-boundary of the 5 core-leasing modules |
| proposals | Commercial-terms draft + approval trigger + contract conversion | `proposals` | Leasing Functional Consultant — MATCHES, boundary not clean (many direct `prisma.proposal` writers) |
| approvals | Generic sequential multi-step approval engine (entity-agnostic) | `approvals` | Leasing Functional Consultant — MATCHES; this is the **cleanest-owned** module found platform-wide (zero external direct writers to its tables) |
| contracts | Legal lease record, e-signature, amendments, termination | `contracts` | Leasing Functional Consultant — MATCHES, boundary not clean; **termination sub-flow is the one transaction-boundary gap in this domain** |
| billing | Invoices, payments, AR aging, dunning, penalty interest, revenue-share calc | `billing` | Finance Functional Consultant — MATCHES; owns the platform's single largest duplicate-formula surface internally (6 independent "outstanding balance" implementations) |
| service-contracts | Vendor/counterparty contracts (receivable + payable), milestone payments | `service-contracts` | Service Contract Consultant — MATCHES |
| parking | Tenant long-term parking contracts, monthly statements | `parking` | Parking Consultant — MATCHES |
| parking-dashboard | **Read-only reporting proxy over an external legacy MSSQL parking-gate system** — not the same financial system as `parking` | `parking-dashboard` | Parking Consultant — hypothesis assumed this was the same domain as `parking`; **verified to be an entirely separate system** (no shared Prisma model) |
| sales | Tenant-submitted monthly turnover for revenue-share billing | `sales` | Sales/Revenue Share Consultant — MATCHES |
| sap | Outbound push integration to external SAP FI + reconciliation | `sap` | SAP/Integration Architect — MATCHES |
| slots | Short-term "slot" (kiosk/pop-up) bookings with tiered pricing rules | `bookings` (shared with `booking`) | Mall Operations Consultant (hypothesis said "Bookings" grouping) — MATCHES functionally but frontend page is shared with the `booking` module, not a distinct page dir |
| spaces | Mall→Floor→Zone→Unit master data + lifecycle, unit media/map | `spaces` | Mall Operations Consultant — MATCHES; **confirmed mall-scoping gap**, see `15-MULTI-MALL-MULTI-COMPANY.md` |
| fitout | Tenant fit-out construction workflow (config-driven 9-stage pipeline) | `fitout` | Fitout Functional Consultant — MATCHES; best-transacted module found in this audit |
| work-orders | General maintenance/incident task workflow + recurring templates | `work-orders` | Mall Operations Consultant — MATCHES |
| tickets | Tenant-facing + staff-created service/inspection tickets, maintenance schedules | `tickets` | Tenant Experience Consultant — MATCHES; **confirmed tenant-isolation gap on 3 endpoints** |
| patrol | Security/ops patrol routes, shifts, anti-fraud checkpoint verification | `patrol` | Mall Operations Consultant — MATCHES; anti-fraud (QR/geofence/too-fast) confirmed intact |
| inventory | Mall-scoped stock/asset ledger (IN/OUT/RETURN/ADJUST) | `inventory` | Mall Operations Consultant — MATCHES; cleanest transaction discipline of the space-ops group |
| tenants | Leasing-customer master record + portal login lifecycle | `tenants`, `tenant-portal` (consumer) | Tenant Experience Consultant — MATCHES |
| dashboard | Role-shaped KPI snapshot, single- and cross-mall | `dashboard`, `cross-mall` | Reporting Architect — MATCHES; correctly mall-scoped (positive example) |
| reports | On-demand report generation (occupancy/pipeline/revenue/AR/compliance) | `reports` | Reporting Architect — MATCHES; **confirmed mall-scoping gap** (no `MallAccessService` usage at all) |
| analytics | Occupancy snapshots, renewal-risk scoring, compliance exports, multi-mall comparison | `analytics` (`pipeline-stats` unclear — not independently traced) | Reporting Architect — MATCHES; **confirmed mall-scoping gap**, plus one dead/unregistered scheduled job |
| auth | Login/registration/session bootstrap, JWT issuance, invite tokens | `auth`, `profile` | Security Architect — MATCHES |
| users | Staff account CRUD + per-mall access assignment (`UserMallAccess`) | `admin` | Security Architect — MATCHES |
| categories | Global taxonomy + per-mall/category/floor/zone pricing rules | (no distinct page dir — embedded in admin/pricing UI) | Master Data Architect — MATCHES |
| audit-log | Global write-action audit trail (mutations only, not reads) | `audit-log` | Security Architect — MATCHES; comprehensive for mutations, structurally blind to reads and to `/auth/*` events |
| notifications | In-app + email notifications, contract-expiry/renewal/follow-up/AI-insight schedulers | `announcements` (adjacent, not the same module) | Reliability Architect — MATCHES |
| ai | Chat assistant (Anthropic-backed) + floor-plan vision analysis | `ai` | Chief ERP Architect (novel/cross-cutting) — MATCHES; **confirmed unscoped mall context** in chat |
| telemetry | Frontend client-error logging (log-only, not persisted) | (no distinct page dir) | Reliability Architect — MATCHES |
| branding | Singleton white-label logo/background settings | (embedded in admin/shell UI) | ERP UX Architect — MATCHES |
| announcements | Mall-scoped bulletin-board notices | `announcements` | Tenant Experience Consultant — MATCHES; correctly enforces tenant→mall scoping (positive example) |

## Frontend-only groupings without a distinct 1:1 backend module

`admin` (Users module UI), `cross-mall` (Dashboard module's cross-mall endpoint), `deal-pipeline` (empty/dead route — confirmed, no content found), `deals` (CRM's unified pipeline view), `pipeline-stats` (not independently traced to a specific backend source this pass — **UNKNOWN**, see below), `profile` (Auth/Users self-service UI), `tenant-portal` (consumes Tickets/Billing/Sales/Announcements APIs, not its own backend module).

## Reconciliation with `docs/ai-governance/01-PLATFORM-SCOPE.md` hypothesis

- Modules present in the hypothesis and confirmed in code: all 31 named there.
- Count correction: hypothesis said 30 backend modules; verified count is **31**.
- Grouping corrections: "Parking (+ Parking Dashboard)" in the hypothesis implied one financial domain — **corrected**: `parking` and `parking-dashboard` are entirely separate systems (different databases, no shared entities). "Slots" was grouped under "Space / Mall Operations" in the hypothesis but functionally belongs with the Financial Core group (it's a booking-and-billing model, audited alongside Billing/Parking/Sales/Service-Contracts in this reconstruction) — grouping is a soft classification either way, not a hard finding.
- `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`: what backend module(s), if any, `pipeline-stats` frontend page actually consumes — not resolved in this pass.

## Verified count as of this reconstruction

- Backend modules: **31** (2026-08-21)
- Frontend page directories: **31**, excluding `NotFoundPage.tsx` (2026-08-20)
