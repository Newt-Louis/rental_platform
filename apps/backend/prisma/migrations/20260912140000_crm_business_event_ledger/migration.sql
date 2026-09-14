-- CR-CRM-BUSINESS-EVENT-001 Phase B. Additive only; no history backfill.
CREATE TYPE "CrmBusinessEventType" AS ENUM (
  'LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_STATUS_CHANGED',
  'LEAD_OWNER_CHANGED', 'LEAD_CATEGORY_CHANGED', 'LEAD_MALL_ASSIGNED',
  'ACTIVITY_ADDED', 'FOLLOW_UP_CREATED', 'FOLLOW_UP_UPDATED',
  'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_CANCELLED', 'CUSTOMER_CREATED',
  'CUSTOMER_LINKED', 'BOOKING_CREATED', 'BOOKING_LINKED',
  'PROPOSAL_CREATED', 'PROPOSAL_SUBMITTED', 'PROPOSAL_APPROVED',
  'PROPOSAL_REJECTED', 'LEAD_CONVERTED', 'LEAD_WON', 'LEAD_LOST',
  'LEAD_REOPENED'
);
CREATE TYPE "CrmEventScope" AS ENUM ('MALL', 'GLOBAL_UNASSIGNED');
CREATE TYPE "CrmActorType" AS ENUM ('USER', 'SYSTEM');
CREATE TYPE "CrmEventSourceModule" AS ENUM (
  'CRM', 'CUSTOMER', 'BOOKING', 'PROPOSAL', 'APPROVAL', 'CONTRACT', 'SYSTEM'
);
CREATE TYPE "CrmFollowUpStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

ALTER TABLE "LeadActivity"
  ADD COLUMN "outcome" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "occurredAt" TIMESTAMP(3);

ALTER TABLE "LeadFollowUp"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "status" "CrmFollowUpStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "completedById" TEXT,
  ADD COLUMN "outcome" TEXT,
  ADD COLUMN "completionComment" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Structural compatibility only: this does not invent who completed the item.
UPDATE "LeadFollowUp"
SET "status" = 'COMPLETED'
WHERE "isDone" = true;

CREATE INDEX "LeadFollowUp_status_dueDate_idx" ON "LeadFollowUp"("status", "dueDate");
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CrmBusinessEvent" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "customerId" TEXT,
  "mallId" TEXT,
  "scope" "CrmEventScope" NOT NULL,
  "eventType" "CrmBusinessEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorType" "CrmActorType" NOT NULL,
  "actorUserId" TEXT,
  "sourceModule" "CrmEventSourceModule" NOT NULL,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "fromStatus" "LeadStatus",
  "toStatus" "LeadStatus",
  "reasonCode" TEXT,
  "reason" TEXT,
  "comment" TEXT,
  "metadataJson" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmBusinessEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmBusinessEvent_idempotencyKey_key" ON "CrmBusinessEvent"("idempotencyKey");
CREATE INDEX "CrmBusinessEvent_leadId_occurredAt_id_idx" ON "CrmBusinessEvent"("leadId", "occurredAt", "id");
CREATE INDEX "CrmBusinessEvent_customerId_occurredAt_id_idx" ON "CrmBusinessEvent"("customerId", "occurredAt", "id");
CREATE INDEX "CrmBusinessEvent_mallId_occurredAt_id_idx" ON "CrmBusinessEvent"("mallId", "occurredAt", "id");
CREATE INDEX "CrmBusinessEvent_eventType_occurredAt_id_idx" ON "CrmBusinessEvent"("eventType", "occurredAt", "id");

ALTER TABLE "CrmBusinessEvent" ADD CONSTRAINT "CrmBusinessEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmBusinessEvent" ADD CONSTRAINT "CrmBusinessEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmBusinessEvent" ADD CONSTRAINT "CrmBusinessEvent_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmBusinessEvent" ADD CONSTRAINT "CrmBusinessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CrmBusinessEvent" ADD CONSTRAINT "CrmBusinessEvent_scope_mall_check" CHECK (
  ("scope" = 'MALL' AND "mallId" IS NOT NULL)
  OR ("scope" = 'GLOBAL_UNASSIGNED' AND "mallId" IS NULL)
);
ALTER TABLE "CrmBusinessEvent" ADD CONSTRAINT "CrmBusinessEvent_actor_check" CHECK (
  ("actorType" = 'USER' AND "actorUserId" IS NOT NULL)
  OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL)
);
