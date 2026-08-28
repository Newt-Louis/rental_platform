-- Keep the already-applied additive migration intact and rename the physical
-- table to follow the repository's capitalized Prisma table naming convention.
ALTER TABLE "departments" RENAME TO "Departments";

-- Rename database objects as well so schema inspection no longer exposes the
-- obsolete lowercase table name. Renaming the primary-key constraint also
-- renames its backing index in PostgreSQL.
ALTER TABLE "Departments" RENAME CONSTRAINT "departments_pkey" TO "Departments_pkey";
ALTER TABLE "Departments" RENAME CONSTRAINT "departments_mallId_fkey" TO "Departments_mallId_fkey";
ALTER TABLE "Departments" RENAME CONSTRAINT "departments_parentId_fkey" TO "Departments_parentId_fkey";
ALTER INDEX "departments_mallId_name_idx" RENAME TO "Departments_mallId_name_idx";
ALTER INDEX "departments_parentId_idx" RENAME TO "Departments_parentId_idx";
