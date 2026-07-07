-- Fitout Phase 1: enum -> config table
-- Chuyển FitoutStatus/FitoutDocumentType từ Postgres enum sang String (FK theo "code"),
-- để pipeline/loại tài liệu trở thành dữ liệu cấu hình được thay vì hard-code.
-- Toàn bộ giá trị dữ liệu hiện có được giữ nguyên qua "::text" cast (không mất dữ liệu).

-- ── New config tables ──────────────────────────────────────────────────────

CREATE TABLE "FitoutStageConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phaseGroup" TEXT NOT NULL,
    "roleColumn" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "meetingRequired" BOOLEAN NOT NULL DEFAULT false,
    "triggersUnitStatus" TEXT,
    "setsField" TEXT,
    "colorHex" TEXT NOT NULL DEFAULT '#6b7280',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitoutStageConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FitoutStageConfig_code_key" ON "FitoutStageConfig"("code");
CREATE INDEX "FitoutStageConfig_isActive_order_idx" ON "FitoutStageConfig"("isActive", "order");

CREATE TABLE "FitoutFormType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "defaultStageCode" TEXT,
    "approvalLevels" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitoutFormType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FitoutFormType_code_key" ON "FitoutFormType"("code");
CREATE INDEX "FitoutFormType_isActive_order_idx" ON "FitoutFormType"("isActive", "order");

-- ── Seed config rows using the exact legacy enum values as "code" ─────────
-- (giữ nguyên order/màu tương ứng UI cũ FitoutPage.tsx STATUS_STEPS/STATUS_COLOR)

INSERT INTO "FitoutStageConfig"
  ("id", "code", "name", "phaseGroup", "roleColumn", "order", "meetingRequired", "triggersUnitStatus", "setsField", "colorHex", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CONTRACT_SIGNED',     'Ký hợp đồng',        'GD1_KHOI_DAU',           'COORDINATOR', 1, true,  NULL,             NULL,             '#6b7280', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SUBMIT_DESIGN',       'Nộp thiết kế',       'GD2_THIET_KE_CO_SO',     'TENANT',      2, false, NULL,             NULL,             '#3b82f6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DESIGN_REVIEW',       'Duyệt thiết kế',     'GD2_THIET_KE_CO_SO',     'COORDINATOR', 3, false, NULL,             NULL,             '#6b7280', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FIRE_SAFETY_REVIEW',  'PCCC',               'GD3_THIET_KE_CHI_TIET',  'COORDINATOR', 4, false, NULL,             NULL,             '#ef4444', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CONSTRUCTION_PERMIT', 'Giấy phép xây dựng', 'GD4_RA_VAO_CONG_TRUONG', 'COORDINATOR', 5, true,  NULL,             NULL,             '#eab308', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FITOUT_IN_PROGRESS',  'Thi công',           'GD5_QUA_TRINH_THI_CONG', 'TENANT',      6, false, 'UNDER_FITOUT',   'startDate',      '#f97316', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'INSPECTION',          'Kiểm tra',           'GD5_QUA_TRINH_THI_CONG', 'COORDINATOR', 7, false, NULL,             NULL,             '#a855f7', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'APPROVED_TO_OPEN',    'Chấp thuận mở cửa',  'GD6_HOAN_TAT',           'COORDINATOR', 8, false, NULL,             NULL,             '#14b8a6', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OPENED',              'Khai trương',        'GD6_HOAN_TAT',           'TENANT',      9, false, 'OCCUPIED',       'actualOpenDate', '#22c55e', CURRENT_TIMESTAMP);

INSERT INTO "FitoutFormType"
  ("id", "code", "name", "category", "defaultStageCode", "approvalLevels", "order", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'DESIGN_DRAWING',    'Bản vẽ thiết kế',            'DESIGN',     'SUBMIT_DESIGN',       1, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MEP_DRAWING',       'Bản vẽ MEP',                 'DESIGN',     'SUBMIT_DESIGN',       1, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FIRE_SAFETY_CERT',  'Chứng nhận PCCC',            'SAFETY',     'FIRE_SAFETY_REVIEW',  1, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PCCC_APPROVAL',     'Phê duyệt PCCC',             'SAFETY',     'FIRE_SAFETY_REVIEW',  1, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CONSTRUCTION_PERMIT','Giấy phép xây dựng',        'PERMIT',     'CONSTRUCTION_PERMIT', 1, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'INSURANCE_CERT',    'Chứng nhận bảo hiểm',        'PERMIT',     'CONSTRUCTION_PERMIT', 1, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'INSPECTION_REPORT', 'Báo cáo nghiệm thu',         'INSPECTION', 'INSPECTION',          1, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'HANDOVER_FORM',     'Biên bản bàn giao',          'HANDOVER',   'APPROVED_TO_OPEN',    1, 8, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OTHER',             'Khác',                      'OTHER',      NULL,                  1, 9, CURRENT_TIMESTAMP);

-- ── Convert enum-typed columns to text (data-preserving cast) ─────────────

ALTER TABLE "FitoutProject" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "FitoutProject" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "FitoutProject" ALTER COLUMN "status" SET DEFAULT 'CONTRACT_SIGNED';

ALTER TABLE "FitoutDocument" ALTER COLUMN "documentType" TYPE TEXT USING "documentType"::TEXT;
ALTER TABLE "FitoutDocument" ALTER COLUMN "requiredFor" TYPE TEXT USING "requiredFor"::TEXT;

ALTER TABLE "FitoutDocumentGate" ALTER COLUMN "stage" TYPE TEXT USING "stage"::TEXT;
ALTER TABLE "FitoutDocumentGate" ALTER COLUMN "documentType" TYPE TEXT USING "documentType"::TEXT;

ALTER TABLE "FitoutSlaPolicy" ALTER COLUMN "stage" TYPE TEXT USING "stage"::TEXT;

ALTER TABLE "FitoutMilestone" ALTER COLUMN "stage" TYPE TEXT USING "stage"::TEXT;

-- ── Drop now-unused enum types ─────────────────────────────────────────────

DROP TYPE "FitoutStatus";
DROP TYPE "FitoutDocumentType";
