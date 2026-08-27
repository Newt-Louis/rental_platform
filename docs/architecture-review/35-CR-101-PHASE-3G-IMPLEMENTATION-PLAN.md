# 35 — CR-101 Phase 3G Implementation Plan (per-option delta)

Audit/design only. No code changed, nothing here is authorized to implement. This is the "if the business picks Option X, here is exactly what would need to change" reference, prepared so a future implementation authorization doesn't need to re-derive scope from scratch.

## Option A — Executive Global Read, Restricted Operational Write

**Concept**: CEO keeps unrestricted (all-Mall) READ on Dashboard/Reports/Analytics/Audit-Log/AI/cross-mall Dashboard, keeps its Approvals capability exactly as today (already policy-driven, already correct), and loses operational WRITE on Proposals/Parking/Work Orders/Sales-creation. Analytics' config-write routes (`upsertMallPolicy`, `updateMallRetention`) move to ADMIN/MALL_DIRECTOR-only.

### Affected areas
- **`role-permissions.ts`**: no `MODULE_ROLES` list needs CEO *removed* entirely (Proposals/Parking/Sales/Service-Contracts keep CEO for read); instead, method-level `@Roles` overrides need to be *added* on the specific write routes to exclude CEO where the module-level list currently includes it broadly. Work Orders needs a new narrower `WORK_ORDERS_WRITE_ROLES` (excluding CEO) on create/update/status/review/checklist/template routes, keeping the existing broader `ROLES` for read/list/export.
- **`MallAccessGuard`**: no change — CEO would no longer be in `BYPASS_ROLES` unconditionally; instead `MallAccessService` would need a new code path (`hasCrossMallRead(role, routeMeta)`) consulted only for the 5 documented domains, falling back to ordinary `UserMallAccess`-derived scoping for everything else CEO can still read. This is the largest structural change of any option — `BYPASS_ROLES` today is a flat list, not domain-aware.
- **Scope metadata**: the existing `crossMallRead?: boolean` field on `@Scope(...)` (`scope.types.ts:85`) already anticipates exactly this — it would go from "declared, not granted" (descriptive only) to actually consulted by the guard for the first time. This is a meaningful new dependency, not a trivial flip.
- **Controllers**: `analytics.controller.ts` (split read vs. config-write role lists), `proposals.controller.ts` (narrow write routes), `parking.controller.ts` (narrow write routes), `work-orders.controller.ts` (narrow write routes), `sales.controller.ts` (narrow the record-creation route only, keep approve/dispute).
- **Frontend**: menu/visibility for CEO would need to hide "create/edit" affordances on Proposals/Parking/Work Orders/Sales while keeping the pages themselves (read-only view) reachable; `MallContextModal.tsx` would need a new "cross-Mall / all-Mall" mode for CEO, distinct from both "single Mall selected" and today's "no selector needed" ADMIN-style bypass.
- **Tests**: every existing test asserting CEO can write Proposals/Parking/Work-Orders/Sales-create would need updating (a real, non-trivial regression-suite change — not additive-only, unlike every prior CR-101 phase in this program).
- **AI**: no AI-specific code change (see `34-...-PERMISSION-MODEL.md` §8) — `getAccessibleMallIds()`'s return value for CEO would change from unconditional `null` to a domain-aware result, which AI (and every other consumer) picks up automatically.
- **Files**: no Files-specific code change required — CEO's document access narrows automatically as the underlying module write routes narrow (per `34-...` §7), *if* the implementer chooses to gate Files identically; this needs its own small explicit check per family at implementation time, not assumed to cascade for free (Files' role gates are independent constants, not derived from `MODULE_ROLES` at runtime).
- **Reports/Analytics policy (`BC-013`)**: orthogonal to CEO specifically — Option A does not require resolving BC-013 for `LEASING_MANAGER`/`MALL_DIRECTOR`/`FINANCE`'s Reports/Analytics scope; CEO's own Reports/Analytics access under Option A is explicitly "all-Mall by CROSS_MALL_READ," decided independently of what the non-bypass roles get.

**Consequences**: Removes live capability (CEO can no longer directly create/edit Proposals, Parking contracts, Work Orders, or Sales submissions) — requires confirming no current real workflow depends on this before implementing. Closes all 3 confirmed contradictions (Proposals, Parking, Work Orders) plus the milder Sales/Analytics-config ones. Matches the ADR's original recommendation, extended with this phase's additional Work Orders/Sales findings.

