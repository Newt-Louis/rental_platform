-- CreateTable
CREATE TABLE "FitoutIssue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "floorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'DEFECT',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPENED',
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "positionX" DOUBLE PRECISION,
    "positionY" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitoutIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FitoutIssue_projectId_status_idx" ON "FitoutIssue"("projectId", "status");

-- CreateIndex
CREATE INDEX "FitoutIssue_unitId_status_idx" ON "FitoutIssue"("unitId", "status");

-- AddForeignKey
ALTER TABLE "FitoutIssue" ADD CONSTRAINT "FitoutIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FitoutProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutIssue" ADD CONSTRAINT "FitoutIssue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutIssue" ADD CONSTRAINT "FitoutIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutIssue" ADD CONSTRAINT "FitoutIssue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
