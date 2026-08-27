# 10 — ERP Release Model

## Full pipeline

```text
CR
↓
Impact
↓
Functional Review
↓
Architecture
↓
Implementation
↓
Adversarial Review
↓
QA
↓
Golden E2E
↓
Reconciliation
↓
Security
↓
UAT
↓
RC
↓
Deployment
↓
Hypercare
```

This is the ERP-organization view of the same sequence introduced in
`docs/ai-governance/00-START-HERE.md`; the difference is this model names
the *human/role checkpoint* at each stage, while the governance doc names
the *artifact* produced at each stage.

## Stage detail

| Stage | Artifact produced | Role checkpoint |
|---|---|---|
| CR | `CR-xxx` (`docs/change-templates/CR-TEMPLATE.md`) | Requester + Functional Consultant |
| Impact | Completed Impact Map inside the CR | Implementation agent, per `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md` |
| Functional Review | Confirmed/corrected business expectations | Functional Consultant (domain owner) |
| Architecture | Confirmed technical approach, XMOD contracts identified | Solution Architect (+ Chief ERP Architect for Tier 0/1) |
| Implementation | Code + tests | Implementation agent, per `docs/ai-governance/04-CODING-GUARDRAILS.md` |
| Adversarial Review | Findings list (or clean) | Adversarial Reviewer |
| QA | Gate 1–7 results | QA Architect / E2E Business Tester / Security QA |
| Golden E2E | Gate 4 results against `docs/ai-governance/05-E2E-QUALITY-GATES.md` baseline | E2E Business Tester |
| Reconciliation | Gate 8/9 results | Data Reconciliation Auditor |
| Security | Gate 7 sign-off | Security QA |
| UAT | Business sign-off on actual behavior | Functional Consultant + business stakeholder |
| RC | RC entry with all CRs and their evidence | Program Manager |
| Deployment | Deployed build + rollback plan verified | DevOps/SRE |
| Hypercare | Post-release monitoring window, issues logged | Reliability Architect |

## Relationship to existing release tracking

This model governs how a CR *earns its way* into an RC. Once in an RC,
tracking continues via the existing `docs/golive/` artifacts
(`RELEASE_CANDIDATE.md`, `GO_LIVE_BOARD.md`,
`FINAL_PRODUCTION_READINESS.md`) per
`docs/ai-governance/07-RELEASE-GOVERNANCE.md`.
