# BC-023 — Department Hard-Delete Referential Policy

## TITLE
What must happen to child departments and assigned users when a Department is hard-deleted?

## CONTEXT
CR-114 requests a confirmation dialog followed by direct database deletion. A Department has optional parent/child relationships and will be linked to users, so a hard delete has referential effects.

## QUESTION
When a Department has children and/or assigned users, should deletion be rejected until the operator resolves references, should children become root and user assignments be cleared, or should another explicit reassignment/cascade rule apply?

## OPTIONS CONSIDERED
A) Reject deletion while children or assigned users exist; operator must re-parent/reassign first. *(Safest data-integrity default.)*

B) Delete the Department, promote direct children to root, and set assigned users' department to null.

C) Cascade-delete descendants and/or user records/assignments.

## IMPACT IF UNANSWERED
The requested hard-delete endpoint and Prisma referential actions remain blocked. Selecting a cascade behaviour without approval could destroy organisational history or invalidate user assignment data.

## ANSWER
A Department with any child Department cannot be deleted and must return the message "Bộ phận này đang có thông tin các bộ phận con bên trong, không thể xóa" (localized in the UI). A leaf Department may be hard-deleted; in the same transaction, every `User.department` equal to that Department ID is cleared to null. Deletion proceeds bottom-up through the hierarchy. Confirmed by the business owner on 2026-08-27.

## STATUS
ANSWERED
