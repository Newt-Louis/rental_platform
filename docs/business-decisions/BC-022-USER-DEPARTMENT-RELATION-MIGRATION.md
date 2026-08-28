# BC-022 — User Department Relationship and Legacy Migration

## TITLE
How should the current free-text User department be migrated to the new Mall-scoped hierarchy?

## CONTEXT
CR-114 introduces Department records. Current Prisma schema stores `User.department` as an optional string and existing data/seed values include `IT`, `Leasing`, `Management`, `Finance`, `Legal`, `Operations`, `Executive`, and `Tenant` before a Mall exists in the base seed.

## QUESTION
Should the new relationship replace the string with `departmentId`, retain the legacy text alongside it during a migration period, or keep the string as a display/cache field? How should an existing user be mapped if their text label has no matching department or matches more than one Mall?

## OPTIONS CONSIDERED
A) Add nullable `departmentId`, retain legacy text until a confirmed per-Mall migration and later remove it.

B) Replace the column immediately and migrate every existing record using a deterministic business-approved map.

C) Keep text as the authoritative assignment and make Department an independent catalogue (does not meet CR-114's requested User linkage intent).

## IMPACT IF UNANSWERED
The schema migration, User DTOs, profile, Users tab, approval displays, and reconciliation cannot safely be implemented. A guessed mapping could attach a user to the wrong Mall organisation.

## ANSWER
Keep `User.department` as the existing nullable string column. New assignments store the selected Department ID in this column. Existing strings remain unchanged. Reads attempt to resolve the value against `Department.id`; an unmatched value produces a null relation and the UI displays the localized equivalent of "Chưa có thông tin". No database foreign key is added to `User.department`. Confirmed by the business owner on 2026-08-27.

## STATUS
ANSWERED
