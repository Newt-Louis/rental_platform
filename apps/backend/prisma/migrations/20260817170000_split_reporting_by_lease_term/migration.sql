-- Pipeline classification is required before a lead selects a unit.
ALTER TABLE "Lead"
  ADD COLUMN "leaseTermType" "UnitLeaseTermType" NOT NULL DEFAULT 'LONG';

-- Historical occupancy snapshots are stored independently for each rental type.
ALTER TABLE "OccupancySnapshot"
  ADD COLUMN "leaseTermType" "UnitLeaseTermType" NOT NULL DEFAULT 'LONG';

DROP INDEX IF EXISTS "OccupancySnapshot_mallId_floorId_category_period_key";

CREATE UNIQUE INDEX "OccupancySnapshot_mallId_floorId_category_leaseTermType_period_key"
  ON "OccupancySnapshot"("mallId", "floorId", "category", "leaseTermType", "period");

CREATE INDEX "Lead_leaseTermType_mallId_status_idx"
  ON "Lead"("leaseTermType", "mallId", "status");
