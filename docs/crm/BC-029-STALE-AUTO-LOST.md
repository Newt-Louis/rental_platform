# BC-029 — Stale Lead auto-LOST policy

## TITLE

Whether stale handling may automatically close a Lead as LOST.

## CONTEXT

CR-121 found that current stale calculation does not observe the activity written by the primary UI, yet `POST /crm/leads/auto-move-stale` can bulk-change matching Leads to LOST.

## QUESTION

Should a stale threshold ever automatically set Lead status to LOST, or should it only create a manager review/task and require a human decision?

## OPTIONS CONSIDERED

A) Review/task only; a human supplies the LOST reason.

B) Configurable Mall-scoped auto-LOST after dry-run/review and a defined grace policy.

## IMPACT IF UNANSWERED

**UNKNOWN — BUSINESS CONFIRMATION REQUIRED.** Auto-LOST remains disabled/dry-run in the proposed design. Existing production configuration is not changed by CR-121 Wave 0.

## ANSWER

Pending Leasing Functional Consultant.

## STATUS

OPEN

