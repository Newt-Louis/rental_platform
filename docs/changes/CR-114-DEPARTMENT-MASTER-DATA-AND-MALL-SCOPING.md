# CR-114 — Mall-scoped Department Master Data and User Assignment

## CHANGE ID
CR-114

## BUSINESS REASON
Provide a governed organisational directory of departments and optional sub-departments per Mall. This replaces the current free-text department label as the intended source for assigning a staff user to an organisational unit, while preserving strict Mall isolation.

## CURRENT BEHAVIOR

- Prisma `User.department` is an optional free-text `String`; it has no foreign key, hierarchy, or Mall ownership.
- The main seed contains free-text labels (`IT`, `Leasing`, `Management`, `Finance`, `Legal`, `Operations`, `Executive`, `Tenant`).
- `DepartmentsTab.tsx` is only a placeholder. `AdminPage` and the backend Users/Mall Access administration endpoints are ADMIN-only.
- `UserMallAccess` permits more than one active Mall for a staff user. Frontend state stores a selected/active Mall, but no existing department resource is scoped to it.

## EXPECTED BEHAVIOR

- A new `Department` master-data entity belongs permanently to one Mall, has a name, optional description, and optional parent within the same Mall.
- List, create, edit, and hard-delete operations are exposed by a dedicated Departments module/API and explicitly enforce Mall scope at the backend data-access boundary.
- ADMIN can select any Mall. A non-ADMIN department operator can only work in an authorised Mall; a client-supplied Mall ID must never grant access or move a record to another Mall.
- The Departments tab lists departments for the selected Mall, supports name search, and provides create/edit/delete with confirmation. The create/edit form lists only same-Mall parent choices and includes a root option ("Không thuộc").
- `User.department` remains the existing nullable string column. New assignments store a Department ID in this column; legacy unmatched strings remain unchanged and resolve to no Department display value.
- A post-base-seed script creates the initial department master data for the first seeded Mall from the existing seed labels.

## PRIMARY DOMAIN
Platform Administration / Users (Security Architect), with Multi-Mall authorization overlay.

## AFFECTED JOURNEYS

- New proposed GS-16: Department administration within one Mall.
- GS-09 Cross-Mall denial.
- BP-013 Multi-Mall Operations (scope enforcement only; no portfolio aggregation).

## UPSTREAM IMPACT

- Authenticated identity, role, `User.activeMallId`, and `UserMallAccess` grants determine the caller's authorised Mall scope.
- `GET /spaces/malls` is the existing Mall catalogue API. It already returns only accessible Malls for non-bypass roles; ADMIN gets the whole catalogue.
- Current user records and `prisma/seed.ts` free-text department labels must be classified before the User field becomes relational.

## DOWNSTREAM IMPACT

- Users API, user create/edit dialog, users list, profile display, approvals and work-order read surfaces currently display the free-text `User.department` value.
- `WorkOrder.assignedDepartment` and `WorkOrderTemplate.assignedDepartment` are independent free-text operational fields. They are checked consumers but are **out of scope** for automatic conversion in this CR unless the Impact Map is amended and reviewed.
- Admin navigation, role/route permissions, translations, generated Prisma client, OpenAPI/Swagger, and seed scripts consume the new module/schema.
- No Billing, Contracts, reporting, SAP, outbox/event, notification, or document consumer is expected to consume Department data; this must be re-verified during implementation.

## DATA OWNERSHIP IMPACT

- Departments are new Mall-scoped organisational master data. The Departments service is the sole writer.
- The existing `User.department` field is owned by Users and remains a nullable string. Users workflows assign Department IDs; Departments may clear matching values only inside the approved hard-delete transaction.

## STATE MACHINE IMPACT
N/A — Department has no business status or lifecycle state.

## FINANCIAL IMPACT
N/A — no money field, formula, invoice, charge, or financial calculation changes.

## CURRENCY IMPACT
N/A — Department is non-financial master data and must not be used to infer or transform currency.

## MALL/COMPANY IMPACT

- `Department.mallId` is immutable after creation.
- Parent selection and parent/child traversal are constrained to the same `mallId`; cross-Mall parenting is rejected.
- Query/list requests require an explicit or server-resolved Mall scope. Non-ADMIN scope derives from verified `UserMallAccess`, not from UI state alone.
- There is no Company entity in the current schema; Company impact is N/A.

## TENANT IMPACT

