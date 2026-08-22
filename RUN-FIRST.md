# RUN-FIRST.md

Run this once, before any other AI-assisted work begins on this repository,
and again whenever the module inventory or business processes materially
change. Paste the block below as-is to Claude Code (or another coding
agent operating under `AGENTS.md`).

---

```text
Read AGENTS.md and docs/ai-governance/00-START-HERE.md first.

Then:

1. Establish the AI ERP Team operating model described in
   docs/ai-erp-team/ — treat this repository as one integrated ERP
   platform, not a set of independent modules.

2. Inspect the repository end-to-end: apps/backend/src/modules/,
   apps/frontend/src/pages/, shared services, jobs, events, and routes.

3. Execute docs/ai-governance/10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md
   in full, producing every document listed there under docs/system-truth/,
   using docs/system-truth-templates/ as the format for each.

4. This run is AUDIT ONLY. Do not modify backend logic, frontend logic,
   database schema, migrations, APIs, tests, production configuration,
   or business data. Do not fix anything you find — record it.

5. Stop when every System Truth document is produced and the
   ARCHITECTURE_CONTRADICTIONS.md and BUSINESS_CONFIRMATION_REQUIRED.md
   registers are populated with real findings (not placeholders).

Print the final line exactly:

READY FOR ARCHITECTURE REVIEW
```

---

## What happens next

Once `READY FOR ARCHITECTURE REVIEW` is printed, do not proceed to
implementation. The next steps (per
`docs/ai-erp-team/00-ERP-TEAM-CHARTER.md`) are human-in-the-loop:

1. A human (or designated review agent role) reads
   `docs/system-truth/SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md`,
   `ARCHITECTURE_CONTRADICTIONS.md`, and `BUSINESS_CONFIRMATION_REQUIRED.md`.
2. Contradictions are resolved and business confirmations answered.
3. Only then does `docs/ai-erp-team/13-PROGRAM-BOARD.md` phase P1 begin.
