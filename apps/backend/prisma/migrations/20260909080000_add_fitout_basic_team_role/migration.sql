-- Additive role for the Mall-scoped basic-construction Fitout team.
-- It receives no module permission implicitly; action grants are added separately.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FITOUT_BASIC_TEAM';