## Option B — Persona-Limited

**Concept**: CEO's module list is trimmed to *exactly* the five persona-documented domains: Dashboard (incl. cross-mall), Analytics (read-only), Reports, Approvals (already correct, unchanged), AI. Everything else CEO currently touches (Proposals full access, Parking, Service Contracts, Sales, Work Orders, Audit Log) is removed entirely, not merely narrowed to read.

### Affected areas
All of Option A's areas, plus:
- **Proposals**: CEO removed from `MODULE_ROLES.proposals` entirely (not narrowed to read) — CEO would see Proposals only through the Approvals queue for steps assigned to it, never a general Proposals list/detail view.
- **Service Contracts, Sales**: CEO removed from `VIEW_ROLES`/`sales`/`salesStaff` entirely — loses even the clean read-only access these two domains currently grant with no contradiction.
- **Audit Log**: CEO removed from `MODULE_ROLES.auditLog` — not persona-documented, so a strict reading of Option B removes it, though this is arguably an oversight-tool the persona doc simply didn't think to list explicitly; flagged as a judgment call within Option B itself.

**Consequences**: Most faithful to the literal persona document text; largest behavior change of the three options; highest risk of breaking an undocumented-but-real workflow (e.g., if CEOs in practice do use Service-Contracts read access, or Audit Log, for a legitimate reason the persona doc simply never captured). Recommend, if Option B is chosen, a short stakeholder confirmation pass on Service Contracts/Sales/Audit-Log specifically before implementation, since those three are not contradictions today (unlike Proposals/Parking/Work-Orders) — removing them isn't fixing a bug, it's a fresh restriction with its own separate risk.

## Option C — Current Broad Bypass, Formally Ratified

**Concept**: Keep CEO's module list and `BYPASS_ROLES` membership exactly as-is. Update the persona document instead of the code, treating today's broader grant as the actual intended scope.

