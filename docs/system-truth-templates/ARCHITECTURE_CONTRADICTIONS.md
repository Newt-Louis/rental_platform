# System Truth — Architecture Contradictions

> **TEMPLATE — NOT YET POPULATED.** Every place two parts of the system
> disagree about the same concept. This register directly drives
> Program Board Phase P1 (`docs/ai-erp-team/13-PROGRAM-BOARD.md`) and is
> required non-empty (or explicitly confirmed empty with evidence of a
> real search) before `READY FOR ARCHITECTURE REVIEW` can be declared.

## Per-contradiction record

### CONTRA-xxx — [Short title]
- **Concept in question:** (e.g. "Outstanding balance formula")
- **Location A:** file:line, what it does
- **Location B:** file:line, what it does (and any further locations)
- **Do they produce different results on the same input? (verified,
  with an example if possible):**
- **Which, if either, appears canonical:**
- **Severity:** P0/P1/P2/P3 (per
  `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`)
- **Resolution path:** requires ADR (`docs/change-templates/ADR-TEMPLATE.md`)
  / requires BC (`docs/change-templates/BC-TEMPLATE.md`) / straightforward
  fix once confirmed
- **Status:** OPEN / RESOLVED (ADR-xxx) / ACCEPTED AS-IS (with reason)

## Register

| CONTRA-xxx | Concept | Locations | Severity | Status |
|---|---|---|---|---|

## Search coverage note

Record which areas were actually searched for contradictions (financial
formulas, currency handling, authorization guards, state machines) so a
later reviewer knows an empty register reflects a real search, not an
unattempted one.
