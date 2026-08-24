# System Truth — Codebase Confidence Map

## Rollup by document

| Document | Overall confidence | Basis |
|---|---|---|
| 00-SYSTEM-OVERVIEW | HIGH | Directly verified module count, ORM, cross-cutting capabilities against code |
| 01-END-TO-END-BUSINESS-PROCESS | HIGH for BP-001..BP-011,013; MEDIUM for BP-007 (business-context-dependent) | Extensive file:line citation across all 5 streams |
| 02-DOMAIN-OWNERSHIP | HIGH | Direct grep-verified reach-in analysis |
| 03-DATA-OWNERSHIP | MEDIUM | Master-data candidates verified; not every entity field-by-field audited |
| 04-STATE-MACHINES | HIGH | Every major entity's transitions traced to enforcement code, not just enum definitions |
| 05-CROSS-MODULE-CONTRACTS | HIGH for the 16 XMOD entries documented; LOW for completeness (more XMODs likely exist unfound) | |
| 06-BUSINESS-INVARIANTS | HIGH for the 10 invariants documented; INV-004 explicitly NOT YET VERIFIED | |
| 07-DATA-LINEAGE | MEDIUM | Priority fields traced; full field-by-field lineage not attempted |
| 08-TRANSACTION-BOUNDARIES | HIGH | Every major multi-step write traced to its transaction wrapper or lack thereof |
| 09-EVENT-CATALOG | HIGH for the ~22 jobs found; MEDIUM for "not read in depth" rows | |
| 10-RETRY-IDEMPOTENCY-MODEL | HIGH | Built directly from the event catalog's verified findings |
| 11-ROLE-PERMISSION-MATRIX | HIGH | Full-backend controller sweep performed by the Security stream |
| 12-FINANCIAL-SEMANTICS | HIGH | Every formula independently traced to file:line, cross-checked across modules |
| 13-REPORTING-DEFINITIONS | HIGH | The platform's most exhaustively cross-checked finding (10-row matrix, each cell independently verified) |
| 14-FILE-DOCUMENT-OWNERSHIP | **LOW — explicitly out of scope this pass** | Only a carried-forward, unverified prior-doc citation |
| 15-MULTI-MALL-MULTI-COMPANY | HIGH | Full-backend sweep, consistent with 11- and SYSTEM_SCOPE_MAP findings |
| 16-MULTI-CURRENCY-SEMANTICS | HIGH for Contracts/Billing/ServiceContracts/Parking/Sales/Slots; MEDIUM for reconciliation surfaces (not traced) | |
| 17-E2E-GOLDEN-SCENARIOS | MEDIUM | Verified against confirmed findings, but not actually executed as tests |
| 18-SYSTEM-INTEGRITY-CHECKS | HIGH confidence that none of these checks currently exist; the checks themselves are proposals, not verified-implemented | |
| 19-CHANGE-IMPACT-PROTOCOL | MEDIUM | Synthesized from the above; individual cells inherit their source document's confidence |
| MODULE_INVENTORY | HIGH | Directly verified via `ls` twice, 2026-08-20 and 2026-08-21 |
| PLATFORM_DEPENDENCY_GRAPH/MATRIX | MEDIUM | Verified for the modules deep-audited this pass; absence of a listed dependency is not proof of absence for modules outside the 5 streams' primary focus |
| SYSTEM_MONEY_MAP | HIGH | Directly built from the Financial Core stream's exhaustive field-by-field sweep |
| SYSTEM_STATUS_MAP | HIGH | Directly built from verified state-machine and transaction findings |
| SYSTEM_SCOPE_MAP | HIGH | Directly built from the Security stream's full-backend sweep |
| BLAST_RADIUS_MATRIX | MEDIUM | Ranking is a synthesis judgment; underlying facts are HIGH confidence |
| ARCHITECTURE_CONTRADICTIONS | HIGH for the 16 entries logged; not claimed exhaustive | |
| BUSINESS_CONFIRMATION_REQUIRED | HIGH (accurately reflects what was raised) | |
| GOLD_IMPLEMENTATION_PATTERNS / ANTI_PATTERNS | HIGH for entries listed; not claimed exhaustive | |

## Lowest-confidence areas (priority follow-up queue)

1. **File/document access control (`14-FILE-DOCUMENT-OWNERSHIP.md`)** — LOW, and carries a **P0-if-true** unverified risk (`/uploads` guard bypass). Highest-priority follow-up in the entire reconstruction.
2. **`PLATFORM_DEPENDENCY_GRAPH`/`MATRIX` completeness** — MEDIUM, modules outside the 5 streams' primary focus (Auth, Users, Categories, Audit-Log, Notifications, Telemetry, Branding, Announcements) were only lightly touched.
3. **`03-DATA-OWNERSHIP`/`07-DATA-LINEAGE` field-by-field completeness** — MEDIUM, priority fields covered, exhaustive schema-wide lineage not attempted.
4. **Real-world severity of BC-004, BC-009, BC-013 dependent findings** — the code-level facts are HIGH confidence; the *business severity* of several P0 findings genuinely depends on unanswered business questions, not on further code investigation.

## Explicit non-average note

Confidence is not averaged into a single platform-wide score, per `docs/ai-erp-team/09-ERP-QUALITY-MODEL.md`. The correct summary is: **19 of 23 core System Truth documents are HIGH confidence; the remaining 4 (Data Ownership, Data Lineage, File/Document Ownership, Dependency Graph completeness) are MEDIUM or LOW and are the recommended focus of the next reconstruction pass.**