### Affected areas
**Application code**: none. **Documentation**: `docs/audit/02-PERSONAS-JOBS-TO-BE-DONE.md:107-110` would need its persona text rewritten to match current reality (e.g., "CEO gets cross-mall, analytics, approvals, reports, ai, proposals, parking, work orders, sales — operational write access retained for [stated business reason]"). This is itself a business-communication artifact, not a throwaway doc edit — whoever owns that persona document would need to sign off on the new wording, and it would need a stated *reason* for each currently-broad grant (today's docs record no rationale for why CEO can, say, run Work Order templates).

**Consequences**: Zero behavior change, zero regression risk, zero test changes. Leaves the confirmed cross-Mall exposure on Proposals/Parking/Work-Orders/Sales-creation in place indefinitely. Does not resolve *why* the persona doc and the code disagree (aspirational doc that was never built to spec, vs. code that drifted from an originally-narrower design — `seed.ts` granting CEO `UserMallAccess` to all Malls explicitly, rather than relying purely on bypass, is a data point favoring "code drifted from an original narrower design," per the ADR's own observation, but this is circumstantial, not conclusive).

## Common test plan (applies regardless of chosen option, adjusted per-option for expected pass/fail)

Role-based test matrix, one block per role:

| Role | Same-Mall read | Cross-Mall read | Cross-Mall write | Approval | Export | File access | AI | Reports/Analytics |
|---|---|---|---|---|---|---|---|---|
| ADMIN | ✅ always | ✅ always | ✅ always (unchanged, out of scope) | ✅ | ✅ | ✅ | ✅ global | ✅ global |
| CEO | ✅ (5 or more domains per option) | Per option: A/B=✅ 5 domains only, C=✅ everywhere | Per option: A/B=❌ (except the separately-tracked bulk-unit BC), C=✅ everywhere | ✅ (unchanged in every option) | Per option, mirrors read | Per option, mirrors read | ✅ global (unchanged in every option) | Per option |
| MALL_DIRECTOR, single Mall | ✅ own Mall | ❌ | ❌ | Per policy config | ✅ own Mall only | ✅ own Mall only | ✅ own Mall only | Pending `BC-013` |
| MALL_DIRECTOR, multiple assigned Malls | ✅ assigned set | ❌ (unless separately BC-approved for the bulk-unit case) | Per `BC-BULK-UNIT-CROSS-MALL` | Per policy config | ✅ assigned set | ✅ assigned set | ✅ assigned set | Pending `BC-013` |
| Normal staff (LEASING_MANAGER/EXECUTIVE/FINANCE/LEGAL/OPERATION) | ✅ own Mall(s) | ❌ | ❌ | Per policy config | ✅ own Mall(s) | ✅ own Mall(s) | ✅ own Mall(s) | Pending `BC-013` |

Each cell above needs both an ALLOW and a DENY test once an option is chosen and implemented — this table is the design target, not new test code (none was written this phase, per the "no application change" instruction).

## UAT scenarios (human-executed, once an option is chosen)

1. CEO opens enterprise Dashboard → sees all-Mall aggregate (expected: ✅ in every option).
2. CEO opens a Mall-A Contract detail page → expected: ❌ (unchanged in every option — Contracts access was never granted to CEO in the first place).
3. CEO opens a Mall-B Proposal detail page → expected: Option A/B = ✅ read-only view, no edit/submit/reject buttons; Option C = ✅ full edit as today.
4. CEO attempts to create a new Parking contract → expected: Option A/B = ❌ (403 or hidden UI); Option C = ✅ unchanged.
5. CEO performs a required Proposal approval (their configured high-stakes step) → expected: ✅ in every option (Approvals is unchanged across all three).
6. CEO exports a multi-Mall Reports CSV → expected: mirrors whatever CEO's Reports read-scope is under the chosen option (all-Mall in every option, since Reports is one of the 5 persona-documented domains in both A and B).
7. CEO attempts to run a Work Order template ("run-due") → expected: Option A/B = ❌; Option C = ✅ unchanged.
8. Mall Director A tries to open Mall B's data via direct URL/API call → expected: ❌ in every option (unaffected by this whole review — this is the pre-existing, already-`ENFORCED` non-bypass-role boundary, not something Phase 3G touches).

## Migration / user impact

- **Before → after**: only Options A/B change live user behavior; Option C changes nothing.
- **Communication needed**: if A/B, any human CEO-role account holder needs advance notice that Proposals/Parking/Work-Orders/Sales write access is being removed, with an explicit channel to flag if this breaks a real workflow *before* the change ships (this is exactly why the ADR's Migration Strategy proposes an audit-log-observe-only window before any enforcing change, not a same-day flip).
- **UAT roles needed**: at minimum one real or synthetic CEO account, one ADMIN, one multi-Mall MALL_DIRECTOR, one single-Mall staff account.
- **Rollback**: Options A/B are pure `@Roles`/`BYPASS_ROLES` config changes with no schema/data mutation — reverting is a code revert, not a data migration. No DB migration is required by any option (confirmed — nothing in this whole review touches schema).

## Phase 3G entry gate — current status against the checklist in this authorization's Section 22

| Gate item | Status |
|---|---|
| `BC-CEO-SCOPE` = CONFIRMED | ❌ NOT MET — this is the human decision this whole package is prepared for |
| Cross-Mall read semantics defined | ✅ MET — `34-...-PERMISSION-MODEL.md` §1 |
| Cross-Mall write decision defined | ⚠️ PARTIAL — evidence gathered, one route identified, but its own intent (`BC-BULK-UNIT-CROSS-MALL`) is not yet confirmed |
| Reports/Analytics policy defined | ❌ NOT MET — `BC-013` remains open (unrelated to CEO specifically, applies to `LEASING_MANAGER`/`MALL_DIRECTOR`/`FINANCE` too) |
| Approval policy defined | ✅ MET — already correct, needs no change in any option |
| Document policy defined | ✅ MET (as policy) — `34-...` §7, no implementation implied |
| AI policy aligned | ✅ MET — no AI-specific decision needed, follows whichever option is picked |
| Test matrix ready | ✅ MET — this document's test plan section |
| Rollback ready | ✅ MET — this document's migration section |

**Net: implementation may not start.** The two hard blockers are `BC-CEO-SCOPE` itself (the primary decision) and `BC-013` (a pre-existing, CEO-independent open item that Option A/B's Analytics-read behavior would otherwise inherit ambiguity from). `BC-BULK-UNIT-CROSS-MALL` is a new, narrow, non-blocking item that can be resolved in parallel or after CEO-scope lands.
