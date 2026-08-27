CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "recipient" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailDelivery_eventKey_key" ON "EmailDelivery"("eventKey");
CREATE INDEX "EmailDelivery_status_nextAttemptAt_createdAt_idx"
ON "EmailDelivery"("status", "nextAttemptAt", "createdAt");
