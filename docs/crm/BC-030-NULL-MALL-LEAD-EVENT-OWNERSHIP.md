# BC-030 — Null-Mall Lead event ownership

## TITLE

Authoritative Mall ownership for CRM events when `Lead.mallId` is null.

## CONTEXT

CR-121 / CR-CRM-BUSINESS-EVENT-001 requires every CRM business event to be
Mall-scoped. The current schema and create DTO allow `Lead.mallId = null`, and
legacy Lead visibility may be inferred from assignee, Booking, Proposal, or Slot
Booking relationships. Persisting one of those inferred Malls as immutable event
ownership could assign the wrong Mall when relationships change or span Malls.

## QUESTION

For future and legacy Leads without `mallId`, what authoritative ownership must
the event ledger persist?

## OPTIONS CONSIDERED

A) Require a persisted Lead Mall before any new business mutation/event; migrate
only Leads with unambiguous evidence and leave unresolved legacy Leads read-only.

B) Permit nullable-Mall CRM events and authorize them through an approved
global/relationship-derived policy without persisting an inferred Mall.

C) Introduce a reviewed multi-Mall ownership relation for Lead/event rather than
one `mallId`.

## IMPACT IF UNANSWERED

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED.** The event schema and lifecycle
service can be designed, but required Mall ownership, event write authorization,
cross-Mall negative tests, and migration cannot be finalized or activated.

## ANSWER

Pending Leasing Functional Consultant and Security/Multi-Mall Architect.

## STATUS

OPEN

## INTERIM SAFETY DECISION

Until an answer is approved, `GLOBAL_UNASSIGNED` is only a storage classification and Mall-scoped users fail closed. Relationship inference is not authorization. Only explicit global ADMIN access may read or mutate a null-Mall Lead or its events. This is reversible and is not the final business ownership decision.
