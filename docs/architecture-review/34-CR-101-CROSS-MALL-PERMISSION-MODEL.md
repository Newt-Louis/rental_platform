# 34 — CR-101 Cross-Mall Permission Model

Audit/design only. No code changed. This document defines the *concepts* precisely enough for a future implementation phase to build against; it does not implement anything.

## 1. CROSS_MALL_READ — precise definition

**CROSS_MALL_READ = the ability to read records across the platform's full enterprise Mall set, independent of and in addition to whatever `UserMallAccess` grants a user individually holds.**

It explicitly does **not** imply, and must never be inferred to include:
- CREATE, UPDATE, or DELETE any record
- APPROVE any workflow step
- Any ADMIN/system-configuration capability
- EXPORT (kept separate — see §5)

This is not a new invention: the platform already has a working, narrowly-scoped precedent — `GET /dashboard/cross-mall`, gated by `MODULE_ROLES.crossMall = [ADMIN, CEO]`, and a `crossMallRead?: boolean` field already exists on the `@Scope(...)` decorator's metadata type (`scope.types.ts:85`), explicitly documented there as **"declared, not granted"** — i.e., the metadata records that a route is *intended* to be a cross-Mall-read route, but the actual grant still comes from the ordinary `@Roles` check. `19-CR-101-ADR.md` (the accepted capstone ADR) already proposed formalizing this into a single explicit `CROSS_MALL_READ` scope applied consistently — this document confirms that proposal is still current and extends it with the fuller evidence gathered this phase.

### All-Mall vs. assigned-multi-Mall vs. explicit-Mall-set
Given the organizational model confirmed this session — `seed.ts:1576-1580` grants CEO `UserMallAccess` rows "to all malls" explicitly, and the persona document frames CEO's need as *portfolio-level, enterprise-wide* visibility ("I want to know... if anything **across all malls** needs my personal decision") — the correct semantic for CEO's CROSS_MALL_READ is **all-Mall**, not a narrower "assigned-multi-Mall" or "explicit-Mall-set" variant. Those narrower variants remain available as *general* platform concepts (a `MALL_DIRECTOR` legitimately assigned to 3 Malls already gets "assigned-multi-Mall" for free via ordinary `UserMallAccess`), but CEO specifically should resolve to the unrestricted case.

## 2. CROSS_MALL_WRITE — investigated, evidence found

The earlier `19-CR-101-ADR.md` stated: *"A CROSS_MALL_OPERATE (write) permission is not proposed — no current route was found requiring cross-Mall write capability."* **This phase's re-verification found one confirmed counter-example**, so that earlier claim is corrected here, not silently left standing:

**`POST /spaces/units/bulk-update`** (`spaces.service.ts` `bulkUpdateUnits`, ~line 1297-1335) accepts a `unitIds[]` array with no same-Mall restriction — each individual unit's Mall is checked against the caller's `getAccessibleMallIds()` set, but the *set of units in one call* may legitimately span two or more different Malls for any caller whose accessible-Mall set itself spans multiple Malls (any `UserMallAccess`-multi-Mall user, or ADMIN/CEO via bypass). This is a genuine single-request, multi-Mall write (bulk category/rent/CAM/condition field updates, capped at 100 units, VACANT-only). It is **not** an accident of missing validation in the way `CONTRA-008`-class gaps are — every touched unit's Mall access IS individually checked; the code simply never added a same-Mall constraint the way its sibling `mergeUnits` explicitly does (`spaces.service.ts:1618-1621` throws if `mallIds.size > 1`).

**Verdict: `REQUIRED` (evidenced), but intent is unconfirmed — `BC REQUIRED`.** Two readings are equally plausible from the code alone:
- (a) **Intentional**: a genuine power-user feature — someone with legitimate multi-Mall access (a multi-Mall `MALL_DIRECTOR`, ADMIN, or CEO) bulk-editing a portfolio-wide pricing/category change in one action is a real, useful capability.
- (b) **Oversight**: `mergeUnits` got an explicit same-Mall guard because merging genuinely cannot cross Malls; `bulkUpdateUnits` may simply never have had the same pattern applied, not because it was deliberately exempted.

No dedicated "transfer Unit/Contract between Malls" endpoint exists anywhere in the codebase (grepped for `transferMall`/`changeMall`/`moveToMall`/`reassignMall` — zero results). This is the **only** confirmed cross-Mall write capability on the entire platform.

