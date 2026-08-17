-- Every unit belongs to exactly one rental zone. Existing unclassified units
-- remain backward-compatible by being assigned to the long-term zone.
UPDATE "Unit"
SET "leaseTermType" = 'LONG'
WHERE "leaseTermType" IS NULL;

ALTER TABLE "Unit"
  ALTER COLUMN "leaseTermType" SET DEFAULT 'LONG',
  ALTER COLUMN "leaseTermType" SET NOT NULL;

-- Short-term bookings distinguish the operational occupancy window from the
-- chargeable rental window (startDatetime/endDatetime).
ALTER TABLE "SlotBooking"
  ADD COLUMN "installationStartDatetime" TIMESTAMP(3),
  ADD COLUMN "installationEndDatetime" TIMESTAMP(3),
  ADD COLUMN "dismantlingStartDatetime" TIMESTAMP(3),
  ADD COLUMN "dismantlingEndDatetime" TIMESTAMP(3);

CREATE INDEX "SlotBooking_installationStartDatetime_dismantlingEndDatetime_idx"
  ON "SlotBooking"("installationStartDatetime", "dismantlingEndDatetime");
