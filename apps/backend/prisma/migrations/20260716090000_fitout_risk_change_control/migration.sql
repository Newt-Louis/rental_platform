CREATE TABLE "FitoutRisk" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "riskNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "probability" INTEGER NOT NULL, "impact" INTEGER NOT NULL, "score" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "mitigationPlan" TEXT, "contingencyPlan" TEXT,
  "ownerId" TEXT, "dueDate" TIMESTAMP(3), "closedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitoutRisk_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FitoutChangeOrder" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "changeNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "reason" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "costType" TEXT NOT NULL DEFAULT 'ADDITION', "proposedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "approvedAmount" DECIMAL(18,2), "currency" TEXT NOT NULL DEFAULT 'VND',
  "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0, "requestedById" TEXT NOT NULL,
  "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "rejectedAt" TIMESTAMP(3), "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitoutChangeOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FitoutRisk_projectId_riskNumber_key" ON "FitoutRisk"("projectId", "riskNumber");
CREATE INDEX "FitoutRisk_projectId_status_idx" ON "FitoutRisk"("projectId", "status");
CREATE INDEX "FitoutRisk_projectId_score_idx" ON "FitoutRisk"("projectId", "score");
CREATE UNIQUE INDEX "FitoutChangeOrder_projectId_changeNumber_key" ON "FitoutChangeOrder"("projectId", "changeNumber");
CREATE INDEX "FitoutChangeOrder_projectId_status_idx" ON "FitoutChangeOrder"("projectId", "status");
ALTER TABLE "FitoutRisk" ADD CONSTRAINT "FitoutRisk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FitoutProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitoutRisk" ADD CONSTRAINT "FitoutRisk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FitoutRisk" ADD CONSTRAINT "FitoutRisk_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FitoutChangeOrder" ADD CONSTRAINT "FitoutChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FitoutProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitoutChangeOrder" ADD CONSTRAINT "FitoutChangeOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FitoutChangeOrder" ADD CONSTRAINT "FitoutChangeOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