- TENANT must not receive Department administration access.
- Existing Tenant Portal identity isolation remains unchanged.

## AUTHORIZATION IMPACT

- New endpoints must carry explicit `@Roles(...)` and Mall checks. The global `MallAccessGuard` alone is insufficient because its resolver does not know Department IDs.
- Create/list: validate requested `mallId` with `MallAccessService.assertMallAccess` or use an approved server-selected Mall.
- Read/update/delete by Department ID: resolve the Department's stored `mallId`, then call `assertMallAccess` before returning or mutating it.
- Update DTO must not accept `mallId`; this prevents a department from being moved between Malls.
- ADMIN bypass behaviour follows the existing `MallAccessService`; no other role gets implicit cross-Mall access.
- Department CRUD is allowed to `ADMIN`, `CEO`, and `MALL_DIRECTOR`. Other Admin tabs and endpoints remain under their existing role policies.

## REPORTING IMPACT
N/A — Department is not a reporting dimension in this scope. Dashboard/Reports/Analytics are checked but unchanged.

## TRANSACTION IMPACT

- Create is atomic for Department row validation and insert.
- Update validates target Department and same-Mall parent before update; it must reject self-parenting and any cycle.
- Delete must resolve the target and enforce access before removal. A Department with children is rejected. A leaf Department is deleted atomically with clearing every `User.department` value exactly equal to that Department ID.

## EVENT/JOB IMPACT
N/A — no outbox event, queue processor, cron, or retry job is introduced.

## DOCUMENT IMPACT
N/A — no contract, invoice, export, or document template change.

## API IMPACT

- New frontend API client and NestJS controller under a dedicated Departments module.
- Planned REST surface: list by `mallId` plus optional name search; get one; create; update; delete. The exact verb mapping (POST/GET/PATCH/DELETE) and response pagination format will follow established module conventions.
- Users API retains `department: string | null` for writes and adds a nullable resolved Department display object/value. Unmatched legacy strings return a null Department lookup and display "Chưa có thông tin".

## MIGRATION

1. Add a Mall-scoped self-referencing Department table and indices for Mall/listing and parent lookup.
2. Keep `User.department` as an unconstrained nullable string so legacy unmatched values remain valid. New UI selections write Department IDs; reads resolve matching IDs manually rather than adding a foreign-key constraint.
3. Add `prisma/scripts/seed-departments.ts`, idempotent and safe only after base seed has supplied at least one Mall. Seed the labels evidenced in `prisma/seed.ts` for that Mall as root Departments; no unapproved hierarchy is invented.
4. Generate Prisma client and verify migration against a disposable/local database before release.

## BACKWARD COMPATIBILITY

- Existing User rows retain their current free-text values unchanged. They resolve to null unless their value already equals an existing Department ID.
- Existing API consumers retain `department: string | null`; user-facing surfaces use the new resolved Department name and display the localized missing-information fallback for unmatched values.

## GOLDEN E2E SCENARIOS

- GS-16 (new): an authorised operator selects an in-scope Mall, creates a root department and a child department, searches/edits them, assigns a user, and verifies the hierarchy and user display.
- GS-09: an out-of-scope staff user cannot list, create, read, update, or delete another Mall's department, including by guessed Department ID.
- Failure variant: parent ID from a different Mall, self-parent, and cyclic reparent requests fail without any write.
- Concurrency variant: concurrent duplicate/create and delete-versus-update behavior is specified and tested after duplicate/deletion policy is confirmed.

## RECONCILIATION

- Compare each assigned user's selected Department name/ID between the Users list, user edit dialog, profile, and any existing approval/work-order read display that consumes `User.department`.
- Verify no unrelated `WorkOrder.assignedDepartment` / template text is changed by this CR.
- Verify list counts and parent labels match the selected Mall only.

## ROLLBACK

- Roll back frontend/module deployment first if required; retain the additive table and legacy User value.
- A destructive data rollback is not authorised. Migration rollback is only safe before production Department assignments exist; otherwise restore from backup or apply a forward corrective migration.

## OPEN BUSINESS QUESTIONS

N/A — BC-021 through BC-024 were answered by the business owner on 2026-08-27. For Department administration, non-ADMIN operators use their server-validated active Mall context; a user's single Department assignment is independent of how many Malls they may access.

---

## Severity classification
Priority: P0 — Tier: 0. Incorrect implementation can violate cross-Mall data isolation or corrupt organisational/user assignment data.

