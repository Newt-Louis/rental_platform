CREATE TYPE "InventoryItemType" AS ENUM ('VTTH', 'CCDC', 'EQUIPMENT');
CREATE TYPE "InventoryTransactionType" AS ENUM ('IN', 'OUT', 'RETURN', 'ADJUST');

CREATE TABLE "InventoryCategory" (
  "id" TEXT NOT NULL, "mallId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "itemType" "InventoryItemType" NOT NULL, "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL, "mallId" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL, "itemType" "InventoryItemType" NOT NULL, "unit" TEXT NOT NULL,
  "specification" TEXT, "manufacturer" TEXT, "location" TEXT, "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0, "averageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryTransaction" (
  "id" TEXT NOT NULL, "transactionNo" TEXT NOT NULL, "mallId" TEXT NOT NULL, "itemId" TEXT NOT NULL,
  "type" "InventoryTransactionType" NOT NULL, "quantity" DOUBLE PRECISION NOT NULL, "unitCost" DOUBLE PRECISION,
  "stockBefore" DOUBLE PRECISION NOT NULL, "stockAfter" DOUBLE PRECISION NOT NULL,
  "transactionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "supplier" TEXT, "recipient" TEXT,
  "department" TEXT, "referenceNo" TEXT, "purpose" TEXT, "notes" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryCategory_mallId_code_key" ON "InventoryCategory"("mallId", "code");
CREATE INDEX "InventoryCategory_mallId_itemType_isActive_idx" ON "InventoryCategory"("mallId", "itemType", "isActive");
CREATE UNIQUE INDEX "InventoryItem_mallId_sku_key" ON "InventoryItem"("mallId", "sku");
CREATE INDEX "InventoryItem_mallId_itemType_isActive_idx" ON "InventoryItem"("mallId", "itemType", "isActive");
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");
CREATE UNIQUE INDEX "InventoryTransaction_transactionNo_key" ON "InventoryTransaction"("transactionNo");
CREATE INDEX "InventoryTransaction_mallId_transactionAt_idx" ON "InventoryTransaction"("mallId", "transactionAt");
CREATE INDEX "InventoryTransaction_itemId_transactionAt_idx" ON "InventoryTransaction"("itemId", "transactionAt");
CREATE INDEX "InventoryTransaction_type_idx" ON "InventoryTransaction"("type");
ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
