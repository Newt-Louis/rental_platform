# 08 — ERP Security Model

## Scope

```text
Authentication
Role
Permission
Company
Mall
Tenant
Documents
Financial actions
Admin actions
```

## Core principle

> **Direct API enforcement is authoritative.**

Authorization is only real if it is enforced at the API/data-access layer
(guards, interceptors, query-level scoping). Anything enforced only in
the frontend (hiding a button, disabling a route) is a UX affordance, not
a security control, and must never be treated as sufficient by itself.
This directly reflects the previously root-caused `MallAccessGuard`
failure class referenced in `AGENTS.md` §1 — cross-Mall data leaks that
happened because enforcement existed in some controllers but not others.

## Required checks for any new/changed endpoint

1. Is there an explicit guard enforcing authentication?
2. Is there an explicit guard/query filter enforcing Mall scope?
3. Is there an explicit guard/query filter enforcing Company scope (if
   the resource can be Company-level)?
4. If the resource is Tenant-facing (Tenant Portal), is Tenant-level
   scoping enforced so one Tenant cannot see another's data?
5. Is the role/permission check specific to the action (read vs.
   write vs. financial vs. admin), not just "is logged in"?
6. Are background jobs that touch this resource also scoped correctly
   (jobs are a common place where scoping is forgotten because "it's not
   a user request")?

## Document security

Contract PDFs, invoices, fitout submittals, and tenant-uploaded
attachments must inherit the same Mall/Tenant scoping as their parent
entity — a document URL/ID being hard to guess is not access control.

## Financial and admin actions

Any endpoint that creates/modifies money (invoices, payments, contract
value) or performs admin-level actions (user management, branding,
categories) requires role-level authorization beyond basic Mall scoping
— verify the specific role check exists and is tested with a
negative case (Gate 7,
`docs/ai-governance/05-E2E-QUALITY-GATES.md`).

## Verification

The actual role/permission matrix as enforced in code (not as documented
anywhere else) must be reconstructed in
`docs/system-truth-templates/11-ROLE-PERMISSION-MATRIX.md`. Until that
exists, treat any assumption about "who can do X" as UNKNOWN pending
verification against the actual guard code.
