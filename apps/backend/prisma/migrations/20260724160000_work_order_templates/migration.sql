-- CreateTable
CREATE TABLE "WorkOrderTemplate" (
    "id" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "location" TEXT,
    "assignedDepartment" TEXT,
    "assigneeId" TEXT,
    "frequency" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "dueHours" INTEGER NOT NULL DEFAULT 24,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkOrder" ADD COLUMN "templateId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE UNIQUE INDEX "WorkOrderTemplate_mallId_name_key" ON "WorkOrderTemplate"("mallId", "name");
CREATE INDEX "WorkOrderTemplate_isActive_nextRunAt_idx" ON "WorkOrderTemplate"("isActive", "nextRunAt");
CREATE INDEX "WorkOrderTemplate_mallId_category_idx" ON "WorkOrderTemplate"("mallId", "category");
CREATE UNIQUE INDEX "WorkOrder_templateId_scheduledFor_key" ON "WorkOrder"("templateId", "scheduledFor");
ALTER TABLE "WorkOrderTemplate" ADD CONSTRAINT "WorkOrderTemplate_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderTemplate" ADD CONSTRAINT "WorkOrderTemplate_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderTemplate" ADD CONSTRAINT "WorkOrderTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkOrderTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
