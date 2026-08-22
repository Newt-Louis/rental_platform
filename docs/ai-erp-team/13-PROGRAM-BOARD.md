# 13 — Program Board

## Initial phases (starting hypothesis)

```text
P0  System Truth Reconstruction
P1  Architecture Contradictions
P2  Business Confirmation
P3  Data/Financial Integrity
P4  Cross-Module Contracts
P5  Multi-Currency Safe Architecture
P6  Reporting Consistency
P7  UX / Information Flow
P8  Production Readiness
```

**This order is not final.** System Truth findings (P0) may reveal that a
later phase needs to move earlier — e.g. if P0 finds a live P0-severity
security gap, that gets fixed out-of-band immediately rather than waiting
for P8, per `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`'s escalation
rules, which override program sequencing for P0 findings.

## Phase intent

- **P0 — System Truth Reconstruction**: run
  `docs/ai-governance/10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md` in full,
  audit-only. Blocks all other phases.
- **P1 — Architecture Contradictions**: resolve every finding in
  `docs/system-truth-templates/ARCHITECTURE_CONTRADICTIONS.md` — pick a
  canonical implementation where duplicates exist, write the ADR.
- **P2 — Business Confirmation**: work through
  `BUSINESS_CONFIRMATION_REQUIRED.md` with actual business stakeholders;
  no P3+ work proceeds against an area with an OPEN P0/P1-relevant BC.
- **P3 — Data/Financial Integrity**: apply
  `07-ERP-FINANCIAL-MODEL.md` single-owner-formula principle wherever
  System Truth found duplication; verify via reconciliation.
- **P4 — Cross-Module Contracts**: formalize `XMOD-xxx` contracts for
  every dependency found in `PLATFORM_DEPENDENCY_MATRIX.md`; add
  idempotency/failure handling where missing.
- **P5 — Multi-Currency Safe Architecture**: complete the nine-surface
  verification (`08-MULTI-CURRENCY-GUARDRAILS.md`) per domain; this
  phase is elevated given the in-flight multi-currency work already in
  the codebase (see `12-RISK-REGISTER.md`).
- **P6 — Reporting Consistency**: verify every Dashboard/Reports/
  Analytics metric against its `07-ERP-FINANCIAL-MODEL.md` definition.
- **P7 — UX / Information Flow**: reconcile with existing
  `docs/ERP_UX_STANDARD.md` and `docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md`
  findings.
- **P8 — Production Readiness**: feed into existing
  `docs/golive/` release tracking per
  `docs/ai-governance/07-RELEASE-GOVERNANCE.md`.

## Status (updated 2026-08-21)

- **P0 — System Truth Reconstruction: COMPLETE.** Executed in full,
  audit-only, no application/schema/migration/test/config changes.
  35 documents produced under `docs/system-truth/` (supersedes the
  templates under `docs/system-truth-templates/`, which remain as
  reusable blank formats). Stop condition met — see
  `docs/system-truth/SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md`, which ends
  with `READY FOR ARCHITECTURE REVIEW`.
- **Out-of-band item resolved**: BC-018 (`/uploads` guard-bypass claim)
  was investigated during Architecture Review (2026-08-21) and found
  **SAFE** — the underlying vulnerability was real but already fixed
  2026-08-19, before System Truth reconstruction even ran (the
  reconstruction pass missed the newer remediation doc). A narrower
  residual gap (no `MallAccessGuard` on `FilesController`) was found
  and folded into `CONTRA-008`/`AUTH-01`. See
  `docs/architecture-review/02-FILE-SECURITY-ARCHITECTURE.md`.
- **Architecture Review + P0 Verification Gate: COMPLETE (2026-08-21).**
  All 3 P0s independently re-verified against current code (all 3
  CONFIRMED, 0 downgraded, 0 false positives). 13 documents produced
  under `docs/architecture-review/`. Findings clustered into 6 root
  causes (`AUTH-01`, `CUR-01`, `FIN-01`, `EVT-01`, `CRM-01`, `OPS-01`).
  See `docs/architecture-review/00-ARCHITECTURE-REVIEW-EXECUTIVE.md`.
- **CR-102 (Currency Mixing Correctness): PARTIALLY COMPLETE,
  human-reviewed and committed (2026-08-21).** Commit `915c96e`.
  - **CR-102A (Billing invoice-summary, `CONTRA-005`) — DONE.** 10 new
    tests, zero regressions (backend 385/385, frontend 216/225 =
    baseline-identical). See
    `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md`.
  - **CR-102B (Revenue-share, `CONTRA-011`) — BLOCKED, BUSINESS
    CONFIRMATION REQUIRED.** `BC-004`/`BC-005` remain OPEN. Correctly
    not implemented — no VND-only business semantics could be proven,
    and hardcoded formatting was correctly treated as insufficient
    evidence per governance rule.
  - **New finding from CR-102's adversarial review**: the
    `ServiceContracts→Billing` currency bug (`CONTRA-010`) is confirmed
    live-reachable (not hypothetical) via `ServiceContractsPage.tsx`'s
    USD/MMK selector — elevates its priority within the future `CR-103`
    scope. Not fixed by CR-102 (explicitly out of its authorization).
  - **Release**: RC3 remains the designated release candidate. CR-102's
    commit does not itself create a new RC.
- **Next**: CR-101 Architecture Implementation Plan (design only, no
  code) for `AUTH-01` — see
  `docs/architecture-review/13-CR-101-IMPLEMENTATION-PLAN.md`. CR-103
  is explicitly not started.
- **P1 — Architecture Contradictions: OPEN, ready to start.** 16
  findings logged in `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md`
  (3 P0, 7 P1, 5 P2, 1 P3). Highest-priority: `CONTRA-008` (Mall-scoping
  gaps across 9+ confirmed instances — needs a structural/ADR-level fix,
  not per-instance patches).
- **P2 — Business Confirmation: OPEN, should run partially in parallel
  with P1, not strictly after it.** 20 items logged in
  `docs/system-truth/BUSINESS_CONFIRMATION_REQUIRED.md`. Four
  (`BC-004`, `BC-009`, `BC-013`, `BC-018`) gate the real-world severity
  of the P0 contradictions and should be resolved first, ahead of the
  remaining 16.
- **P3-P8**: still OPEN, sequenced behind P1/P2 per the original phase
  intent below, with P5 (Multi-Currency) carrying forward the specific,
  now-confirmed findings in
  `docs/system-truth/16-MULTI-CURRENCY-SEMANTICS.md` (Sales/Slots/Parking
  have no currency field at all; two confirmed currency-propagation
  bugs in Billing/ServiceContracts) and P6 (Reporting Consistency)
  carrying forward `docs/system-truth/13-REPORTING-DEFINITIONS.md`'s
  10-row duplicate-formula matrix.
- Two low-effort documentation corrections identified during
  reconstruction, to be made opportunistically (not blocking): correct
  `docs/ai-governance/01-PLATFORM-SCOPE.md`'s module count (30→31), and
  remove the nonexistent "Company" entity from
  `docs/ai-governance/00-START-HERE.md` / `docs/ai-erp-team/05-ERP-MASTER-DATA.md`
  (see `docs/system-truth/00-SYSTEM-OVERVIEW.md`).
