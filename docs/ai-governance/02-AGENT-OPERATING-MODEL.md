# 02 — Agent Operating Model

## Review chain

```text
AI ERP STEERING BOARD
        ↓
CHIEF ERP ARCHITECT
        ↓
SYSTEM / SOLUTION ARCHITECTS
        ↓
FUNCTIONAL CONSULTANTS
        ↓
IMPLEMENTATION AGENTS
        ↓
ADVERSARIAL REVIEW
        ↓
E2E QA
        ↓
RECONCILIATION
        ↓
RELEASE
```

Full role definitions live in `docs/ai-erp-team/01-ERP-ORGANIZATION.md`.
This document defines only the **separation of responsibility** that every
agent (human-directed or autonomous) must respect.

## Separation of responsibilities

| Layer | Decides | Does NOT decide |
|---|---|---|
| AI ERP Steering Board | Program priorities, cross-domain tradeoffs, go/no-go on Tier 0 changes | Implementation details |
| Chief ERP Architect | Platform-level architecture consistency, arbitrates cross-domain conflicts | Business rules within a single domain |
| System/Solution Architects | Domain-level technical design, cross-module contracts (XMOD) | Whether a business rule is correct |
| Functional Consultants | Business correctness within their domain (`docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`) | Technical implementation |
| Implementation Agents | How to implement an approved design within guardrails | Whether the change should happen, or what "correct" means when ambiguous |
| Adversarial Review | Whether the implementation actually satisfies the CR and doesn't break other domains | Whether to ship (that is Release Governance) |
| E2E QA | Whether Golden Scenarios and gates pass | Business rule correctness beyond the scenario |
| Reconciliation | Whether duplicated financial/status data stays consistent post-change | — |
| Release Governance | Production GO/NO-GO | Engineering PASS is evidence, not authority |

## Core rule: no self-approval of platform-level changes

**A coding agent must never self-approve a platform-level change.**

A change is platform-level if any of the following hold (see
`09-ERP-CHANGE-SEVERITY.md` for the full severity model):

- It touches more than one domain in `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`.
- It touches currency, money, or a financial formula.
- It touches Mall/Company/Tenant authorization.
- It touches a state machine consumed by another module.
- It touches a cross-cutting capability from `01-PLATFORM-SCOPE.md`.

For these, an implementation agent produces the Change Request and Impact
Map, but must stop and surface it for architecture/functional review
before implementing — it does not proceed unilaterally, even if it
believes the change is obviously correct.

## What an implementation agent may do without escalation

- Single-file, single-function bug fixes with no cross-module effect and
  no financial/authorization/state-machine surface.
- Test additions that don't change production behavior.
- Documentation-only changes (like this governance pack).
- Changes explicitly pre-approved in an existing, current Change Request.

## Multi-agent consistency

When multiple agents work in this repository (concurrently or across
sessions), each must treat `docs/system-truth/` — not its own prior
inferences — as the single source of truth. If an agent's understanding of
a platform concept (currency handling, a formula, a status flow) conflicts
with System Truth, System Truth wins; if System Truth doesn't cover it,
the agent must record an `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` rather
than assert its own inference as fact.
