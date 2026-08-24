# System Truth — Agent Bootstrap

Read this before touching code in this repository. Full detail is in the rest of `docs/system-truth/`; this is the five-minute version.

## Platform in one paragraph
THISO Leasing Platform: NestJS (Prisma, not TypeORM) + React mall-leasing ERP, 31 backend modules, covering CRM→Booking→Proposal→Approval→Contract, Contract→Billing→Invoice→Payment→AR, Contract→Fitout→Handover, plus Parking/Service-Contracts/Sales/Slots adjacent revenue, Tickets/Patrol/Work-Orders/Inventory mall operations, and Dashboard/Reports/Analytics/AI reporting. Mid-rollout on VND/USD/MMK multi-currency support, complete and correct through the core leasing chain, incomplete in several adjacent modules. **There is no "Company" entity** — only Mall (flat) and the ADMIN/CEO bypass-role mechanism.

## The 5 highest-risk areas right now
1. **Mall-scoping gaps (CONTRA-008, P0)** — Spaces(units), Analytics, Reports, Sales, Parking-Dashboard, Fitout-controls/gantt/daily-report-photos, AI, and CRM all have confirmed cross-Mall data exposure. Before touching any of these modules, verify your change doesn't rely on Mall-scoping "probably being enforced somewhere" — check explicitly.
2. **Currency-mixing/loss bugs (CONTRA-005, 010, 011, P0/P1)** — `billing.service.ts:findAllInvoices()` summary, ServiceContracts' `transferPaymentToBilling()`, and the revenue-share formula all have confirmed currency bugs. Any change touching invoice aggregation or cross-module invoice creation must re-check currency propagation explicitly, not assume it's handled.
3. **Duplicated financial/occupancy formulas (CONTRA-012, P1)** — Dashboard/Reports/Analytics/AI each independently reimplement "collected revenue" and "occupancy rate" with subtly different results. Before adding a new report/metric, check `13-REPORTING-DEFINITIONS.md` for whether one already exists to call.
4. **Contract termination is not fully atomic (CONTRA-014, P1)** — the one transaction-boundary gap in an otherwise best-in-class module. Don't assume Contracts is uniformly hardened just because activation is.
5. **File/document access control is unverified (BC-018, P0-if-true)** — a prior security-readiness doc flags `/uploads` as possibly served before auth guards. Not re-verified this pass. Treat any file-URL-based access as unproven-safe until confirmed.

## The 3 things most likely to be gotten wrong by a new agent
1. **Assuming `MallAccessGuard` (global `APP_GUARD`) means every route is Mall-scoped.** It is heuristic and fails open. Always check whether the specific controller makes an explicit `mallAccess.assertMallAccess`/`extractAndValidateMallAccess` call — don't infer safety from the guard's global registration.
2. **Assuming a financial formula exists in exactly one place.** "Outstanding balance" has 6+ implementations in Billing alone; "occupancy rate" has 5. Check `12-FINANCIAL-SEMANTICS.md`/`13-REPORTING-DEFINITIONS.md` before adding a 7th or 6th.
3. **Assuming currency is present wherever money is.** Parking statements/lines/payments, Sales turnover, and Slot bookings have **no currency field at all** in their Prisma models. Check `SYSTEM_MONEY_MAP.md` before writing any code that reads/writes an amount.

## Where to look before touching each major domain
| Domain | Read first |
|---|---|
| CRM/Booking/Proposals/Approvals/Contracts | `01-END-TO-END-BUSINESS-PROCESS.md` BP-001, `02-DOMAIN-OWNERSHIP.md` (weak write boundaries here) |
| Billing/Parking/ServiceContracts/Sales/Slots | `12-FINANCIAL-SEMANTICS.md`, `16-MULTI-CURRENCY-SEMANTICS.md`, `SYSTEM_MONEY_MAP.md` |
| Spaces/Fitout/WorkOrders/Tickets/Patrol/Inventory | `04-STATE-MACHINES.md` (Unit/Fitout/Ticket/WorkOrder machines), `15-MULTI-MALL-MULTI-COMPANY.md` (Spaces gap) |
| Tenants/Auth/Users/Categories/AuditLog | `11-ROLE-PERMISSION-MATRIX.md`, `15-MULTI-MALL-MULTI-COMPANY.md` |
| Dashboard/Reports/Analytics/AI/SAP | `13-REPORTING-DEFINITIONS.md`, `09-EVENT-CATALOG.md` (SAP's manual-only automation) |

## Current Program Board phase
P0 (System Truth Reconstruction) — **complete as of this document**. P1 (Architecture Contradictions) is next; see `docs/ai-erp-team/13-PROGRAM-BOARD.md` (updated) and `SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md` for recommended sequencing within P1.

## Open BC-xxx items that block common work areas
BC-004 (revenue-share currency), BC-009 (Spaces gap real-world exploitability), BC-013 (Reports/Analytics mall-scoping intent), BC-018 (`/uploads` guard bypass current status) are the four highest-leverage open items — see `BUSINESS_CONFIRMATION_REQUIRED.md`.
