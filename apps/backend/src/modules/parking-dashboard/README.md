# Parking Dashboard Module

Read-only reporting over the external parking system's database
(`PARKING_DATABASE_URL`, separate Prisma schema at
`apps/backend/prisma/parking/schema.prisma`). Not mall-scoped yet — see
`CR-101 Phase 1` note in `parking-dashboard.controller.ts` (tracked as `BC-008`).

Key files:
- `parking-dashboard.controller.ts` — routes (`monthly-summary`, `revenue-vehicle-chart-by-month/year`, `transactions`, `transactions/v2`, `export`).
- `parking-dashboard.service.ts` — queries against `parking_transactions` (partitioned by `check_in_time`, monthly: `parking_transactions_t1..t5`).

## Add new tenant

A "tenant" here is one parking lot (bãi đỗ xe), identified by `tenant_code` (e.g.
the mall/lot code used as `parkingCode` in every API call).

1. Insert the row into the parking DB's `tenants` table:
   ```sql
   INSERT INTO tenants (tenant_code, name, description)
   VALUES ('PVT', 'Phan Văn Trị', NULL);
   ```
2. If the lot's source system reports vehicle types with codes not already
   mapped, add rows to `vehicle_type_mappings` (`tenant_id` = the new row's id,
   or `NULL` for a mapping shared across all tenants):
   ```sql
   INSERT INTO vehicle_type_mappings (tenant_id, local_vehicle_type_id, foreign_vehicle_type_id)
   VALUES (<new_tenant_id>, <id from vehicle_types>, '<code from source system>');
   ```
   Unmapped types fall back to the raw `vehicle_type_name` on the transaction
   row, then the literal `"Khác"` — see `resolveVehicleTypeLabel`.
3. No index changes needed. Every index in `parking-dashboard-indexes.sql` is
   keyed by `tenant_id` first, so a new tenant is covered automatically as its
   transactions sync in — nothing is per-tenant.
4. Confirm the sync job (external, outside this repo) is writing into a
   partition that exists for the tenant's transaction dates. `parking_transactions`
   is partitioned by `check_in_time`; if the source data predates the oldest
   partition or postdates the newest, a new partition must be added first or
   inserts will fail/be misrouted — check with:
   ```sql
   SELECT inhrelid::regclass::text AS partition,
          pg_get_expr(c.relpartbound, c.oid) AS range
   FROM pg_inherits
   JOIN pg_class c ON c.oid = inhrelid
   WHERE inhparent = 'parking_transactions'::regclass
   ORDER BY partition;
   ```
5. Smoke-test: `GET /parking-dashboard/monthly-summary?parkingCode=PVT` should
   return `404 Không tìm thấy bãi đỗ xe...` before step 1, and real (possibly
   zero) buckets after.
