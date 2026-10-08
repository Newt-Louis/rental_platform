-- Phan quyen Xem/Tao/Sua/Xoa: `allowed` van la quyen XEM; 3 cot moi mac dinh TRUE de hanh vi cu khong doi.
ALTER TABLE "ModulePermission"
  ADD COLUMN "canCreate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canUpdate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canDelete" BOOLEAN NOT NULL DEFAULT true;

-- Ghi de theo tung nguoi dung (NULL = ke thua tu vai tro).
CREATE TABLE "UserModulePermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "mallId" TEXT NOT NULL DEFAULT 'GLOBAL',
  "canView" BOOLEAN,
  "canCreate" BOOLEAN,
  "canUpdate" BOOLEAN,
  "canDelete" BOOLEAN,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserModulePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserModulePermission_userId_module_mallId_key" ON "UserModulePermission"("userId", "module", "mallId");
CREATE INDEX "UserModulePermission_userId_mallId_idx" ON "UserModulePermission"("userId", "mallId");

ALTER TABLE "UserModulePermission"
  ADD CONSTRAINT "UserModulePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
