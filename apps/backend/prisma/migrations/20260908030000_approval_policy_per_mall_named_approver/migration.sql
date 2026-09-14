-- Quy tac duyet Proposal: gan MALL + chi dinh DICH DANH nguoi duyet.
--
-- Truoc day ApprovalPolicyRule chi co approverRole va khong co mallId:
--   * buildApprovalStepsFromRules() tra ve {stepName, stepOrder, approverRole} -- khong co
--     approverId -- nen moi ApprovalStep sinh luc chay deu co approverId = null.
--   * mot bo nguong chiet khau duy nhat ap dung cho moi mall.
-- Gio moi quy tac thuoc dung mot mall va chi dinh dung mot tai khoan duyet.

-- ─────────────────────────────────────────────────────────────────────────────
-- Buoc 1: cap UserMallAccess cho cac role duyet chua co quyen mall nao.
-- LEASING_MANAGER / FINANCE / LEGAL / OPERATION deu duoc seed voi 0 dong
-- UserMallAccess, nen ho khong the duoc chon lam nguoi duyet (va thuc te dang
-- khong bam duyet duoc buoc nao: controller tra 403 "You do not have access to
-- this mall", danh sach cho duyet tra ve rong). Chi cap cho user dang hoat dong
-- va HOAN TOAN chua co quyen mall nao -- khong dung den user da duoc phan quyen.
INSERT INTO "UserMallAccess" ("id", "userId", "mallId", "role", "grantedById", "isActive", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || u.id || m.id), u.id, m.id, u.role,
       (SELECT a.id FROM "User" a WHERE a.role = 'ADMIN' AND a."isActive" ORDER BY a."createdAt" LIMIT 1),
       true, NOW(), NOW()
FROM "User" u
CROSS JOIN "Mall" m
WHERE u."isActive"
  AND u.role IN ('LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'OPERATION', 'CEO')
  AND m."isActive"
  AND NOT EXISTS (SELECT 1 FROM "UserMallAccess" x WHERE x."userId" = u.id AND x."isActive")
  AND EXISTS (SELECT 1 FROM "User" a WHERE a.role = 'ADMIN' AND a."isActive");

-- ─────────────────────────────────────────────────────────────────────────────
-- Buoc 2: them cot, tam thoi nullable de con chuyen du lieu cu.
ALTER TABLE "ApprovalPolicyRule" ADD COLUMN "mallId" TEXT;
ALTER TABLE "ApprovalPolicyRule" ADD COLUMN "approverId" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Buoc 3: nhan ban moi quy tac hien co ra tung mall dang hoat dong, va chi dinh
-- nguoi duyet = tai khoan hoat dong co dung role + quyen truy cap mall do
-- (uu tien nguoi khong phai ADMIN; ADMIN chi la phuong an cuoi de khong bo trong).
-- Ban goc giu lai cho mall dau tien, cac mall con lai duoc chen them.
WITH mall_list AS (
  SELECT id AS "mallId", row_number() OVER (ORDER BY "createdAt", id) AS rn
  FROM "Mall" WHERE "isActive"
),
pick AS (
  SELECT r.id AS "ruleId", m."mallId", m.rn,
         (SELECT u.id FROM "User" u
           WHERE u."isActive" AND u.role = r."approverRole"
             AND EXISTS (SELECT 1 FROM "UserMallAccess" ma
                          WHERE ma."userId" = u.id AND ma."mallId" = m."mallId" AND ma."isActive")
           ORDER BY u."createdAt" LIMIT 1) AS "approverId"
  FROM "ApprovalPolicyRule" r CROSS JOIN mall_list m
)
UPDATE "ApprovalPolicyRule" r
SET "mallId" = p."mallId",
    "approverId" = COALESCE(p."approverId",
      (SELECT a.id FROM "User" a WHERE a.role = 'ADMIN' AND a."isActive" ORDER BY a."createdAt" LIMIT 1))
FROM pick p
WHERE p."ruleId" = r.id AND p.rn = 1;

INSERT INTO "ApprovalPolicyRule" ("id", "code", "mallId", "name", "stepName", "stepOrder", "approverRole", "approverId", "conditionType", "operator", "threshold", "matchValue", "isRequired", "isActive", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || r.id || p."mallId"),
       r.code, p."mallId", r.name, r."stepName", r."stepOrder", r."approverRole",
       COALESCE(p."approverId", (SELECT a.id FROM "User" a WHERE a.role = 'ADMIN' AND a."isActive" ORDER BY a."createdAt" LIMIT 1)),
       r."conditionType", r.operator, r.threshold, r."matchValue", r."isRequired", r."isActive", NOW(), NOW()
FROM "ApprovalPolicyRule" r
JOIN (
  SELECT r2.id AS "ruleId", m."mallId", m.rn,
         (SELECT u.id FROM "User" u
           WHERE u."isActive" AND u.role = r2."approverRole"
             AND EXISTS (SELECT 1 FROM "UserMallAccess" ma
                          WHERE ma."userId" = u.id AND ma."mallId" = m."mallId" AND ma."isActive")
           ORDER BY u."createdAt" LIMIT 1) AS "approverId"
  FROM "ApprovalPolicyRule" r2
  CROSS JOIN (SELECT id AS "mallId", row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "Mall" WHERE "isActive") m
) p ON p."ruleId" = r.id AND p.rn > 1
WHERE r."mallId" IS NOT NULL;

-- Quy tac khong the gan mall (khong con mall hoat dong nao) thi khong the ton tai
-- duoi rang buoc moi -- xoa de khong chan viec siet NOT NULL. Proposal submit se bao
-- "Approval policy is not configured" cho den khi cau hinh lai, dung nhu hanh vi san co.
DELETE FROM "ApprovalPolicyRule" WHERE "mallId" IS NULL OR "approverId" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Buoc 4: siet rang buoc.
ALTER TABLE "ApprovalPolicyRule" ALTER COLUMN "mallId" SET NOT NULL;
ALTER TABLE "ApprovalPolicyRule" ALTER COLUMN "approverId" SET NOT NULL;

-- code chi con duy nhat trong pham vi mot mall (truoc day duy nhat toan he thong,
-- nen khong the co cung mot quy tac cho hai mall).
DROP INDEX IF EXISTS "ApprovalPolicyRule_code_key";
DROP INDEX IF EXISTS "ApprovalPolicyRule_isActive_stepOrder_idx";

CREATE UNIQUE INDEX "ApprovalPolicyRule_mallId_code_key" ON "ApprovalPolicyRule"("mallId", "code");
CREATE INDEX "ApprovalPolicyRule_mallId_isActive_stepOrder_idx" ON "ApprovalPolicyRule"("mallId", "isActive", "stepOrder");
CREATE INDEX "ApprovalPolicyRule_approverId_idx" ON "ApprovalPolicyRule"("approverId");

ALTER TABLE "ApprovalPolicyRule" ADD CONSTRAINT "ApprovalPolicyRule_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalPolicyRule" ADD CONSTRAINT "ApprovalPolicyRule_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