**Recommendation**: resolve this as its own narrow, single-route BC item (call it `BC-BULK-UNIT-CROSS-MALL`), separate from `BC-CEO-SCOPE` — it is not CEO-specific (any multi-Mall-assigned staff member can already trigger it today) and doesn't need to block a CEO-scope decision either way.

## 3. Current multi-Mall user model — canonical equation

Elements in play today, confirmed by code:
- `UserMallAccess` (`userId, mallId, role, isActive`, unique per `[userId, mallId]`) — the base per-user, per-Mall grant table.
- `Role` — coarse module-level gating (`@Roles`/`MODULE_ROLES`), answers "can this role touch this domain at all," independent of Mall.
- `MallAccessService.getAccessibleMallIds(userId, role)` — returns the user's active `UserMallAccess` mall IDs as an array, **or `null`** for `BYPASS_ROLES` members (meaning "unrestricted," not "empty").
- `MallAccessService.assertMallAccess(userId, role, mallId)` / `extractAndValidateMallAccess(...)` — the actual per-request enforcement primitive.
- **No `CROSS_MALL_READ` permission exists as a first-class concept today** — the only working instance is the `MODULE_ROLES.crossMall` role-list pattern on one route.
- **No "selected Mall" concept exists in the backend at all** — confirmed by a fresh grep this session (`selectedMall`/`selectedMallId`: zero backend matches). It is purely a frontend UI construct (`MallContextModal.tsx` and friends).

**Canonical equation (design, not implemented):**

```
EffectiveReadScope(user) =
    BYPASS_ROLES.includes(user.role)
      ? UNRESTRICTED (all Malls)
    : hasCrossMallRead(user.role, route)
      ? ALL_MALLS  // e.g. future CEO CROSS_MALL_READ on the 5 documented domains
    : UserMallAccess-derived set for user.id   // the ordinary case, today's default
```

`EffectiveReadScope` for WRITE operations should, per the evidence in §2, remain the same formula **minus** the `hasCrossMallRead` branch for every domain except the one confirmed `bulk-update` case pending its own BC — i.e., cross-Mall write is not a general capability, it is at most a single named exception.

## 4. Selected Mall — UI context only, confirmed

Selected Mall is, and per this document's recommendation **must remain**, a **UI-context-only** concept — it narrows *which subset* of the backend-authorized set the frontend currently displays/queries by default, but must never be capable of *expanding* authority beyond `authorizedMallIds`/`getAccessibleMallIds()`'s result. Concretely:

