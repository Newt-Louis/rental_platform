-- parking_transactions is LIST-partitioned by tenant_id. CONCURRENTLY is not supported on a
-- partitioned table, so these are plain CREATE INDEX on the parent: Postgres builds one index per
-- partition (and for future partitions). Takes a SHARE lock (blocks writes, not reads) while building.
-- Run MANUALLY in psql. Not applied by migrations. Safe to re-run.

DROP INDEX IF EXISTS idx_pt_tenant_checkout_fee;

CREATE INDEX IF NOT EXISTS idx_pt_tenant_checkout_fee_v2
  ON parking_transactions (tenant_id, check_out_time)
  INCLUDE (total_fee, promotion_amount, voucher_bill_amount, cash_amount, bank_transfer_amount, voucher_coupon_amount);

CREATE INDEX IF NOT EXISTS idx_pt_tenant_checkin
  ON parking_transactions (tenant_id, check_in_time);

CREATE INDEX IF NOT EXISTS idx_pt_tenant_checkout_null
  ON parking_transactions (tenant_id, check_out_time) WHERE check_out_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_pt_tenant_promo
  ON parking_transactions (tenant_id, check_out_time) WHERE promotion_used = 1;

CREATE INDEX IF NOT EXISTS idx_pt_tenant_lane_checkin
  ON parking_transactions (tenant_id, check_in_lane_id, check_in_time);

CREATE INDEX IF NOT EXISTS idx_pt_tenant_lane_checkout
  ON parking_transactions (tenant_id, check_out_lane_id, check_out_time);

CREATE INDEX IF NOT EXISTS idx_pt_vehicle_number
  ON parking_transactions (tenant_id, vehicle_number text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_pt_card_number
  ON parking_transactions (tenant_id, card_number text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_pt_invoice_no
  ON parking_transactions (tenant_id, invoice_no);

CREATE INDEX IF NOT EXISTS idx_pt_reservation_code
  ON parking_transactions (tenant_id, reservation_code);

CREATE INDEX IF NOT EXISTS idx_pt_invoice_status
  ON parking_transactions (tenant_id, invoice_status);

CREATE INDEX IF NOT EXISTS idx_pt_payment_status
  ON parking_transactions (tenant_id, online_payment_status);

CREATE INDEX IF NOT EXISTS idx_pt_voucher_bill
  ON parking_transactions (tenant_id, check_in_time) WHERE voucher_bill_amount > 0;

CREATE INDEX IF NOT EXISTS idx_pt_voucher_coupon
  ON parking_transactions (tenant_id, check_in_time) WHERE voucher_coupon_amount > 0;

CREATE INDEX IF NOT EXISTS idx_pt_voucher_type_name
  ON parking_transactions (voucher_type_name, check_in_time) WHERE voucher_type_name IS NOT NULL;
