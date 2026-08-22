# System Truth — Business Confirmation Required

Live register. Consolidated from all 5 research streams, 2026-08-21.

| BC-xxx | Title | Raised during | Severity if unanswered | Status |
|---|---|---|---|---|
| BC-001 | Is `Lead.estimatedValue` ever entered in a non-VND context? | Core Leasing stream | P2 — determines if CRM pipeline-value currency-blending is a real risk | OPEN |
| BC-002 | Is `ProposalStatus.UNDER_REVIEW` / `ApprovalStep.StepStatus.SKIPPED` intended for a future feature, or dead code? | Core Leasing stream | P3 | OPEN |
| BC-003 | Is the outbox-durable-vs-EventEmitter asymmetry between `approval.workflow.completed` and `.rejected` intentional? | Core Leasing stream | P1 — determines if CONTRA-002 needs a fix | OPEN |
| BC-004 | Are revenue-share contracts ever priced in non-VND currency? | Financial Core stream | **P0** — determines real severity of CONTRA-011 | OPEN |
| BC-005 | Should `SalesTurnover.grossSales`/`netSales` follow the tenant's contract currency, or is VND-only correct by design for retail sales metrics? | Financial Core stream | P1 — determines fix direction for the Sales currency gap | OPEN |
| BC-006 | Is `PenaltyInterestService.runPenaltyCalculation` actually scheduled elsewhere, or manual-trigger-only by Finance? | Financial Core stream | P2 | OPEN |
| BC-007 | Is cross-mall visibility of Sales turnover data intentional for internal roles, or should it be mall-scoped like every other module? | Financial Core stream | P1 — same question underlies CONTRA-008's Sales instance | OPEN |
| BC-008 | Is cross-parkingCode/cross-mall visibility in Parking-Dashboard intentional? | Financial Core stream | P1 | OPEN |
| BC-009 | Is the Spaces mall-scoping gap (CONTRA-008) exploitable in production given actual `UserMallAccess` assignment patterns, or dormant because relevant staff are typically granted all-mall access? | Space/Mall Ops + Security streams | P0 — determines real-world urgency, not code-level severity | OPEN |
| BC-010 | Was `MERGED` deliberately excluded from `UnitStatusService`'s transition matrix as a conscious design choice, or never revisited? | Space/Mall Ops stream | P2 | OPEN |
| BC-011 | Is manual-only SAP retry/reconciliation the intended production model, or was a cron job planned and never wired up? | Reporting/Integration stream | P2 | OPEN |
| BC-012 | Should `analytics/contract-expiry.scheduler.ts` be deleted, or does its differing bucket-threshold logic represent an intended-but-unfinished replacement of the live version? | Reporting/Integration stream | P2 — determines correct fix for CONTRA-007 | OPEN |
| BC-013 | Is it intentional that Reports/Analytics don't enforce Mall scoping the way Dashboard does — i.e., is portfolio-wide visibility acceptable for those roles specifically? | Reporting/Integration stream | **P0** — central to CONTRA-008's severity | OPEN |
| BC-014 | Should AI chat context be mall-scoped, or is portfolio-wide AI visibility an intended product decision? | Reporting/Integration stream | P1 | OPEN |
| BC-015 | Which of the 5-10 independently-implemented "collected revenue"/"occupancy rate" formulas should become canonical? | Reporting/Integration stream | P1 — blocks CONTRA-012's resolution | OPEN |
| BC-016 | Is it intentional that `Customer` (CRM) has no `mallId` and is globally visible, while the related `Lead` model is mall-scoped? | Security stream | P1 | OPEN |
| BC-017 | Is `fitout-controls`/`fitout-gantt`/`fitout-daily-report`'s missing mall enforcement an accepted risk (e.g. IDs are unguessable cuids) or an unnoticed regression? | Security stream | P1 | OPEN |
| BC-018 | What is the current status of the `/uploads` static-serving guard-bypass noted in `docs/readiness/SECURITY_READINESS.md:17`? | Security stream (carried forward, not independently re-verified) | ~~P0 if still current~~ | **RESOLVED 2026-08-21 — see correction below** |
| BC-019 | What backend module/data source does the `pipeline-stats` frontend page actually consume? | Orchestrator synthesis | P3 | OPEN |
| BC-020 | Is the Tickets `escalations`/`rate`/`rating`/SLA-policy tenant-isolation gap (CONTRA-003) an intentional simplification (trusting the frontend to never expose these to tenants) or an oversight? | Security stream | P1 | OPEN |

