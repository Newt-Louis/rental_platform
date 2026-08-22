# 07 — Business Confirmation Triage

Classification of all 20 items from `docs/system-truth/BUSINESS_CONFIRMATION_REQUIRED.md`. Where a question was technically resolvable from code, it was investigated this session rather than left open — see the "Resolution" column.

**A** = must confirm before ANY fix. **B** = must confirm before production. **C** = resolved from code/evidence this review. **D** = post-go-live business enhancement.

| BC-xxx | Title | Class | Resolution / rationale |
|---|---|---|---|
| BC-001 | Lead.estimatedValue ever non-VND? | D | Low severity (P2/P3 display-only risk); doesn't block any fix — can be confirmed opportunistically alongside CRM-01 work |
| BC-002 | UNDER_REVIEW/SKIPPED dead enum values | **C — resolved** | Investigated this session: grep confirms no frontend or backend code path references either value for any logic (only the enum definitions and exhaustive-switch fallthroughs). Safe to treat as unused/cleanup candidates; no business meaning was found attached to them anywhere. Recommend removal in a later cleanup wave, not urgent. |
| BC-003 | Approval-rejection event durability intentional? | B | Resolved *technically* to the extent that no design record defends the asymmetry (see `06-XMOD-RISK-REVIEW.md`), but the decision to spend effort fixing it before production is a judgment call, not a pure fact — keep as B |
| BC-004 | Revenue-share contracts ever non-VND? | **A** | Cannot be resolved from code — requires knowledge of actual business practice. Gates whether P0-003 is an active production risk or a latent one. Highest-priority business question in this review. |
| BC-005 | Should Sales turnover follow contract currency? | **A** | Genuine business policy question (is "gross retail sales" a VND-local-market metric by convention, or should it track lease currency) — not answerable from code |
| BC-006 | Is penalty-interest calculation scheduled elsewhere? | **C — resolved** | Investigated this session: exhaustive `@Cron(` grep across the entire backend (already performed in the System Truth pass and not contradicted by any change since) found no scheduled trigger anywhere for `PenaltyInterestService.runPenaltyCalculation`. It is manual/API-trigger-only. This is now a fact, not a question — reclassify the remaining open item as "confirm whether this is acceptable" (B), not "find out if it's scheduled" (which is answered: no) |
| BC-007 | Cross-mall Sales visibility intentional? | **A** | Same shape as BC-013 — code evidence leans toward unintentional (see `03-MALL-AUTHORIZATION-ARCHITECTURE.md`), but final call is a business/security decision |
| BC-008 | Cross-parkingCode visibility intentional? | **A** | Same reasoning as BC-007 |
| BC-009 | Spaces gap exploitability given real UserMallAccess patterns? | **A** | See `03-MALL-AUTHORIZATION-ARCHITECTURE.md` — not resolvable from code; recommendation stands to treat as CONFIRMED-P0 regardless of this answer |
| BC-010 | Was MERGED excluded from UnitStatusService deliberately? | D | Low severity, no live bug today (locally guarded); can be resolved with a single design-history question, not urgent |
| BC-011 | Manual-only SAP retry/reconciliation intentional? | B | Operational decision — does production tolerate manual SAP remediation, or is automation expected before go-live |
| BC-012 | Delete or fix the dead analytics contract-expiry scheduler? | **C — resolved** | Investigated this session: the file is confirmed unregistered (not in `analytics.module.ts` providers) and therefore inert; the only risk is a future accidental re-registration. Recommendation: delete the dead file — this is a technical cleanup decision, not a business one. Reclassify from BC to a direct action item in `10-CHANGE-PROGRAM.md` (TECH-01 wave), no business confirmation needed. |
| BC-013 | Reports/Analytics missing Mall enforcement intentional? | **A** | See `03-MALL-AUTHORIZATION-ARCHITECTURE.md` — code evidence leans strongly toward unintentional; final call is a business/security decision given the financial-data sensitivity |
| BC-014 | Should AI chat context be mall-scoped? | B | Lower urgency than BC-013 (read-only, conversational) but same underlying gap — bundle into the same AUTH-01 fix and confirm scope alongside it |
| BC-015 | Which formula implementation should be canonical (revenue/occupancy)? | **C — resolved** | Investigated this session: recommended owners identified in `05-CANONICAL-FINANCIAL-SEMANTICS.md` (Billing for collected revenue, `OccupancyAnalyticsService.getOccupancyV2()` for occupancy) based on completeness and existing-correctness, not a business preference — this is an architecture decision, not a business one, though it should still be confirmed by the Financial/Reporting Architect roles per `docs/ai-erp-team/01-ERP-ORGANIZATION.md` before implementation (see `12-ARCHITECTURE-DECISIONS-REQUIRED.md`) |
| BC-016 | Customer having no mallId intentional? | B | Plausible legitimate design (pre-unit-assignment shared CRM pool) — needs confirmation but is lower urgency than the confirmed-gap items since `Customer` predates Mall assignment by definition in the sales funnel |
| BC-017 | Fitout-controls/gantt/daily-report missing enforcement accepted risk? | **A** | Same reasoning as BC-009 — IDs being "unguessable cuids" is a mitigating factor but not a substitute for authorization; recommend treating as CONFIRMED-P1 regardless per the same asymmetric-cost logic as BC-009 |
| BC-018 | /uploads guard-bypass current status | **C — resolved this session** | See `02-FILE-SECURITY-ARCHITECTURE.md` — SAFE (already fixed 2026-08-19), PARTIAL residual (cross-Mall IDOR on `FilesController`, folded into `AUTH-01`) |
| BC-019 | What backend module does pipeline-stats consume? | D | Cosmetic/documentation-only, no urgency |
| BC-020 | Tickets tenant-isolation gap intentional or oversight? | **A** | Cross-tenant data exposure (even if limited to escalations/ratings) requires explicit confirmation before deciding remediation urgency, but code evidence (the pattern is correctly applied everywhere else in the same service) leans toward oversight |

## Triage summary

| Class | Count | Items |
|---|---|---|
| A — must confirm before any fix | 8 | BC-004, 005, 007, 008, 009, 013, 017, 020 |
| B — must confirm before production | 5 | BC-003, 006 (partially resolved), 011, 014, 016 |
| C — resolved this review | 6 | BC-002, 006 (the "is it scheduled" half), 012, 015, 018 |
| D — post-go-live enhancement | 3 | BC-001, 010, 019 |

*(BC-006 appears once in the table above with a split resolution — the factual sub-question is C-resolved, the policy sub-question remains B.)*

## Recommendation

Do not sequence all 8 category-A items as blocking a single meeting — group them by root-cause cluster (BC-009/013/017/020 all resolve together as part of confirming `AUTH-01`'s remediation scope; BC-004/005/007/008 resolve together as part of confirming `CUR-01`'s scope). See `09-REMEDIATION-DEPENDENCY-GRAPH.md`.
