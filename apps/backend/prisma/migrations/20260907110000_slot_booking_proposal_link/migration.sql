-- AlterEnum
ALTER TYPE "SlotBookingStatus" ADD VALUE 'CONVERTED';

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "slotBookingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_slotBookingId_key" ON "Proposal"("slotBookingId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_slotBookingId_fkey" FOREIGN KEY ("slotBookingId") REFERENCES "SlotBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
