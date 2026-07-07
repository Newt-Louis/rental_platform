-- CreateTable
CREATE TABLE "FitoutDailyReportEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "contractorId" TEXT,
    "workforceCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "areaTag" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitoutDailyReportEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitoutTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "revisedStart" TIMESTAMP(3),
    "revisedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assignedContractorId" TEXT,
    "dependsOnTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitoutTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FitoutDailyReportEntry_projectId_reportDate_idx" ON "FitoutDailyReportEntry"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "FitoutTask_projectId_sortOrder_idx" ON "FitoutTask"("projectId", "sortOrder");

-- AddForeignKey
ALTER TABLE "FitoutDailyReportEntry" ADD CONSTRAINT "FitoutDailyReportEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FitoutProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutDailyReportEntry" ADD CONSTRAINT "FitoutDailyReportEntry_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "FitoutContractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutDailyReportEntry" ADD CONSTRAINT "FitoutDailyReportEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutTask" ADD CONSTRAINT "FitoutTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FitoutProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutTask" ADD CONSTRAINT "FitoutTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "FitoutTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutTask" ADD CONSTRAINT "FitoutTask_assignedContractorId_fkey" FOREIGN KEY ("assignedContractorId") REFERENCES "FitoutContractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutTask" ADD CONSTRAINT "FitoutTask_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "FitoutTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
