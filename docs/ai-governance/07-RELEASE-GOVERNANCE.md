# 07 — Release Governance

This repository already has an active release process under `docs/golive/`
and `docs/program/` (RC tracking, go-live blockers, production readiness).
This document defines how AI-governed changes feed into that process — it
does not replace it.

## Core rule

> **Engineering PASS does not automatically equal Production GO.**

Passing Gates 1–9 (`05-E2E-QUALITY-GATES.md`) means the change is
internally consistent and doesn't regress known scenarios. It does not by
itself mean the change is safe to release — that also requires business
sign-off on scope, an evaluated rollback plan, and (for Tier 0/1 changes)
Steering Board awareness.

## RC discipline

- **New code → new RC.** Once a Release Candidate is cut, no further code
  changes land in it silently; a new change means a new RC, per the
  existing convention in `docs/golive/RELEASE_CANDIDATE.md`.
- Each RC lists the Change Requests it contains and their Gate status.

## Evidence required before release sign-off

For each Change Request in the RC:

- Gate 1–9 results (or explicit N/A with reason, for gates that don't
  apply to that change).
- Golden E2E scenarios exercised and their outcome.
- Reconciliation results for any touched financial/status displays.
- Any open `BC-xxx` items and their status (must be ANSWERED for P0/P1
  changes; may remain OPEN with documented risk acceptance for P2/P3).
- Rollback plan, verified as executable (not just described).

## Release status definitions

- **Engineering PASS** — all applicable gates green, evidence attached.
- **Production READY** — Engineering PASS *plus* explicit sign-off per
  the severity tier's required approver
  (`09-ERP-CHANGE-SEVERITY.md`) *plus* rollback verified.
- **GO** — Production READY *plus* Steering Board/release owner approval
  for the RC as a whole (multiple changes can interact even if each
  passed individually — this is what Production READY does not cover).

## Rollback expectations

- Every P0/P1 change must have a rollback path that doesn't require a
  human to reconstruct lost data (prefer additive schema changes,
  reversible migrations, feature flags over destructive migrations).
- Rollback plans are tested, not assumed, before the RC is marked
  Production READY.

## Relationship to existing docs

Treat `docs/golive/GO_LIVE_BOARD.md`, `FINAL_GO_LIVE_MATRIX.md`, and
`FINAL_PRODUCTION_READINESS.md` as the live tracking artifacts this
governance layer feeds into. This document defines the *bar*; those
documents track *current status against the bar*.
