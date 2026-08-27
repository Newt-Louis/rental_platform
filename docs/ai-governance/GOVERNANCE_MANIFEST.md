# Governance Manifest

Complete file listing for the AI ERP Governance + System Truth +
Multi-Agent Operating Framework, created 2026-08-20. This manifest is
itself part of the pack — keep it in sync whenever a file is added,
renamed, or removed from the framework.

## Root

| Path | Purpose | Mandatory | Who uses it |
|---|---|---|---|
| `AGENTS.md` | Binding operating contract for every AI agent in this repo | Mandatory | Every agent, every session |
| `RUN-FIRST.md` | One-paste bootstrap command for AI ERP Team + System Truth reconstruction | Mandatory (run once, and after major platform change) | Whoever initiates System Truth work |

## `docs/ai-governance/`

| Path | Purpose | Mandatory | Who uses it |
|---|---|---|---|
| `00-START-HERE.md` | Operating sequence + shared platform vocabulary | Mandatory | Every agent, first read |
| `01-PLATFORM-SCOPE.md` | Verified module/page inventory + cross-cutting capability list | Mandatory | Anyone scoping a change |
| `02-AGENT-OPERATING-MODEL.md` | Review-chain separation of responsibility | Mandatory | Any agent deciding whether to self-approve |
| `03-CHANGE-IMPACT-PROTOCOL.md` | Impact Map requirement and section-by-section meaning | Mandatory | Anyone writing a CR |
| `04-CODING-GUARDRAILS.md` | SEARCH→CLASSIFY method; transaction/event/financial/auth rules | Mandatory | Implementation agents |
| `05-E2E-QUALITY-GATES.md` | Gates 1–9 + Golden Scenario baseline GS-01..GS-15 | Mandatory | QA, implementation agents, release |
| `06-BUSINESS-CONFIRMATION-PROTOCOL.md` | UNKNOWN — BUSINESS CONFIRMATION REQUIRED protocol | Mandatory | Any agent facing ambiguous business rules |
| `07-RELEASE-GOVERNANCE.md` | RC discipline; Engineering PASS vs. Production GO | Mandatory | Release/program management |
| `08-MULTI-CURRENCY-GUARDRAILS.md` | Nine-surface currency verification; hard rules | Mandatory for any money-touching change | Multi-Currency Architect, implementation agents |
| `09-ERP-CHANGE-SEVERITY.md` | P0–P3 priority × Tier 0–3 severity model | Mandatory | Anyone classifying a change |
| `10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md` | Ready-to-run audit-only System Truth reconstruction prompt | Mandatory (run via RUN-FIRST.md) | Whoever bootstraps System Truth |
| `GOVERNANCE_MANIFEST.md` | This file | Mandatory | Documentation Lead |

## `docs/ai-erp-team/`

| Path | Purpose | Mandatory | Who uses it |
|---|---|---|---|
| `00-ERP-TEAM-CHARTER.md` | Mission + SAP-style discipline sequence | Mandatory | Everyone, orientation |
| `01-ERP-ORGANIZATION.md` | Full role list by function group | Mandatory | Anyone routing a review |
| `02-AGENT-RESPONSIBILITY-MATRIX.md` | RACI-style owns/reviews/cannot-decide-alone table | Mandatory | Any agent unsure of its authority |
| `03-DOMAIN-OWNERSHIP.md` | Module → Functional Consultant mapping (hypothesis, pending verification) | Mandatory | CR PRIMARY DOMAIN section |
| `04-BUSINESS-PROCESS-CATALOG.md` | BP-001..BP-013 hypothesis catalog | Mandatory | CR AFFECTED JOURNEYS section |
| `05-ERP-MASTER-DATA.md` | Master data candidates + required profile fields | Mandatory | Data ownership analysis |
| `06-ERP-INTEGRATION-CATALOG.md` | INT-xxx format + known integration hypotheses | Mandatory | Integration-touching changes |
| `07-ERP-FINANCIAL-MODEL.md` | Governed metric list + required profile fields | Mandatory | Any financial-formula change |
| `08-ERP-SECURITY-MODEL.md` | Direct-API-enforcement principle + per-endpoint checklist | Mandatory | Any new/changed endpoint |
| `09-ERP-QUALITY-MODEL.md` | Quality dimensions + HIGH/MEDIUM/LOW confidence model | Mandatory | Every System Truth finding |
| `10-ERP-RELEASE-MODEL.md` | Full CR→Hypercare pipeline with role checkpoints | Mandatory | Release sequencing |
| `11-DECISION-REGISTER.md` | ADR index | Mandatory (kept current) | Tier 0 decisions |
| `12-RISK-REGISTER.md` | Risk table + known risks at framework creation | Mandatory (kept current) | Program management |
| `13-PROGRAM-BOARD.md` | P0–P8 phase sequencing | Mandatory | Program management |

