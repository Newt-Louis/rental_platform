# BC-027 — Lead transition adjacency

## TITLE

Approved forward/backward Lead lifecycle transitions.

## CONTEXT

CR-121 centralizes every Lead status writer across CRM, Customer, Booking, and Proposals. Current code only guards one `update()` path into WON and otherwise accepts inconsistent transitions.

## QUESTION

Beyond requiring an approved/converted Proposal before WON and requiring a reason for LOST, backward, and reopen, which Lead status transitions may staff and automations perform?

## OPTIONS CONSIDERED

A) Strict adjacent forward progression with explicit LOST from any open stage and reviewed reopen/backward exceptions.

B) Flexible movement between open stages, while preserving WON preconditions and mandatory reasons for backward/reopen/LOST.

## IMPACT IF UNANSWERED

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED.** The common lifecycle/event mechanism can be designed, but final adjacency enforcement is P1 data-integrity behavior and cannot be activated from an unapproved assumption.

## ANSWER

Pending Leasing Functional Consultant and Workflow Architect.

## STATUS

OPEN

