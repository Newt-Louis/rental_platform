# BC-024 — Department Context for Multi-Mall Staff

## TITLE
Which Mall is fixed for a permitted non-ADMIN Department operator with multiple active grants?

## CONTEXT
CR-114 requests a disabled Mall selector for non-ADMIN accounts. `UserMallAccess` permits multiple active Mall grants; `User.activeMallId`/frontend selected Mall can represent a current context but may be unset.

## QUESTION
For a non-ADMIN who is granted multiple Malls and Department administration authority, should the page lock to `activeMallId`, allow selection among only their accessible Malls, or deny access until exactly one current Mall is selected?

## OPTIONS CONSIDERED
A) Lock to server-validated `activeMallId`; require the user to choose/set one before entering the tab.

B) Permit switching only among the user's accessible Mall list; every API request independently validates the chosen Mall.

C) Restrict Department administration to users with exactly one active `UserMallAccess` grant.

## IMPACT IF UNANSWERED
The requested disabled selector cannot be made correct for multi-Mall staff. Any unapproved fallback risks hiding accessible data or granting the wrong operating context.

## ANSWER
A User has one Department assignment regardless of how many Malls the User may access. The assignment is not automatically changed when active Mall changes. For Department administration, a non-ADMIN operator works in the current server-validated active Mall and the selector is locked; ADMIN can select any Mall. Organisational consistency between Mall-specific Department catalogues is an operational human rule, not an application constraint. Confirmed by the business owner on 2026-08-27.

## STATUS
ANSWERED
