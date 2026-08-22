# CR-101 Phase 3D — AI Scope Propagation Baseline (captured 2026-08-22)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114` (unchanged from every prior CR-101 phase — no commit made anywhere in this program yet)
- `git diff --cached`: empty, 0 files staged
- `git status --short`: 112 pre-existing modified/untracked working-tree entries, carried forward from all prior phases through C5.

## Baseline test results
- Backend (`npx jest`): 78 suites / 494 tests passing (Phase 3C C5's final count). No prior AI test coverage existed at all (`find src/modules/ai -iname "*spec*"` → 0 results).
- Frontend baseline (unchanged across every prior phase): 28/29 files, 216/225 tests. Pre-existing, unrelated failure: `BookingsPage.test.tsx`, 9 tests.

## Re-verified AI flow (against executable code, not the old audit text alone)

- `AiController` (`ai.controller.ts`): `chat`, `chatStream`, `getSuggestions` received **no `@CurrentUser()` at all** — confirmed by reading every method signature. `analyzeFloorPlan` read `mallId` from `@Body('mallId')`, unvalidated. `getAnalyses` read `mallId` from query, unvalidated. `getAnalysis`, `getAnalysisStatus`, `applyAnalysis` took only an analysis `:id`, **zero Mall check of any kind**.
- `AiService.buildContext()` (`ai.service.ts`): 7 keyword-gated query blocks (occupancy/Unit, contracts/Contract, invoices/Invoice, sales/SalesTurnover, tickets/Ticket, tenants/Tenant, proposals/Proposal) — **none had a Mall filter**, confirmed by reading every `where` clause.
- `AiService.getSuggestions()`: 4 count queries (Contract, Invoice, Ticket, Unit) — **none had a Mall filter**.
- **No server-side chat history/session storage exists at all** — `history` is entirely client-supplied per request (`body.history`), never persisted server-side. Confirmed by grepping the AI module for any session/history model or write — none found.
- `FloorPlanAnalysis` (the model backing `floor-plan/analyze` and friends) has a **direct, non-nullable `mallId` field** with a real `Mall` relation (`schema.prisma:2609-2610`) — confirmed fresh, not assumed.
- The "ai-proactive-insights" job the readiness review described **does exist**, found at `notifications/contract-expiry.scheduler.ts`'s `sendAiProactiveInsightsUnlocked()` (registered as cron job name `ai-proactive-insights`, not inside the `ai` module directory at all — a naming/location mismatch from what the audit text implied, corrected here, not silently assumed). Confirmed exactly as described: computes ONE platform-wide aggregate (occupancy across all Units, overdue invoices, expiring contracts, open tickets — all unfiltered) and sends the identical generated insight text to every active `ADMIN`/`CEO`/`MALL_DIRECTOR` user.
- `MODULE_ROLES.ai` = `[ADMIN, LEASING_MANAGER, MALL_DIRECTOR, CEO]` — confirmed `TENANT` is **not** included; the AI module is not Tenant-reachable at all.
- `AiService` is referenced only within the `ai` module itself (controller, module, service) — no other module calls it directly; no alternate/bypass entry point exists.

## Data reconciliation (baseline, before this phase's fix)
- `FloorPlanAnalysis`: 0 rows in the dev database.
- Active `MALL_DIRECTOR` users: 1. Active `UserMallAccess` grants: 3. Active `ADMIN`/`CEO` users: 2.

## Scope authorized this phase
**Phase 3D only**: AI scope propagation (interactive chat/chatStream/suggestions + floor-plan analysis) and ai-proactive-insights Mall partitioning. Explicitly **not authorized**: Phase 3E (UnitStatusService), Phase 3G (CEO/Cross-Mall policy), global fail-closed, strict startup enforcement, CI merge blocking, heuristic removal, CR-103 currency work, financial semantics refactor, schema migration, new AI capabilities.
