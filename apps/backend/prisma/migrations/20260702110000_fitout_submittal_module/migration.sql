-- AlterTable
ALTER TABLE "FitoutFormType" ADD COLUMN     "approverRoles" JSONB;

-- CreateTable
CREATE TABLE "FitoutSubmittal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "formTypeId" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL DEFAULT 1,
    "parentSubmittalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "workflowId" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitoutSubmittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityComment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityDistribution" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitoutSubmittal_workflowId_key" ON "FitoutSubmittal"("workflowId");

-- CreateIndex
CREATE INDEX "FitoutSubmittal_projectId_formTypeId_idx" ON "FitoutSubmittal"("projectId", "formTypeId");

-- CreateIndex
CREATE INDEX "FitoutSubmittal_projectId_status_idx" ON "FitoutSubmittal"("projectId", "status");

-- CreateIndex
CREATE INDEX "EntityComment_entityType_entityId_idx" ON "EntityComment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityDistribution_entityType_entityId_idx" ON "EntityDistribution"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityDistribution_entityType_entityId_userId_key" ON "EntityDistribution"("entityType", "entityId", "userId");

-- AddForeignKey
ALTER TABLE "FitoutSubmittal" ADD CONSTRAINT "FitoutSubmittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FitoutProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutSubmittal" ADD CONSTRAINT "FitoutSubmittal_formTypeId_fkey" FOREIGN KEY ("formTypeId") REFERENCES "FitoutFormType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutSubmittal" ADD CONSTRAINT "FitoutSubmittal_parentSubmittalId_fkey" FOREIGN KEY ("parentSubmittalId") REFERENCES "FitoutSubmittal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutSubmittal" ADD CONSTRAINT "FitoutSubmittal_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutSubmittal" ADD CONSTRAINT "FitoutSubmittal_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityComment" ADD CONSTRAINT "EntityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityDistribution" ADD CONSTRAINT "EntityDistribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed sensible default approver chains for the legacy form types (2-level for
-- design/safety/handover documents, 1-level for permits/reports).
UPDATE "FitoutFormType" SET "approvalLevels" = 2, "approverRoles" = '["OPERATION","MALL_DIRECTOR"]' WHERE code IN ('DESIGN_DRAWING', 'MEP_DRAWING', 'FIRE_SAFETY_CERT', 'PCCC_APPROVAL', 'HANDOVER_FORM');
UPDATE "FitoutFormType" SET "approvalLevels" = 1, "approverRoles" = '["OPERATION"]' WHERE code IN ('CONSTRUCTION_PERMIT', 'INSURANCE_CERT', 'INSPECTION_REPORT', 'OTHER');
