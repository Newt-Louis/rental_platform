# 10 — System Truth Reconstruction Prompt

This is a ready-to-run prompt for Claude Code or another coding agent, to
be executed via `RUN-FIRST.md` or directly. Copy the block between the
`---` markers verbatim as the task instruction.

---

```text
MODE: AUDIT ONLY. You are prohibited from modifying application code,
frontend code, database schema, migrations, APIs, tests, production
configuration, or business data during this task. You may only read the
repository and write files under docs/system-truth/.

GOAL: Reconstruct the authoritative System Truth for the THISO Leasing
Platform by directly inspecting the repository — not by trusting any
prior documentation, including docs/ai-governance/01-PLATFORM-SCOPE.md,
which is itself only a starting hypothesis.

Create docs/system-truth/ and produce the following documents, using the
matching file in docs/system-truth-templates/ as the required structure
for each. Do not leave placeholders — every section must contain real
findings drawn from the actual code, or an explicit
"UNKNOWN — BUSINESS CONFIRMATION REQUIRED" / "NOT YET VERIFIED" marker
per docs/ai-governance/06-BUSINESS-CONFIRMATION-PROTOCOL.md.

Reconstruct, in this order:

1. Module inventory — verified against apps/backend/src/modules/ and
   apps/frontend/src/pages/, including cross-cutting/shared services not
   under a single module directory.
2. Business journeys — actual user/system flows as implemented, not as
   assumed from naming.
3. Dependency graph — which modules call/import/query which others.
4. Domain ownership — which module owns which business capability.
5. Data ownership — which module owns writes to which entities/tables.
6. State machines — every entity lifecycle and its actual transitions
   as enforced in code.
7. Cross-module contracts (XMOD) — every place one module's output
   becomes another module's input.
8. Business invariants — rules that must always hold (e.g. "an Invoice's
   currency matches its Contract's currency").
9. Transaction boundaries — what is/isn't atomic today.
10. Event catalog — every outbox event, queued job, cron job, webhook.
11. Retry/idempotency model — how at-least-once delivery is (or isn't)
    handled today.
12. Roles/permissions — actual role/permission matrix as enforced by
    guards, not as documented elsewhere.
13. Financial semantics — every money field and formula, its owner, and
    its actual implementation location(s) (flag duplicates).
14. Reporting definitions — what Dashboard/Reports/Analytics actually
    compute, and whether it matches the domain's own formula.
15. Files/documents — ownership and lifecycle of stored documents.
16. Multi-Mall/Multi-Company — actual isolation boundaries as enforced.
17. Multi-Currency — actual state per docs/ai-governance/
    08-MULTI-CURRENCY-GUARDRAILS.md's nine surfaces, per domain.
18. Golden E2E — confirm/refine the GS-01..GS-15 baseline against what
    the code actually supports.
19. Reconciliation checks — where the same value is computed/displayed
    in more than one place, and whether they can drift.
20. Blast-radius matrix — for each module, what breaks if it changes.
21. Contradictions — anywhere two parts of the system disagree about the
    same concept (formula, status meaning, currency handling, etc).
22. Business Confirmation register — every business question that
    surfaced but code alone can't answer.
23. Confidence map — HIGH/MEDIUM/LOW confidence per finding, per
    docs/ai-erp-team/09-ERP-QUALITY-MODEL.md. Do not use test count alone
    as a confidence signal.

Also produce:
- MODULE_INVENTORY.md, PLATFORM_DEPENDENCY_GRAPH.md,
  PLATFORM_DEPENDENCY_MATRIX.md, JOURNEY_MODULE_MATRIX.md,
  SYSTEM_MONEY_MAP.md, SYSTEM_STATUS_MAP.md, SYSTEM_SCOPE_MAP.md,
  BLAST_RADIUS_MATRIX.md, ARCHITECTURE_CONTRADICTIONS.md,
  BUSINESS_CONFIRMATION_REQUIRED.md, CODEBASE_CONFIDENCE_MAP.md,
  GOLD_IMPLEMENTATION_PATTERNS.md (name actual good examples in this
  codebase), ANTI_PATTERNS.md (name actual problem examples, with file
  references), AGENT_BOOTSTRAP.md (a condensed onboarding doc for the
  next agent), and SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md.

CONSTRAINTS:
- Do not fix anything you find wrong during this pass — record it.
- Do not guess business intent; mark it UNKNOWN and log a BC-xxx per
  docs/change-templates/BC-TEMPLATE.md into
  BUSINESS_CONFIRMATION_REQUIRED.md.
- Cite file paths and line references for every non-trivial claim.
- If existing docs (docs/program/, docs/golive/, docs/audit/,
  docs/implementation/) already cover part of this, read and reconcile
  with them rather than re-deriving from scratch — but verify against
  current code, since those docs may be stale.

STOP CONDITION: All documents above exist with real content (no bare
placeholders), ARCHITECTURE_CONTRADICTIONS.md and
BUSINESS_CONFIRMATION_REQUIRED.md reflect actual findings, and no
application/schema/migration/test/config file has been modified.

Print exactly:

READY FOR ARCHITECTURE REVIEW
```

---

## Notes for whoever runs this

- This is a large task. Expect it to be run as one or more long-running
  agent passes, likely delegated to sub-agents per domain group
  (Core Leasing, Space/Mall Operations, Financial, Tenant, Reporting,
  Platform/Admin — see `01-PLATFORM-SCOPE.md` grouping) with results
  merged into `docs/system-truth/`.
- Re-run (incrementally, scoped to the changed domain) whenever a
  platform-level change lands, so System Truth doesn't go stale.
- The output of this prompt feeds directly into
  `docs/ai-erp-team/13-PROGRAM-BOARD.md` phase P1 (Architecture
  Contradictions) — do not begin P1 work until this stop condition is
  met.
