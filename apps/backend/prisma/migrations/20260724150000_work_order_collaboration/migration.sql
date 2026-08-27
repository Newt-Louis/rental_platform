CREATE TABLE "WorkOrderComment" (
  "id" TEXT NOT NULL, "workOrderId" TEXT NOT NULL, "userId" TEXT NOT NULL, "content" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkOrderComment_workOrderId_createdAt_idx" ON "WorkOrderComment"("workOrderId", "createdAt");
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
