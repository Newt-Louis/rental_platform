# System Truth — 11 — Role / Permission Matrix

> **TEMPLATE — NOT YET POPULATED.** The actual role/permission matrix as
> enforced by guards in code — not as documented elsewhere. This is the
> authoritative reference for
> `docs/ai-erp-team/08-ERP-SECURITY-MODEL.md`.

## Roles found (verified from Auth/Users module)

| Role | Defined where (file:line) | Scope (global/Company/Mall/Tenant) |
|---|---|---|

## Per-module permission matrix

For each module, list every guarded endpoint/action and which role(s)
can perform it:

### Module: [name]
| Endpoint/Action | Required role(s) | Mall-scoped? | Tenant-scoped? | Guard evidence (file:line) | Negative test exists? |
|---|---|---|---|---|---|

## Endpoints found with NO explicit authorization guard

(Critical finding category — list explicitly, file:line, and escalate to
`ARCHITECTURE_CONTRADICTIONS.md` / risk register at P0 if the endpoint
touches financial or cross-Mall data.)

## Tenant Portal boundary verification

(Specifically verify: can a Tenant Portal user, by ID manipulation or
otherwise, access another Tenant's data? Document the actual guard/query
filter that prevents or fails to prevent this, per endpoint.)