| User type | Expected behavior |
|---|---|
| 1 assigned Mall | No real "selection" — always that one Mall; selected-Mall UI is a no-op |
| Multiple assigned Malls | Frontend may let the user pick one Mall to focus the UI on, but every backend call still carries (or the backend still independently re-derives) the full authorized set — "selected" only prunes what's *displayed*, the backend must not trust a client-supplied "I'm currently viewing Mall X" as an authorization signal |
| CROSS_MALL_READ (future CEO) | Same principle — "selected Mall" narrows the dashboard view; switching it never grants access to a Mall outside the (in CEO's case, unrestricted) authorized set, and switching away from "all Malls" view must not accidentally *narrow* CEO's actual authorization to just the selected one either |
| ADMIN | Already special-cased in the frontend (`MallContextModal.tsx:15-17`, confirmed by the earlier ADR) as not needing to select a Mall context at all |
| CEO | Same as ADMIN today (bypass); under Option A/B (see `35-...-IMPLEMENTATION-PLAN.md`), CEO would move to the "CROSS_MALL_READ" row above |

No backend change is implied by this section — it already behaves this way by simple absence of the concept. This is recorded so a future implementation doesn't accidentally introduce a `selectedMallId` *server-side* trust point without this constraint in mind.

## 5. Export — kept as a derived permission, not a new axis

**Finding**: every export-capable route found this session (`inventory`, `proposals/:id/pdf`, `service-contracts/export`, `reports/export/:type`, `parking-dashboard/transactions/export`, `analytics/compliance/exports*`, `work-orders/export`) is gated by **the same role list as that domain's general VIEW/read access** — no domain in the current codebase treats export as a separately-elevated permission from view. `billing`'s export uses the narrower `billingStaff` list, but that's consistently the same list used for billing's other operations, not an export-specific carve-out.

**Recommendation**: keep this pattern. Do not introduce a separate EXPORT permission axis — add unnecessary complexity for zero current benefit, per the "do not invent complexity without need" instruction. The practical consequence: whatever CEO's future READ scope becomes per-domain (Option A/B/C), export access narrows or stays identical automatically, with no separate export decision required **except** to flag explicitly: if CEO's Work Orders/Parking/Analytics access narrows to read-only or is removed, export on those routes narrows identically for free, since it was never a separate grant.

## 6. Approvals — traced, mechanism confirmed sound

CEO's approval capability is **entirely data-driven** via `ApprovalPolicyRule.approverRole` / `ApprovalStep.approverRole` — not hardcoded to any entity type in application code. Today it is used exclusively for Proposal high-stakes gates (matching the persona's own JTBD: ">10% discount, >60d rent-free"). The mechanism is also technically reachable for Fitout Submittal approval steps (`fitout-submittal.service.ts`'s `buildApprovalSteps`, driven by `formType.approverRoles` or a `DEFAULT_APPROVER_ROLE = 'OPERATION'` fallback) — but no current seed/config data configures CEO there, so there is zero live CEO exposure to Fitout approvals today.

**This is the one domain that already matches documented intent exactly** — CEO's approval reach is a business-policy-configured allow-list, not a code-level blanket grant, and closely tracks "approvals (final-tier)" as described. No BC item is required for the *mechanism*; the only open question is whether it's acceptable that a future policy-rule change (an ADMIN/MALL_DIRECTOR editing approval policy config) could add CEO as an approver to a *non-Proposal* entity type without any code-level guard preventing it — flagged as a minor forward-looking note, not a current finding.

## 7. Document (Files) access — policy question only, per this authorization's explicit instruction not to reopen File architecture

**Current state** (from `33-CR-101-CEO-CAPABILITY-MATRIX.md`'s Files row): CEO can currently download Contract/Ticket/Parking/ServiceContract/WorkOrder/PatrolCheck files, and cannot download Invoice/Fitout(any)/Maintenance files — a set that exactly mirrors whatever module-level access CEO happens to have elsewhere (except Tickets, an anomaly: CEO has zero Tickets *module* access but the Files-Ticket branch has no role gate at all for *any* staff role, not just CEO).

**Policy answer, no implementation implied**: CEO's document access should continue to track its module access as that access evolves — i.e., under Option A/B (see implementation-plan doc), if Parking/Work Orders narrow to read-only, CEO's *download* access to those families should logically remain (read implies "may view the attached document," which is a reasonable default), but *upload/replace* document actions tied to those write routes would correctly disappear along with the write access itself. No independent Files-specific CROSS_MALL_READ exception is proposed — Files should simply inherit whatever the resolved per-domain policy says, exactly as it already structurally does today.

## 8. AI — must follow the resolved CEO policy, no bespoke exception

Per Phase 3D (`CR-101-PHASE-3D-AI-SCOPE-COMPLETION.md`), CEO's AI context today resolves via `MallAccessService.getAccessibleMallIds()` returning `null` for `BYPASS_ROLES` members, which `AiService.buildContext()`/`getSuggestions()` correctly treat as "no Mall filter" (global). This is not an AI-specific decision — it is the AI module correctly inheriting whatever the platform-wide Mall-scope primitive already says about the calling user. Under every option in `35-...-IMPLEMENTATION-PLAN.md`, AI requires **zero AI-specific code change**: if CEO's general Mall-scope resolution moves from unconditional bypass to CROSS_MALL_READ-for-five-domains (AI being one of the five), `getAccessibleMallIds()`'s *implementation* would need to return "unrestricted" for AI-context purposes specifically (not necessarily for Parking/WorkOrders purposes) — a detail for the eventual implementation phase, not a new policy question. AI's authorization domain remains CLOSED per this authorization; this section is analysis only.

## 9. ADMIN — reconfirmed, not re-opened

Per this authorization's Section 15 instruction ("If current evidence still supports ADMIN = platform administrator/global access, mark CONFIRMED, do not ask business to reconfirm unless evidence is contradictory"): **CONFIRMED**. No new evidence this session contradicts the ADR's prior finding — `admin: [Role.ADMIN]` remains a clean, single-role, fully-consistent allow-list for the Users/Admin domain, `ADMIN` remains in `BYPASS_ROLES` with no narrowing anywhere found, and the frontend's `MallContextModal.tsx` special-case for `isAdmin` (not re-verified this session, carried forward from the ADR) remains uncontradicted.
