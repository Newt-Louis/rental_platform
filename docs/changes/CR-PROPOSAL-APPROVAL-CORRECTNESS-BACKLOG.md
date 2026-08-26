# CR — Proposal & Approval Correctness Backlog

**Owner:** Unassigned

**Recorded by:** Golden Proposal & Approval program

**Date:** 2026-08-24

**Status:** OPEN — OUTSIDE GOLDEN UI SCOPE

## Purpose

This backlog isolates correctness findings discovered while tracing the
Proposal→Approval→Contract flow. Golden Proposal & Approval may improve
information architecture and presentation only. It must not silently repair
formula, currency, state-machine, transaction, schema or persisted-data
semantics.

## 1. Rent-free days/months inconsistency

Business presentation is confirmed as **days**. Current executable behavior is
inconsistent: Proposal calculations subtract `rentFree` from a month-based
term, while Booking conversion, approval-policy terminology and parts of the
UI describe days. A dedicated correctness CR must decide the authoritative
calculation, migration/backfill impact, approval-threshold impact and historical
data interpretation.

Golden UI action: label the existing value as days; introduce no calculation.

## 2. Booking→Proposal vs direct Proposal calculation divergence

Booking conversion stores `monthlyRent = area × rentPerSqm` and
`totalContractValue = monthlyRent × term`. Direct Proposal create/update uses
the Proposal financial calculator, which treats discount, rent-free and CAM
differently. The two entry paths can persist different totals for equivalent
commercial inputs.

Golden UI action: display backend-stored Proposal values only.

## 3. Scenario vs Proposal calculation divergence

ProposalScenario computes monthly rent, deposit and total value differently
from authoritative Proposal stored financials. Escalation is stored but not
applied. Scenario values must not be propagated to Proposal or used as approval
truth until a dedicated correctness design aligns semantics.

Golden UI action: identify scenarios as simulations and factual comparisons;
do not recalculate or apply them.

## 4. Scenario score undefined semantics

The scenario service stores a composite score derived from revenue, term,
discount and rent-free, but no approved business definition or decision policy
was located. It is not an authoritative KPI.

Golden UI action: do not display, rank, select or approve based on score.

## 5. Supplementary-fee currency ambiguity

Business intent is that supplementary monetary terms belong to the Proposal
commercial lifecycle and use Proposal currency. Existing schema/DTO comments
and UI labels are inconsistent, and individual supplementary fields do not
carry their own currency snapshot. Historical data cannot always prove its
currency safely. The current document-editor default content also contains a
fixed VND/USD exchange-rate sentence; its authority and effective date require
separate business confirmation before that clause can be corrected.

Golden UI action: never hardcode/fabricate currency and do not present an
ambiguous value as authoritative money. Schema/data correction is separate.

## 6. Direct Proposal rejection atomicity

Direct Proposal rejection updates Proposal, Lead and Unit through separate
writes rather than the transactional pattern used by Approval-step rejection.
A partial failure can leave cross-domain state inconsistent.

Golden UI action: do not change the endpoint or transaction behavior; keep the
direct manager action distinct from an approver's step decision.

## Explicit exclusions from Golden UI

- No financial formula changes.
- No rent-free semantic/data migration.
- No scenario calculation or score changes.
- No currency schema/backfill.
- No approval workflow/concurrency change.
- No Proposal→Contract conversion change.
- No database/schema/migration change.
