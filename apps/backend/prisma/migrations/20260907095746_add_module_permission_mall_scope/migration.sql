-- AlterTable
ALTER TABLE "ModulePermission" ADD COLUMN "mallId" TEXT NOT NULL DEFAULT 'GLOBAL';

-- DropIndex
DROP INDEX "ModulePermission_module_idx";
DROP INDEX "ModulePermission_module_role_key";

-- CreateIndex
CREATE INDEX "ModulePermission_module_mallId_idx" ON "ModulePermission"("module", "mallId");

-- CreateIndex
CREATE UNIQUE INDEX "ModulePermission_module_role_mallId_key" ON "ModulePermission"("module", "role", "mallId");
