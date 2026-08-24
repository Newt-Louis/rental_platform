# 11 — Decision Register (ADR Index)

This is the index of Architecture Decision Records for platform-level
decisions. Individual ADRs are created from
`docs/change-templates/ADR-TEMPLATE.md` and listed here as they're
written — this file does not itself contain decisions, only the index.

## Format

| ADR | Title | Status | Domain(s) | Date |
|---|---|---|---|---|
| ADR-001 | _(none recorded yet)_ | — | — | — |

## When an ADR is required

- Any Tier 0 decision (`docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`)
  that isn't fully captured by a single Change Request — e.g. "how do we
  represent money across currencies platform-wide" is an ADR; "add USD
  support to the Booking form" is a CR that should cite that ADR.
  Currency governance and cross-currency
  consolidation design in particular route through
  `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`'s "hard rules" —
  any ADR resolving those must be added here.
- Any decision to formally accept a "legacy VND-only domain" (or
  equivalent scoped-exception) rather than extend a capability platform-
  wide.
- Any decision that resolves an `ARCHITECTURE_CONTRADICTIONS.md` finding
  by picking one existing implementation as canonical and deprecating
  the other(s).
- Any decision to change the Program Board phase order in
  `13-PROGRAM-BOARD.md`.

## Status of this document

No ADRs have been recorded as of this framework's creation
(2026-08-20). This is expected — ADRs are written as real Tier 0
decisions are made, not manufactured to populate this index.
