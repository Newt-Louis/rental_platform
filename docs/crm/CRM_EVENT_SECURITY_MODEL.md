# CRM event security model

Status: implemented safety baseline for CR-CRM-BUSINESS-EVENT-001; release sign-off remains pending.

## Ownership and read boundary

- `Lead.mallId` persisted on the Lead is the only authoritative Mall owner for an event.
- A Mall Lead produces `scope=MALL` and the same `mallId`. The API never accepts an event Mall from a request body.
- A null-Mall Lead produces `scope=GLOBAL_UNASSIGNED`. Only an explicit global ADMIN context can read or mutate that Lead. A Mall-scoped user is denied even when a relationship appears to point to an accessible Mall.
- Event/timeline endpoints first authorize the Lead, then repeat Mall filtering in the event query. Direct IDs and cursors cannot broaden scope.
- Source links must pass the target module's own authorization.

## Actors and content

- Human actions require `actorType=USER` and a real actor ID; system actions require `actorType=SYSTEM` and no user ID. Database checks enforce the pair.
- Event comments are stored for immutable evidence but returned as `null` with `commentStatus=WITHHELD_PENDING_BC_028`.
- Timeline selects only actor ID/name/role and provenance, not full related records.
- CustomerActivity is not copied or merged into Lead events while BC-016 is open.

## Write and retry boundary

- Event append derives Mall/customer from the persisted Lead inside the caller's transaction.
- A unique idempotency key plus deterministic payload hash returns an identical winner and rejects a conflicting payload.
- No application update/delete method exists for `CrmBusinessEvent`; foreign keys use `RESTRICT`.

