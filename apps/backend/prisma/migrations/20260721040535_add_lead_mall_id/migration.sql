-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "mallId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_mallId_idx" ON "Lead"("mallId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
