-- AlterEnum
ALTER TYPE "PriceApprovalStatus" ADD VALUE 'NOT_REQUIRED';

-- AlterTable
ALTER TABLE "UnitBooking" ADD COLUMN     "priceProposedAt" TIMESTAMP(3),
ADD COLUMN     "priceProposedById" TEXT;

-- CreateTable
CREATE TABLE "BookingPriceApprovalStep" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "approverRole" "Role" NOT NULL,
    "approverId" TEXT NOT NULL,
    "policyRuleCode" TEXT,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPriceApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPriceApprovalStep_approverId_status_idx" ON "BookingPriceApprovalStep"("approverId", "status");

-- CreateIndex
CREATE INDEX "BookingPriceApprovalStep_bookingId_status_idx" ON "BookingPriceApprovalStep"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPriceApprovalStep_bookingId_stepOrder_key" ON "BookingPriceApprovalStep"("bookingId", "stepOrder");

-- AddForeignKey
ALTER TABLE "UnitBooking" ADD CONSTRAINT "UnitBooking_priceProposedById_fkey" FOREIGN KEY ("priceProposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPriceApprovalStep" ADD CONSTRAINT "BookingPriceApprovalStep_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "UnitBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPriceApprovalStep" ADD CONSTRAINT "BookingPriceApprovalStep_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPriceApprovalStep" ADD CONSTRAINT "BookingPriceApprovalStep_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

