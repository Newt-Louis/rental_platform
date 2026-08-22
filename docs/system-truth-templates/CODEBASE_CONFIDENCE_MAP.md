# System Truth — Codebase Confidence Map

> **TEMPLATE — NOT YET POPULATED.** HIGH/MEDIUM/LOW confidence per
> finding across all System Truth documents, per
> `docs/ai-erp-team/09-ERP-QUALITY-MODEL.md`. This document is the
> rollup — individual documents carry their own per-finding confidence
> too; do not treat this as the only place confidence is recorded.

## Rollup by document

| System Truth document | % findings HIGH | % findings MEDIUM | % findings LOW/UNKNOWN | Notes |
|---|---|---|---|---|
| 00-SYSTEM-OVERVIEW | | | | |
| 01-END-TO-END-BUSINESS-PROCESS | | | | |
| 02-DOMAIN-OWNERSHIP | | | | |
| 03-DATA-OWNERSHIP | | | | |
| 04-STATE-MACHINES | | | | |
| 05-CROSS-MODULE-CONTRACTS | | | | |
| 06-BUSINESS-INVARIANTS | | | | |
| 07-DATA-LINEAGE | | | | |
| 08-TRANSACTION-BOUNDARIES | | | | |
| 09-EVENT-CATALOG | | | | |
| 10-RETRY-IDEMPOTENCY-MODEL | | | | |
| 11-ROLE-PERMISSION-MATRIX | | | | |
| 12-FINANCIAL-SEMANTICS | | | | |
| 13-REPORTING-DEFINITIONS | | | | |
| 14-FILE-DOCUMENT-OWNERSHIP | | | | |
| 15-MULTI-MALL-MULTI-COMPANY | | | | |
| 16-MULTI-CURRENCY-SEMANTICS | | | | |
| 17-E2E-GOLDEN-SCENARIOS | | | | |
| 18-SYSTEM-INTEGRITY-CHECKS | | | | |

## Lowest-confidence areas (prioritize for follow-up verification)

(List the specific findings, not whole documents, that are LOW
confidence and touch P0/P1-severity concerns — these are the priority
queue for the next round of verification work, ahead of Program Board
Phase P2/P3.)

## Do not

Do not average confidence into a single platform-wide score — that
obscures exactly the kind of localized risk this framework exists to
surface. Keep confidence per-finding and per-document.
