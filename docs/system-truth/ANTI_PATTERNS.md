# System Truth — Anti-Patterns

Real, recurring problem patterns found across multiple modules, cited by file:line. See `ARCHITECTURE_CONTRADICTIONS.md` for the specific severity-ranked instances.

## Anti-pattern: Mall-scoping left to per-route developer discipline instead of a fail-closed structural guarantee
- **What goes wrong**: `MallAccessGuard`'s automatic resolution depends on specific param/query/body field names and `params.id`; any route with a differently-named id param is invisible to it, and the fallback behavior on unresolved Mall ID is to **skip the check**, not deny.
- **Instances**: Spaces (units), Analytics, Reports, Sales, Parking-Dashboard, Fitout-controls, Fitout-gantt (mutate/delete), Fitout-daily-report (photos), AI, CRM (`getUnifiedDeals`) — 9+ confirmed instances across otherwise-unrelated modules.
- **Root cause**: the global guard structurally cannot distinguish "this route legitimately has no Mall concept" from "this route's Mall-bearing param just isn't named what I expect" — both look identical (no check performed) from the guard's perspective.
- **Correct approach instead**: See `GOLD_IMPLEMENTATION_PATTERNS.md` — the ~20 modules that explicitly call `mallAccess.assertMallAccess`/`extractAndValidateMallAccess` per-route show the achievable standard; the fix is structural (fail-closed-by-default, explicit opt-out for genuinely global routes), not a per-instance patch.
- **Severity**: P0 (see `ARCHITECTURE_CONTRADICTIONS.md` CONTRA-008).

## Anti-pattern: The same cross-module operation implemented twice, with the second copy missing a correctness detail the first has
- **Instances**: ServiceContracts' "transfer payment to billing" (2 implementations, one missing `currencyCode`); Contract-creation currency resolution (2 entry points — this one, unusually, both got it right, but only because someone deliberately re-verified both, per the code's own explicit comment distinguishing the two paths); Proposal-creation pricing calculation (2 entry points, diverge on discount/rent-free handling); dead duplicate-named cron job (`contract-expiry-check`, 2 files, only one live).
- **Root cause**: no single "is this operation already implemented somewhere" discovery step before adding a second entry point for the same business capability.
- **Correct approach instead**: the CR Impact Map's "SOURCE OF TRUTH" analysis (`docs/ai-governance/04-CODING-GUARDRAILS.md`) exists specifically to catch this before implementation — retroactively, `BLAST_RADIUS_MATRIX.md` and `PLATFORM_DEPENDENCY_MATRIX.md` are the tools to check before adding a new entry point to an existing capability.
- **Severity**: P1-P2 depending on instance (see `ARCHITECTURE_CONTRADICTIONS.md`).

## Anti-pattern: Financial/derived-metric formulas reimplemented per-consumer instead of called from the owning module
- **Instances**: "Collected revenue" and "occupancy rate," independently reimplemented 5-10 times across Dashboard/Reports/Analytics/AI (see `13-REPORTING-DEFINITIONS.md`), with confirmed variance in exact formula shape between implementations.
- **Root cause**: no enforced convention that a reporting consumer must call the owning module's service rather than query the underlying tables directly; the one positive counter-example (AR-aging correctly delegating) shows the team knows the correct pattern but didn't apply it as a standard.
- **Severity**: P1 (`ARCHITECTURE_CONTRADICTIONS.md` CONTRA-012) — this is the literal risk class the governing brief named.

## Anti-pattern: Transaction-hardening applied per-incident rather than as a module-wide standard
- **What goes wrong**: A module can be extremely well-transacted for one operation (Contract activation — Serializable, idempotent, documented) and have a live atomicity gap for a sibling operation in the same file (Contract termination — two separate unwrapped writes, Unit-release outside the transaction).
- **Instances**: Contracts (activation vs. termination), Billing (`createInvoiceFromPending`'s 4 branches use 2 different isolation levels within the same method).
- **Root cause**: inline code comments consistently cite specific prior incidents/docs (`docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md`, `docs/program/02-E2E-WORKFLOW.md`) as the reason a given operation was hardened — meaning hardening happened reactively, operation-by-operation, not as a blanket "every multi-step financial/state write in this module is transactional" rule enforced at review time.
- **Correct approach instead**: `docs/ai-governance/04-CODING-GUARDRAILS.md`'s "transaction safety" section should be treated as applying to *every* multi-step write touching money or a state machine, not only ones that have already caused an incident.
- **Severity**: P1-P2 per instance.

## Anti-pattern: A batch job's per-item failure aborts the whole run, in modules that have a working alternative pattern next door
- **Instances**: Parking's `generateDueStatementsUnlocked` (no per-contract try/catch); Analytics' `occupancy-snapshot`/`renewal-risk-calc` jobs (no per-item isolation).
- **Contrast**: Billing's monthly billing generation and Analytics' own `compliance-scheduler` monthly-exports job both correctly isolate per-item failures.
- **Correct approach instead**: See `GOLD_IMPLEMENTATION_PATTERNS.md`'s "per-item failure isolation" entry — copy the existing pattern from the same codebase.
- **Severity**: P2.

## Anti-pattern: A capability designed to run unattended (scheduled) that was never actually wired into the scheduler
- **Instances**: `PenaltyInterestService.runPenaltyCalculation` (no `@Cron` found anywhere), SAP retry (`retryPending()`) and reconciliation (`reconcilePending()`) — both exist as complete, well-built methods, reachable only via manual `POST`.
- **Root cause**: unclear from code alone whether this is intentional (manual-trigger-by-design) or an incomplete rollout — `docs/OPERATIONS_RUNBOOK.md` assumes SAP jobs are scheduled, suggesting the latter.
- **Severity**: P2, pending business confirmation (`BUSINESS_CONFIRMATION_REQUIRED.md` BC-006, BC-011).

## Anti-pattern: Dead/unused enum values left in a state-machine definition with no code path that ever sets them
- **Instances**: `ProposalStatus.UNDER_REVIEW`, `ApprovalStep.StepStatus.SKIPPED`.
- **Risk**: a future maintainer may assume these are reachable and build logic that depends on them, or an API consumer may build UI for a state that never occurs.
- **Severity**: P3, cleanup candidate pending confirmation of intent.
