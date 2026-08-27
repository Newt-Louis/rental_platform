# 21 — CR-101 AI Scope Design

Audit/design only. No code changed. AI_SCOPE remains **MISSING** (confirmed, not merely suspected).

## Full structural trace

```text
HTTP Request (authenticated, req.user populated by JwtAuthGuard)
  ↓
AiController.chat(body) / .chatStream(body, res) / .getSuggestions()
  — none of the three declare @CurrentUser() — confirmed by reading every method
    signature in ai.controller.ts:33-64 this session. req.user exists on the
    request object (the guard populated it) but is never extracted into these
    handlers' parameters.
  ↓
AiService.chat(message, history) / .chatStream(message, history, onChunk) / .getSuggestions()
  — method signatures confirmed to accept only (message, history) or no
    arguments at all. No user/mallIds parameter exists anywhere in this call chain.
  ↓
AiService.buildContext(message) [private]
  — keyword-matches the message text (occupancy/contract/invoice/revenue/
    ticket/tenant/proposal) and issues its own Prisma queries per matched
    keyword, entirely independent of any caller identity
  ↓
Prisma queries — confirmed this session to include explicit currencyCode: 'VND'
  filters (ai.service.ts:187-188, for the overdue/issued aggregates) but NO
  mallId filter anywhere in this method
  ↓
Response — context text is concatenated into the LLM prompt; the LLM's reply
  is returned to whichever authenticated user asked, with no way for the reply
  to be scoped since the context itself was never scoped
```

## What AI can execute/read

Every query `buildContext()` issues is a platform-wide aggregate or `findMany` with no Mall dimension: occupied/vacant unit counts, overdue invoice sums, contract counts, ticket counts (exact query shapes not re-enumerated line-by-line here — see `ai.service.ts:138+`; the currency-filter confirmation above is the specific new evidence from this session). No per-tenant or per-customer record-level data was found being surfaced (it's aggregate counts/sums, not raw entity dumps) — this matters for severity: the exposure is **aggregate cross-Mall figures**, not raw cross-Mall PII, though aggregate financial figures (overdue totals, occupancy) are still sensitive.

## Which services are called

Only `AiService` itself (direct Prisma access via its own injected `PrismaService`, not through Billing/Contracts/Tickets services) — confirmed no cross-module service imports in `ai.service.ts` beyond the AI module's own boundaries. This means the fix is entirely local to this module; it doesn't require coordinating a scope-threading change across other services' public APIs.

## Whether Mall filters exist

**No**, confirmed. Currency filters exist (for VND-scoping specific aggregates) but no `mallId`/`contract.unit.mallId` filter was found anywhere in `buildContext()`.

## Whether tenant/customer context exists

No — the same absence applies; there is no tenant-scoping either. (Not a regression for Tenant Portal users specifically, since `ai` is not in `MODULE_ROLES` for `TENANT` — this module is staff-only, per `role-permissions.ts:50`. The exposure is cross-Mall among staff, not cross-tenant.)

## Whether AI can retrieve records across Malls

Yes, confirmed — every query in `buildContext()` is unscoped, so a staff user restricted to Mall A receives AI-generated answers informed by Mall B (and every other Mall's) data.

## Whether chat history stores user/mall context

Not verified this session (out of the immediate scope question, which was the request-time data-retrieval path) — `history` is passed as a plain array of `{role, content}` from the client on each request; there's no evidence of server-side persisted chat history tied to a user record found in this pass. Flagged as unverified, not assumed either way.

## Relationship to the separately-found `ai-proactive-insights` job leak

`22-CR-101-JOB-EVENT-SCOPE-REVIEW.md` documents a **confirmed** (not merely structural) cross-Mall leak in the *scheduled* `ai-proactive-insights` job, which sends a platform-wide aggregate insight to every `MALL_DIRECTOR` regardless of Mall assignment. That is a distinct code path (a `@Cron` job in `notifications/contract-expiry.scheduler.ts`) from the *interactive* chat covered in this document, but both stem from the same root pattern: AI-adjacent features were built without threading Mall context through, in two independent places. Both should be fixed together under the same future batch (`AUTH-101D`), not treated as unrelated.

## Recommended minimum future plumbing (design only)

```text
CurrentUser (already available at the guard layer)
  ↓
AiController.chat/.chatStream/.getSuggestions gain @CurrentUser() user: any
  ↓
mallIds = await mallAccess.getAccessibleMallIds(user.id, user.role)  — reuses
  the exact pattern DashboardService already uses correctly
  ↓
AiService.chat(message, history, mallIds) — new parameter threaded through
  ↓
buildContext(message, mallIds) — every Prisma query gains a mallId filter
  (contract.unit.mallId: {in: mallIds}, ticket.unit.mallId: {in: mallIds}, etc.),
  using null/undefined mallIds (bypass roles) to mean "no filter", consistent
  with the existing getAccessibleMallIds(...) ?? undefined convention used
  elsewhere in the codebase
  ↓
Response — now correctly scoped to the requesting user's accessible Malls
```

**AI itself must never decide authorization** — per the review's explicit principle, this design deliberately keeps the Mall-set resolution in `MallAccessService` (the existing, single source of truth) and has `AiService` merely *consume* an already-resolved list, exactly mirroring how `DashboardService` already does this correctly. No new authorization logic is invented inside the AI module.

## Not implemented this phase

No code was changed. This document is the design for a future `AUTH-101D` batch (see `26-CR-101-PHASE-3-BATCH-PLAN.md`).

---

## Status update — CR-101 Phase 3D (`docs/changes/CR-101-PHASE-3D-AI-SCOPE-COMPLETION.md`) — IMPLEMENTED

The "Recommended minimum future plumbing" design above was implemented essentially as specified — `@CurrentUser()` added to `chat`/`chatStream`/`getSuggestions`, `MallAccessService.getAccessibleMallIds()` reused unchanged, an `AiRequestContext` (`{ userId, role, authorizedMallIds }`) threaded through to `AiService`, and every query in `buildContext()`/`getSuggestions()` gained a Mall filter using the exact `null` = bypass-roles-unrestricted convention this document anticipated. **AI itself still never decides authorization** — `MallAccessService` remains the single source of truth, `AiService` only consumes an already-resolved list, matching the design's explicit principle.

**Correction, not a new finding**: line 56 above flagged chat-history persistence as "not verified this session." Phase 3D verified it directly: **no server-side chat history/session storage exists anywhere in the codebase** — `history` is entirely client-supplied per request, never persisted. This closes that open question as N/A, not as a gap.

**The `ai-proactive-insights` job leak** (line 58-60, `22-CR-101-JOB-EVENT-SCOPE-REVIEW.md`) was fixed together in the same Phase 3D batch, exactly as this document recommended (both stemming from the same root pattern) — see the completion doc for the per-Mall partitioning design that replaced the platform-wide-aggregate-to-everyone behavior.

Floor-plan analysis routes (`floor-plan/analyze`, `/analyses`, `/analyses/:id`, `/analyses/:id/status`, `/analyses/:id/apply`) were not the primary subject of this design document but were found to have the same class of gap (3 of 5 routes had zero Mall check at all) and were fixed in the same batch, using a new `floorPlanAnalysis` resolver (`FloorPlanAnalysis.mallId`, direct field, no schema change).

**AI_SCOPE status: no longer MISSING for the interactive chat, floor-plan, and proactive-insights paths covered by this document.** `FIN-01` and `BC-CEO-SCOPE` remain untouched, as this document's scope and the Phase 3D authorization both required.