## `docs/system-truth-templates/`

Templates only — populated exclusively by running
`docs/ai-governance/10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md`. Each
becomes mandatory reference material once populated into
`docs/system-truth/`.

| Path | Purpose |
|---|---|
| `00-SYSTEM-OVERVIEW.md` | Platform identity, runtime architecture, cross-cutting capability inventory |
| `01-END-TO-END-BUSINESS-PROCESS.md` | Verified BP-xxx detail |
| `02-DOMAIN-OWNERSHIP.md` | Verified module capability/boundary ownership |
| `03-DATA-OWNERSHIP.md` | Verified entity-level data ownership (authoritative) |
| `04-STATE-MACHINES.md` | Verified entity lifecycles and transitions |
| `05-CROSS-MODULE-CONTRACTS.md` | XMOD-xxx catalog |
| `06-BUSINESS-INVARIANTS.md` | INV-xxx register |
| `07-DATA-LINEAGE.md` | Field-level origin → copy → derive → display trace |
| `08-TRANSACTION-BOUNDARIES.md` | Atomicity verification per multi-step operation |
| `09-EVENT-CATALOG.md` | Every event/job/webhook, verified |
| `10-RETRY-IDEMPOTENCY-MODEL.md` | Platform-wide retry/idempotency posture |
| `11-ROLE-PERMISSION-MATRIX.md` | Verified role/permission enforcement per endpoint |
| `12-FINANCIAL-SEMANTICS.md` | Verified formula per governed metric (feeds `ai-erp-team/07-ERP-FINANCIAL-MODEL.md`) |
| `13-REPORTING-DEFINITIONS.md` | Report formulas checked against canonical definitions |
| `14-FILE-DOCUMENT-OWNERSHIP.md` | Document type ownership + access control |
| `15-MULTI-MALL-MULTI-COMPANY.md` | Verified isolation boundary enforcement |
| `16-MULTI-CURRENCY-SEMANTICS.md` | Nine-surface verification per domain (highest priority) |
| `17-E2E-GOLDEN-SCENARIOS.md` | Full detail per GS-xx |
| `18-SYSTEM-INTEGRITY-CHECKS.md` | Executable/manual consistency checks |
| `19-CHANGE-IMPACT-PROTOCOL.md` | Verified quick-reference data for filling CR Impact Maps |
| `MODULE_INVENTORY.md` | Authoritative module list |
| `PLATFORM_DEPENDENCY_GRAPH.md` | Module dependency graph + cycles |
| `PLATFORM_DEPENDENCY_MATRIX.md` | Module × module R/W/E matrix |
| `JOURNEY_MODULE_MATRIX.md` | Journey ↔ module participation |
| `SYSTEM_MONEY_MAP.md` | Money entry/storage/transform/display/export map |
| `SYSTEM_STATUS_MAP.md` | Cross-entity status coupling |
| `SYSTEM_SCOPE_MAP.md` | Entity scope levels (global/Company/Mall/Tenant) |
| `BLAST_RADIUS_MATRIX.md` | Per-module blast radius for CR impact analysis |
| `ARCHITECTURE_CONTRADICTIONS.md` | CONTRA-xxx register (drives Program Board P1) |
| `BUSINESS_CONFIRMATION_REQUIRED.md` | Live BC-xxx register |
| `CODEBASE_CONFIDENCE_MAP.md` | Confidence rollup by document |
| `GOLD_IMPLEMENTATION_PATTERNS.md` | Real good-example patterns, cited |
| `ANTI_PATTERNS.md` | Real recurring problem patterns, cited |
| `AGENT_BOOTSTRAP.md` | Condensed next-agent onboarding (populated last) |
| `SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md` | Decision-maker summary (populated last) |

## `docs/change-templates/`

| Path | Purpose | Mandatory | Who uses it |
|---|---|---|---|
| `CR-TEMPLATE.md` | Change Request fillable format | Mandatory for any non-trivial change | Implementation agents |
| `ADR-TEMPLATE.md` | Architecture Decision Record format | Mandatory for Tier 0 decisions | Architects |
| `XMOD-TEMPLATE.md` | Cross-module contract format | Mandatory when documenting/verifying an XMOD | Solution Architects, Gate 3 |
| `GS-TEMPLATE.md` | Golden Scenario detail format | Mandatory for each GS-xx | QA Architect, E2E Business Tester |
| `BC-TEMPLATE.md` | Business Confirmation request format | Mandatory whenever business intent is ambiguous | Any agent |

## Totals

- Root: 2 files created
- `docs/ai-governance/`: 12 files created (11 + this manifest)
- `docs/ai-erp-team/`: 14 files created
- `docs/system-truth-templates/`: 34 files created
- `docs/change-templates/`: 5 files created
- **Total: 67 files created, 0 files overwritten (all target directories were empty)**
