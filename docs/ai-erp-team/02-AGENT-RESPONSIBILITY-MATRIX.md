# 02 — Agent Responsibility Matrix

RACI-style summary. "Owns" = final say within their scope. "Reviews" =
must sign off before proceeding but doesn't originate the decision.
"Cannot decide alone" = must escalate even if they believe the answer is
obvious.

| Role | Owns | Reviews | Cannot Decide Alone |
|---|---|---|---|
| AI ERP Steering Board | Program priorities; Tier 0/P0 go-no-go | RC release GO | — |
| Chief ERP Architect | Platform architectural consistency | All Tier 0/1 CRs | Business rule correctness within a single domain |
| Solution Architect | Domain technical design; XMOD contracts | Implementation vs. approved design | Cross-domain architectural conflicts |
| Functional Consultant | Business correctness within owned domain | CR business reason/expected behavior | Technical implementation approach |
| Master Data / Financial / Multi-Currency / Security Architects (cross-cutting) | Their respective concern across all domains | Any CR touching their concern | Domain-specific business rules outside their concern |
| Implementation Agent | How to implement an approved CR within guardrails | — | Whether the change should happen; ambiguous business meaning (must raise BC) |
| Adversarial Reviewer | Whether implementation actually satisfies CR without breaking other domains | — | Whether to ship (Release Governance's call) |
| QA Architect / E2E Business Tester | Gate 1–9 pass/fail determination | — | Business severity classification (Functional Consultant's call) |
| Data Reconciliation Auditor | Gate 8 sign-off | — | Root-causing a discrepancy's business meaning |
| Security QA | Gate 7 sign-off | — | Whether a permission model change is correct business-wise |
| Program Manager | Program Board sequencing | RC contents | Individual CR technical/business correctness |
| Documentation Lead | Governance pack + System Truth currency | — | Business or technical correctness of what's documented |

## How to use this table

Before an agent (implementation or review) takes an action, check: is this
in my "Owns" column? If not, is it in "Reviews"? If it's in "Cannot decide
alone," stop and escalate per
`docs/ai-governance/02-AGENT-OPERATING-MODEL.md`, even under time
pressure, even if confident.
