-- AlterTable
ALTER TABLE "PatrolCheck" ADD COLUMN     "distanceMeters" DOUBLE PRECISION,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationVerified" BOOLEAN,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "qrVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "severity" TEXT,
ADD COLUMN     "tooFast" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PatrolPoint" ADD COLUMN     "geofenceRadius" INTEGER,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "qrToken" TEXT NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 20),
ADD COLUMN     "requirePhoto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireQrScan" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PatrolPoint" ALTER COLUMN "qrToken" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PatrolShift" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "PatrolSchedule" (
    "id" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assigneeId" TEXT,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timesOfDay" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generateDaysAhead" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatrolSchedule_mallId_isActive_idx" ON "PatrolSchedule"("mallId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolPoint_qrToken_key" ON "PatrolPoint"("qrToken");

-- CreateIndex
CREATE INDEX "PatrolShift_scheduleId_scheduledAt_idx" ON "PatrolShift"("scheduleId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "PatrolRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolShift" ADD CONSTRAINT "PatrolShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PatrolSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
