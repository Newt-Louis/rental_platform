-- Job execution ledger (docs/reliability/OBSERVABILITY.md).
-- Hand-written rather than `prisma migrate dev`-generated: the auto-diff
-- against the current database also picked up unrelated, pre-existing drift
-- between schema.prisma and the already-applied migration history (FK
-- drop/recreate on Invoice/Payment, a few index renames) that has nothing to
-- do with this change. This migration contains only the new table.

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobExecution_jobName_startedAt_idx" ON "JobExecution"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "JobExecution_jobName_status_startedAt_idx" ON "JobExecution"("jobName", "status", "startedAt");
