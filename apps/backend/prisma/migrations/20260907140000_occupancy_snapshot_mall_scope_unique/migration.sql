-- OCC-CRON-001 — make the monthly occupancy snapshot key actually enforceable.
--
-- `takeMonthlySnapshot` writes MALL-LEVEL snapshots, i.e. floorId IS NULL and
-- category IS NULL, and upserts on
-- @@unique([mallId, floorId, category, leaseTermType, period]).
--
-- That key cannot do the job for those rows, for two independent reasons:
--
--   1. Prisma refuses `null` inside a compound-unique `where`
--      ("Argument `floorId` must not be null"), so the upsert threw on every
--      run and the job has never written a row.
--   2. Even bypassing Prisma, Postgres treats NULLs as DISTINCT in a standard
--      unique index, so ("mallId", NULL, NULL, leaseTermType, period) never
--      collides with itself. The constraint would have permitted unlimited
--      duplicate mall-level snapshots.
--
-- Fixing only (1) -- swapping the upsert for findFirst + create -- would leave
-- (2) in place: an application-level check with nothing behind it, which is the
-- same shape as BILL-002. So the null scope gets its own PARTIAL unique index,
-- carrying exactly the predicate the writer uses.
--
-- Prisma schema cannot express a partial unique index, hence raw SQL. The
-- original @@unique is left alone: it still covers any future per-floor or
-- per-category snapshot, where the columns are NOT NULL and the semantics hold.
--
-- Verified before creating: 0 duplicate (mallId, leaseTermType, period) groups
-- among the 6 existing mall-level rows. A partial unique index cannot be created
-- while duplicates exist.

CREATE UNIQUE INDEX "OccupancySnapshot_mall_scope_period_key"
  ON "OccupancySnapshot" ("mallId", "leaseTermType", "period")
  WHERE "floorId" IS NULL AND "category" IS NULL;
