-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeMallId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeMallId_fkey" FOREIGN KEY ("activeMallId") REFERENCES "Mall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
