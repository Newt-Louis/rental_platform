# BC-021 — Department Administration Authority

## TITLE
Which roles may administer Departments, and at what access level?

## CONTEXT
CR-114 adds a Mall-scoped Department master-data module. The requested UX describes a non-ADMIN account operating in a fixed Mall, but the current `/admin` route, `AdminPage`, Users controller, and Mall Access controller are all ADMIN-only.

## QUESTION
Besides ADMIN, which roles may list, create, edit, and hard-delete departments? Must every permitted non-ADMIN role have all four actions, or are read and mutation rights different?

## OPTIONS CONSIDERED
A) ADMIN only — preserve the current Admin route and backend policy.

B) ADMIN plus named Mall-scoped operational roles — add a new explicit `MODULE_ROLES.departments` list and grant only the confirmed actions within `UserMallAccess` scope.

C) All authenticated staff in their Mall — broadest operational access; requires explicit security approval.

## IMPACT IF UNANSWERED
Department endpoint and route authorization remain blocked. Implementing a role list by analogy would create an unauthorised privilege expansion or silently ignore the requested non-ADMIN flow.

## ANSWER
ADMIN, CEO, and MALL_DIRECTOR may list, create, edit, and delete Departments. Confirmed by the business owner on 2026-08-27.

## STATUS
ANSWERED
