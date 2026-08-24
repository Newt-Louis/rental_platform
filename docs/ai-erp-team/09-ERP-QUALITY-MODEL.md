# 09 — ERP Quality Model

## Quality dimensions

Every non-trivial change is assessed across all of these, not just the
ones easiest to automate:

```text
functional
cross-module
data integrity
financial
security
concurrency
retry
reporting
UX
observability
recoverability
```

A change that is functionally correct but has unverified cross-module or
financial correctness is not "done" — see
`docs/ai-governance/05-E2E-QUALITY-GATES.md` Gates 3, 8, 9.

## Confidence levels

> **Do not use test count alone as a confidence signal.**

A module with 200 passing unit tests and zero cross-module integration
tests can still be LOW confidence for platform correctness. Use these
three levels, applied per-claim (not per-module as a whole):

- **HIGH** — verified by reading the actual implementation AND exercised
  by an E2E/integration test that would fail if the behavior were wrong
  AND no known contradicting evidence elsewhere in the codebase.
- **MEDIUM** — verified by reading the actual implementation, but not
  covered by a test that would catch regression, OR covered by a test
  but not directly read/verified in code, OR minor contradicting
  evidence exists elsewhere that hasn't been resolved.
- **LOW** — inferred from naming/convention/documentation without direct
  code verification, OR known contradicting evidence exists and hasn't
  been reconciled, OR the area is explicitly flagged
  `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`.

Every finding recorded in `docs/system-truth-templates/
CODEBASE_CONFIDENCE_MAP.md` must carry one of these three levels with a
one-line justification — not a bare label.

## Application

- Release Governance (`docs/ai-governance/07-RELEASE-GOVERNANCE.md`)
  requires HIGH confidence on the financial/security/data-integrity
  dimensions for any P0/P1 change before Production READY.
- A LOW-confidence finding on a dimension relevant to the current change
  is itself grounds to raise a `BC-xxx` or add test coverage before
  proceeding, not to ship anyway because "the rest of the module looks
  fine."
