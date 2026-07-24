ALTER TABLE "ServiceContractPayment"
ADD COLUMN "periodType" TEXT,
ADD COLUMN "periodNumber" INTEGER,
ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "reminderSentAt" TIMESTAMP(3);
CREATE INDEX "ServiceContractPayment_reminderSentAt_dueDate_idx" ON "ServiceContractPayment"("reminderSentAt", "dueDate");
