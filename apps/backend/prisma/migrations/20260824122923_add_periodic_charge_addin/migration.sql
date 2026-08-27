-- CreateEnum
CREATE TYPE "MallLeaseCategory" AS ENUM ('OFFICE', 'MALL');

-- CreateEnum
CREATE TYPE "PeriodicChargeType" AS ENUM ('MANAGEMENT_FEE_SURCHARGE', 'UTILITY', 'AFTER_HOURS_COOLING');

-- CreateEnum
CREATE TYPE "PeriodicChargeStatus" AS ENUM ('PENDING', 'DRAFT', 'CONFIRMED', 'NO_CHARGE', 'INVOICED');

-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'PERIODIC_CHARGE';

-- DropIndex
DROP INDEX "Lead_leaseTermType_mallId_status_idx";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "periodicChargeTypes" "PeriodicChargeType"[] DEFAULT ARRAY[]::"PeriodicChargeType"[];

-- AlterTable
ALTER TABLE "Mall" ADD COLUMN     "leaseCategory" "MallLeaseCategory" NOT NULL DEFAULT 'MALL';

-- CreateTable
CREATE TABLE "PeriodicChargeRateConfig" (
    "id" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "chargeType" "PeriodicChargeType" NOT NULL,
    "ratesJson" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodicChargeRateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodicChargeEntry" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "chargeType" "PeriodicChargeType" NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodicChargeStatus" NOT NULL DEFAULT 'PENDING',
    "inputData" JSONB,
    "lines" JSONB,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "assignedToId" TEXT,
    "draftedAt" TIMESTAMP(3),
    "draftedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "noChargeAt" TIMESTAMP(3),
    "noChargeById" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodicChargeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodicChargeRateConfig_mallId_chargeType_isActive_idx" ON "PeriodicChargeRateConfig"("mallId", "chargeType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodicChargeEntry_invoiceId_key" ON "PeriodicChargeEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "PeriodicChargeEntry_status_dueDate_idx" ON "PeriodicChargeEntry"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodicChargeEntry_contractId_chargeType_period_key" ON "PeriodicChargeEntry"("contractId", "chargeType", "period");

-- AddForeignKey
ALTER TABLE "PeriodicChargeRateConfig" ADD CONSTRAINT "PeriodicChargeRateConfig_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodicChargeEntry" ADD CONSTRAINT "PeriodicChargeEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodicChargeEntry" ADD CONSTRAINT "PeriodicChargeEntry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodicChargeEntry" ADD CONSTRAINT "PeriodicChargeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OccupancySnapshot_mallId_floorId_category_leaseTermType_period_" RENAME TO "OccupancySnapshot_mallId_floorId_category_leaseTermType_per_key";

-- RenameIndex
ALTER INDEX "SlotBooking_installationStartDatetime_dismantlingEndDatetime_id" RENAME TO "SlotBooking_installationStartDatetime_dismantlingEndDatetim_idx";
