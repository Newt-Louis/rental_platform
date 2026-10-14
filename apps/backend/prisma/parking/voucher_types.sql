-- Run manually on the PARKING database (not part of the main Prisma migrations).
CREATE TABLE IF NOT EXISTS voucher_types (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER      NOT NULL REFERENCES tenants (tenant_id),
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_voucher_types_tenant_name UNIQUE (tenant_id, name)
);
