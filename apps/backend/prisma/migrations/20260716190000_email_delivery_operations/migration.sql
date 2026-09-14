ALTER TABLE "EmailDelivery"
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "entityType" TEXT,
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "mallId" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "originalDeliveryId" TEXT,
  ADD COLUMN "resendOfId" TEXT;

CREATE INDEX "EmailDelivery_mallId_createdAt_idx" ON "EmailDelivery"("mallId", "createdAt");
CREATE INDEX "EmailDelivery_originalDeliveryId_idx" ON "EmailDelivery"("originalDeliveryId");
CREATE INDEX "EmailDelivery_resendOfId_idx" ON "EmailDelivery"("resendOfId");

ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_originalDeliveryId_fkey"
  FOREIGN KEY ("originalDeliveryId") REFERENCES "EmailDelivery"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_resendOfId_fkey"
  FOREIGN KEY ("resendOfId") REFERENCES "EmailDelivery"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