## Correction record — BC-018 (2026-08-21, Architecture Review phase)

**This is an explicit correction, not a silent edit — the original entry above is preserved with a strikethrough, not deleted.**

BC-018 was raised as a carried-forward, unverified claim. A dedicated follow-up investigation (`docs/architecture-review/02-FILE-SECURITY-ARCHITECTURE.md`) found the underlying vulnerability **was real historically but has already been fixed** — `docs/security/PUBLIC_UPLOADS_REMEDIATION.md` (dated 2026-08-19, i.e. *before* the System Truth reconstruction that raised this BC) documents the fix, with 24 passing tests and a live-verification pass. The System Truth reconstruction pass should have found and cross-referenced this document but did not — it relied only on the older, now-stale `docs/readiness/SECURITY_READINESS.md`.

**Residual finding** (new, not previously tracked): `FilesController` retrieval routes apply no `MallAccessGuard` check — a role-eligible staff user can download a document belonging to another Mall. This is narrower than the original claim (cross-Mall only, not unauthenticated/cross-tenant) and is now tracked under root-cause cluster `AUTH-01` in `docs/architecture-review/08-ROOT-CAUSE-CLUSTERS.md`, not as a standalone document-security item.

**Lesson for future System Truth passes**: carried-forward claims from older docs must be checked against *all* newer docs in the same area (`docs/security/`, in this case) before being logged as unverified, not just accepted at face value.

## Correction record — BC-009, BC-017 (2026-08-22, CR-101 Phase 3G readiness review)

**Explicit corrections, not silent edits — the original table rows above are preserved unchanged.**

- **BC-009** (Spaces mall-scoping gap exploitability): **RESOLVED.** Re-verified against current code this session — both underlying gaps the question depended on (the route-level P0-002 authorization gap on `updateUnit`/`updateUnitStatus`, and the separately-found data-integrity gap where a client-supplied `mallId` wasn't stripped on unit update) are confirmed closed as of CR-101 Phase 3B. `spaces.controller.ts`'s `updateUnit`/`updateUnitStatus` routes now carry `@Scope(... status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)')` with an explicit `extractAndValidateMallAccess` call; `spaces.service.ts`'s `sanitizeUnitDto` now has `mallId` in `UNIT_LIFECYCLE_FIELDS`, throwing `BadRequestException` on any client-supplied value. The original question ("is this exploitable given real provisioning data") is now moot — there is no live gap left to be exploitable, regardless of the answer.
- **BC-017** (Fitout-controls/gantt/daily-report missing enforcement): **RESOLVED.** Re-verified against current code this session — all three controllers now carry `@Scope(... status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3A')` at both class and method level. This was fixed in an earlier phase than this register had tracked; not a new fix from this session, only a corrected status.

Full detail: `docs/architecture-review/32-CR-101-CROSS-MALL-POLICY-READINESS.md`.

## Rule reminder

Per `docs/ai-governance/06-BUSINESS-CONFIRMATION-PROTOCOL.md`: no Change Request depending on an OPEN item above may be marked complete/released. BC-004, BC-009, BC-013, BC-018 are the four highest-leverage items — each one's answer determines whether a P0 finding in `ARCHITECTURE_CONTRADICTIONS.md` is a live emergency or a dormant, lower-priority risk. These should be the first four items resolved in Program Board Phase P2.
