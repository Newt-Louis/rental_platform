-- CreateTable
CREATE TABLE "ModulePermission" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModulePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModulePermission_module_idx" ON "ModulePermission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "ModulePermission_module_role_key" ON "ModulePermission"("module", "role");

-- RenameIndex
ALTER INDEX "CategoryMallPricing_scope_currency_effectiveFrom_key" RENAME TO "CategoryMallPricing_mallId_categoryId_floorId_zoneId_curren_key";
