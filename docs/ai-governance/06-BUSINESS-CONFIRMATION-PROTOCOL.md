# 06 — Business Confirmation Protocol

## Mandatory phrase

When the correct business behavior is not determinable from code, tests,
or existing System Truth documentation, an agent MUST NOT invent or infer
it. State exactly:

> **UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

Guessing a plausible-sounding business rule is a governance violation even
if the guess later turns out to be correct — the process, not just the
outcome, is being enforced, because most guesses in a system this size
will *not* turn out to be correct, and there is no way to tell which ones
without asking.

## When to raise a BC

Raise a Business Confirmation whenever any of these hold:

- Code has two plausible interpretations and no test or doc disambiguates.
- A formula's rounding, precedence, or edge-case behavior is ambiguous.
- A state transition's legality depends on a business rule not encoded
  anywhere (e.g. "can a Contract be terminated with unpaid invoices?").
- Multi-currency behavior for a domain is unspecified (see
  `08-MULTI-CURRENCY-GUARDRAILS.md`).
- Authorization scope for a new capability isn't clearly derivable from
  existing role/permission patterns.
- Two existing parts of the system disagree (see
  `ARCHITECTURE_CONTRADICTIONS.md`) and it's unclear which is correct.

## BC-xxx template

```text
BC-xxx

TITLE
One line.

CONTEXT
What triggered this — which CR, module, or System Truth reconstruction step.

QUESTION
The precise business question needing an answer. Phrase it so a
non-technical stakeholder can answer without reading code.

OPTIONS CONSIDERED
A) ...
B) ...
(what code/data currently suggests, if anything, without asserting it as
answer)

IMPACT IF UNANSWERED
What stays blocked, or what risk is accepted by proceeding with a
temporary assumption (state the assumption explicitly if one must be
made to keep moving, and mark it TEMPORARY — REQUIRES CONFIRMATION).

ANSWER
(filled in once confirmed — who confirmed it and when)

STATUS
OPEN / ANSWERED / SUPERSEDED
```

The canonical, fillable version is
`docs/change-templates/BC-TEMPLATE.md`. All raised BCs are tracked in
`docs/system-truth-templates/BUSINESS_CONFIRMATION_REQUIRED.md`.

## What an agent may do while a BC is open

- Continue work that doesn't depend on the answer.
- Proceed with a clearly labeled TEMPORARY assumption only for low-severity
  (P2/P3, see `09-ERP-CHANGE-SEVERITY.md`) work, never for P0/P1 financial,
  authorization, or data-integrity-affecting work.
- Never mark the associated Change Request as complete/released while a
  BC it depends on remains OPEN.
