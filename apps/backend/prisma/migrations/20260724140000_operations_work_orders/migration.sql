CREATE TABLE "WorkOrder" (
  "id" TEXT NOT NULL, "workOrderNumber" TEXT NOT NULL, "mallId" TEXT NOT NULL, "unitId" TEXT,
  "category" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" TEXT NOT NULL DEFAULT 'NEW', "location" TEXT, "assignedDepartment" TEXT, "requesterId" TEXT NOT NULL,
  "assigneeId" TEXT, "reviewerId" TEXT, "dueDate" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3), "reviewStatus" TEXT, "reviewNote" TEXT, "sourceEntityType" TEXT, "sourceEntityId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkOrderChecklistItem" (
  "id" TEXT NOT NULL, "workOrderId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT true, "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3), "completedById" TEXT, "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkOrderChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkOrderEvent" (
  "id" TEXT NOT NULL, "workOrderId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "description" TEXT,
  "oldValue" TEXT, "newValue" TEXT, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkOrderEvidence" (
  "id" TEXT NOT NULL, "workOrderId" TEXT NOT NULL, "evidenceType" TEXT NOT NULL DEFAULT 'PROGRESS',
  "fileName" TEXT NOT NULL, "filePath" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "mimeType" TEXT NOT NULL,
  "caption" TEXT, "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkOrder_workOrderNumber_key" ON "WorkOrder"("workOrderNumber");
CREATE INDEX "WorkOrder_mallId_status_dueDate_idx" ON "WorkOrder"("mallId", "status", "dueDate");
CREATE INDEX "WorkOrder_assigneeId_status_idx" ON "WorkOrder"("assigneeId", "status");
CREATE INDEX "WorkOrder_assignedDepartment_status_idx" ON "WorkOrder"("assignedDepartment", "status");
CREATE INDEX "WorkOrder_sourceEntityType_sourceEntityId_idx" ON "WorkOrder"("sourceEntityType", "sourceEntityId");
CREATE INDEX "WorkOrderChecklistItem_workOrderId_order_idx" ON "WorkOrderChecklistItem"("workOrderId", "order");
CREATE INDEX "WorkOrderEvent_workOrderId_createdAt_idx" ON "WorkOrderEvent"("workOrderId", "createdAt");
CREATE INDEX "WorkOrderEvidence_workOrderId_evidenceType_idx" ON "WorkOrderEvidence"("workOrderId", "evidenceType");
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderEvidence" ADD CONSTRAINT "WorkOrderEvidence_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderEvidence" ADD CONSTRAINT "WorkOrderEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
