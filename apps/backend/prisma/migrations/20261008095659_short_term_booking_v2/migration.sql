-- CreateEnum
CREATE TYPE "SlotCategory" AS ENUM ('EVENT', 'ADVERTISING', 'KIOSK');

-- CreateEnum
CREATE TYPE "SlotPricingTimeBasis" AS ENUM ('PROGRAM_ONLY', 'SETUP_TO_DISMANTLE', 'CUSTOM_RANGE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SlotBookingStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "SlotBookingStatus" ADD VALUE 'APPROVED';
ALTER TYPE "SlotBookingStatus" ADD VALUE 'LOCKED';
ALTER TYPE "SlotBookingStatus" ADD VALUE 'CONTRACTED';

-- AlterTable
ALTER TABLE "SlotBooking" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "conflictFlaggedAt" TIMESTAMP(3),
ADD COLUMN     "conflictWithBookingId" TEXT,
ADD COLUMN     "lockReason" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedByBookingId" TEXT,
ADD COLUMN     "pricingEnd" TIMESTAMP(3),
ADD COLUMN     "pricingStart" TIMESTAMP(3),
ADD COLUMN     "pricingTimeBasis" "SlotPricingTimeBasis" NOT NULL DEFAULT 'PROGRAM_ONLY',
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "shortTermPlanUrl" TEXT;

-- AlterTable
ALTER TABLE "UnitSlot" ADD COLUMN     "category" "SlotCategory",
ADD COLUMN     "polygon" JSONB,
ADD COLUMN     "priceWeekdayPerDaySqm" DOUBLE PRECISION,
ADD COLUMN     "priceWeekendHolidayPerDaySqm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "totalArea" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SlotBookingLine" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "areaRented" DOUBLE PRECISION NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotBookingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MallHoliday" (
    "id" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MallHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotBookingLine_slotId_idx" ON "SlotBookingLine"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotBookingLine_bookingId_slotId_key" ON "SlotBookingLine"("bookingId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "MallHoliday_mallId_date_key" ON "MallHoliday"("mallId", "date");

-- CreateIndex
CREATE INDEX "SlotBooking_conflictWithBookingId_idx" ON "SlotBooking"("conflictWithBookingId");

-- CreateIndex
CREATE INDEX "SlotBooking_lockedByBookingId_idx" ON "SlotBooking"("lockedByBookingId");

-- AddForeignKey
ALTER TABLE "SlotBooking" ADD CONSTRAINT "SlotBooking_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotBookingLine" ADD CONSTRAINT "SlotBookingLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "SlotBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotBookingLine" ADD CONSTRAINT "SlotBookingLine_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "UnitSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MallHoliday" ADD CONSTRAINT "MallHoliday_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: mỗi SlotBooking cũ thành 1 dòng SlotBookingLine (slot chính, toàn bộ diện tích đã lưu)
INSERT INTO "SlotBookingLine" ("id", "bookingId", "slotId", "areaRented", "baseAmount", "amount")
SELECT 'sbl_' || "id", "id", "slotId", COALESCE("totalArea", 0), COALESCE("baseAmount", 0), "totalAmount"
FROM "SlotBooking";
