-- Cap duyet ho so fitout: khai bao rieng cho tung mall, moi cap gan dung mot tai khoan.
-- Thay cho FitoutFormType.approvalLevels + approverRoles: approverRoles chi duoc seed mot lan
-- boi migration 20260702110000 va khong co duong ghi nao tu API/UI (FitoutFormTypeService.upsert
-- khong liet ke truong nay), nen loai ho so tao moi qua API luon roi ve fallback OPERATION,
-- va man hinh fitout/settings chi hien so cap chu khong hien ai duyet.

-- CreateTable
CREATE TABLE "FitoutFormApprovalLevel" (
    "id" TEXT NOT NULL,
    "formTypeId" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "approverRole" "Role" NOT NULL,
    "approverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitoutFormApprovalLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FitoutFormApprovalLevel_mallId_formTypeId_idx" ON "FitoutFormApprovalLevel"("mallId", "formTypeId");

-- CreateIndex
CREATE INDEX "FitoutFormApprovalLevel_approverId_idx" ON "FitoutFormApprovalLevel"("approverId");

-- CreateIndex
CREATE UNIQUE INDEX "FitoutFormApprovalLevel_formTypeId_mallId_level_key" ON "FitoutFormApprovalLevel"("formTypeId", "mallId", "level");

-- AddForeignKey
ALTER TABLE "FitoutFormApprovalLevel" ADD CONSTRAINT "FitoutFormApprovalLevel_formTypeId_fkey" FOREIGN KEY ("formTypeId") REFERENCES "FitoutFormType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutFormApprovalLevel" ADD CONSTRAINT "FitoutFormApprovalLevel_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitoutFormApprovalLevel" ADD CONSTRAINT "FitoutFormApprovalLevel_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chuyen chuoi role cu (approverRoles) sang tai khoan cu the, theo tung mall.
-- Chi chuyen khi MOI cap cua chuoi deu resolve ra DUNG MOT ung vien hop le tai mall do
-- (con hoat dong, dung role, va -- tru ADMIN -- co quyen truy cap mall). Chuoi nao con mo ho
-- se de trong: hon la sinh ra chuoi duyet thieu cap ma khong ai bam duyet duoc.
WITH chain AS (
  SELECT ft.id AS "formTypeId", ft.name AS "formTypeName",
         r.ord AS level, r.role::"Role" AS "approverRole"
  FROM "FitoutFormType" ft
  CROSS JOIN LATERAL jsonb_array_elements_text(ft."approverRoles") WITH ORDINALITY AS r(role, ord)
  WHERE ft."approverRoles" IS NOT NULL AND jsonb_array_length(ft."approverRoles") > 0
),
candidate AS (
  SELECT c."formTypeId", c."formTypeName", c.level, c."approverRole", m.id AS "mallId",
         (SELECT array_agg(u.id) FROM "User" u
           WHERE u."isActive" AND u.role = c."approverRole"
             AND (u.role = 'ADMIN' OR EXISTS (
               SELECT 1 FROM "UserMallAccess" ma
                WHERE ma."userId" = u.id AND ma."mallId" = m.id AND ma."isActive"))
         ) AS approvers
  FROM chain c CROSS JOIN "Mall" m
  WHERE m."isActive"
),
resolvable AS (
  SELECT "formTypeId", "mallId"
  FROM candidate
  GROUP BY "formTypeId", "mallId"
  HAVING bool_and(approvers IS NOT NULL AND array_length(approvers, 1) = 1)
)
INSERT INTO "FitoutFormApprovalLevel" ("id", "formTypeId", "mallId", "level", "stepName", "approverRole", "approverId", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), c."formTypeId", c."mallId", c.level,
       c."formTypeName" || ' - Cap ' || c.level, c."approverRole", c.approvers[1], NOW(), NOW()
FROM candidate c
JOIN resolvable r ON r."formTypeId" = c."formTypeId" AND r."mallId" = c."mallId";

-- AlterTable
ALTER TABLE "FitoutFormType" DROP COLUMN "approvalLevels",
DROP COLUMN "approverRoles";
