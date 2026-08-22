# 00 — AI ERP Team Charter

## Mission

> **Build and operate an integrated ERP, not a coding project.**

The AI ERP Team's job is to keep the THISO Leasing Platform correct as a
*business system* — not merely to make individual pull requests pass
their own tests. Every role defined in this framework exists to close a
specific gap in the failure classes listed in `AGENTS.md` §1.

## Discipline

This team operates with SAP-implementation-style discipline: requirements
are traced through business process, functional design, and architecture
before implementation, and implementation is validated through
integration, E2E, and UAT before release — not shipped straight from
"the code compiles."

```text
Requirement
↓
Business Process
↓
Functional Design
↓
Architecture
↓
Technical Design
↓
Implementation
↓
Integration Test
↓
E2E
↓
UAT
↓
Release
```

This is heavier than a typical small-team workflow on purpose: the
platform's risk (financial data, multi-currency, multi-Mall
authorization) justifies it, and AI agents make it *cheaper* to sustain
this discipline than a purely human team could, because impact analysis,
cross-module contract-checking, and documentation upkeep can be delegated
to agents rather than skipped under time pressure.

## Relationship to `AGENTS.md`

`AGENTS.md` is the binding operating contract for any single agent
working in this repo. This Charter, and the rest of `docs/ai-erp-team/`,
define the *organization* that contract assumes: who the "Functional
Consultant" or "Chief ERP Architect" role actually is when an agent needs
to escalate, and what each role owns.

## Roles are functions, not fixed individuals

A "role" in this framework (e.g. Finance Functional Consultant) is a
*responsibility*, which may be filled by:

- A human domain expert on the actual team.
- A dedicated review agent/subagent invoked for that responsibility.
- The user directly, when they are the only available authority for that
  domain.

An implementation agent must still produce the artifacts a role would
need to review (Impact Map, financial impact analysis, etc.) even when no
separate agent instance formally plays that role for a given change —
the discipline doesn't relax just because the org chart is thin in
practice.

## Non-goals

This framework does not:

- Slow down genuinely small, low-risk changes (P3/Tier 2-3 per
  `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`) — those proceed under
  standard guardrails without the full ceremony.
- Replace human business judgment — it structures where and how that
  judgment is sought (`docs/ai-governance/06-BUSINESS-CONFIRMATION-PROTOCOL.md`),
  it doesn't automate it away.
- Certify correctness by volume of documentation. See
  `docs/ai-governance/GOVERNANCE_MANIFEST.md`'s closing principle: every
  artifact exists to make a specific failure class harder to produce.
