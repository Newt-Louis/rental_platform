ALTER TABLE "MaintenanceSchedule"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "checklist" JSONB;

CREATE TABLE "MaintenanceExecution" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "performedById" TEXT,
  "notes" TEXT,
  "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "checklistResult" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceSchedule_assignedToId_nextDueDate_idx" ON "MaintenanceSchedule"("assignedToId", "nextDueDate");
CREATE UNIQUE INDEX "MaintenanceExecution_scheduleId_dueDate_key" ON "MaintenanceExecution"("scheduleId", "dueDate");
CREATE INDEX "MaintenanceExecution_status_dueDate_idx" ON "MaintenanceExecution"("status", "dueDate");
CREATE INDEX "MaintenanceExecution_performedById_idx" ON "MaintenanceExecution"("performedById");

ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceExecution" ADD CONSTRAINT "MaintenanceExecution_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceExecution" ADD CONSTRAINT "MaintenanceExecution_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "MaintenanceExecution" ("id", "scheduleId", "dueDate", "status", "createdAt", "updatedAt")
SELECT 'maint_exec_' || md5("id" || "nextDueDate"::text), "id", "nextDueDate", 'PLANNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MaintenanceSchedule";