## Gate results

- Gate 1 — **PASS**: Prisma validate/generate, backend Nest build, frontend TypeScript/Vite production build, 40 targeted backend tests, and the full frontend regression suite (289 tests) passed.
- Gate 2 — **PASS**: migration applied to local PostgreSQL; the idempotent seed created 8 rows on the first run and 0 on the second. A real-DB service smoke covered root/child create, search, edit, parent-delete rejection, leaf delete, and atomic `User.department` clearing. All temporary rows were removed and the original User value was restored.
- Gate 3 — **PASS**: Users, Auth, Approval, and Work Order consumers were rechecked. Targeted tests passed and the additive `departmentInfo` response leaves the legacy `department` field intact. No existing XMOD contract changed.
- Gate 4 — **PARTIAL**: the running local API completed the GS-16 CRUD sequence and GS-09 denial sequence; React component tests covered ADMIN selection and MALL_DIRECTOR locked-Mall behavior. A single browser-driven journey across the deployed UI and API was not run.
- Gate 5 — **PARTIAL**: same-Mall validation, hierarchy-cycle prevention, parent-delete conflict, denied-role/out-of-scope errors, and UI query/mutation error handling are safe. Database outage/network-loss injection was not run because this module has no asynchronous or financial side effect.
- Gate 6 — **PASS (structural race)**: an actual concurrent parent-delete versus child-create race produced delete success/create rejection with no orphan; the database `RESTRICT` foreign key also protects the inverse ordering. Because BC-022 deliberately keeps `User.department` unconstrained, a concurrent User assignment after deletion can become an unmatched legacy-style value; every read resolves it to null rather than exposing an invalid Department.
- Gate 7 — **PASS**: running API accepted ADMIN, CEO, and MALL_DIRECTOR (HTTP 200), rejected FINANCE (HTTP 403), and rejected MALL_DIRECTOR list/create against an ungranted Mall (HTTP 403). Controller tests verify ID-based mutations check the Department's stored Mall before service mutation.
- Gate 8 — **PASS for changed surfaces**: a temporary valid Department assignment resolved as `IT` consistently in Users list, login response, and `/auth/me`, then the previous legacy value was restored. Profile/Users consume that resolved field; Work Order and Approval consumers compile and their targeted regression suites pass. Independent `WorkOrder.assignedDepartment` values were not changed.
- Gate 9 — **N/A**: no Dashboard, Reports, Analytics, money, currency, or financial formula is affected.

## Implementation result

- Added the Mall-owned self-referencing `Departments` table, an additive creation migration followed by a table/object rename migration, generated-client support, and an idempotent post-base-seed script for `IT`, `Leasing`, `Management`, `Finance`, `Legal`, `Operations`, `Executive`, and `Tenant`.
- Added dedicated Department DTO/controller/service/module endpoints for the operator's Mall catalogue, paginated search, complete selector options, read, create, PUT/PATCH update, and hard delete. The dedicated Mall catalogue avoids broadening CEO access to the unrelated Spaces module.
- Kept Mall immutable, validates all requested/stored Mall scopes server-side, restricts management to ADMIN/CEO/MALL_DIRECTOR, rejects cross-Mall parents and hierarchy cycles, and requires bottom-up deletion.
- Kept `User.department` unchanged and unconstrained. New UI assignments write Department IDs; API reads expose nullable `departmentInfo`; legacy unmatched strings remain stored and display the localized missing-information value.
- Replaced the Departments placeholder with Mall selection/locking, search, pagination, create/edit forms, complete same-Mall parent options, and translated delete confirmation/errors. Added `departments.json` for Vietnamese and English and registered the namespace.

## Residual risk / follow-up

- Department-name uniqueness is outside this CR's declared requirements. The implementation therefore permits duplicate names in one Mall; introducing a uniqueness rule later requires an explicit business decision and follow-up CR rather than an inferred constraint.
- A browser-driven Golden E2E remains desirable before production release even though API, component, build, and real-database evidence passed.
- Multi-Mall / Security Architect and ERP Chief Architect production sign-off remain pending; this implementation does not self-approve the Tier-0 change.

## Sign-off

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Multi-Mall / Security Architect |  |  | PENDING |
| Users / Functional Owner | Business owner | 2026-08-27 | APPROVED — BC-021 through BC-024 |
| ERP Chief Architect |  |  | PENDING |
