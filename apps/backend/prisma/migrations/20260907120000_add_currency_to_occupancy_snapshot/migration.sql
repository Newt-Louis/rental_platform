-- CUR-002 (OccupancySnapshot subset) / MON-CUR-OCC-01
--
-- Adds the unit of account for OccupancySnapshot.revenuePerSqm.
--
-- NULLABLE with NO DEFAULT, on purpose. OccupancySnapshot is a historical
-- monthly series, so the currency belongs to the snapshot rather than to current
-- configuration: deriving it later from Mall/Unit state would relabel history.
--
-- No backfill. The monthly writer's source query is explicitly
-- `currencyCode = 'VND'`-scoped and rows it writes from now on record that, but
-- existing rows are indistinguishable from the seed's fabricated figures, so
-- they stay NULL and read as UNKNOWN. Run
-- prisma/scripts/occupancy-snapshot-currency-reconciliation.sql before and after.
--
-- One ADD COLUMN, no rows touched, no table rewrite (nullable, no default, no
-- constraint) -- only a brief ACCESS EXCLUSIVE lock.
-- Rollback: ALTER TABLE "OccupancySnapshot" DROP COLUMN "revenuePerSqmCurrency";

ALTER TABLE "OccupancySnapshot" ADD COLUMN "revenuePerSqmCurrency" "CurrencyCode";
