-- ============================================================================
-- Parking dashboard performance indexes.
--
-- Targets the partitioned parent table `parking_transaction` (PARTITION BY
-- RANGE (check_in_time), monthly). Postgres 11+ propagates
-- CREATE INDEX CONCURRENTLY on a partitioned parent to every existing
-- partition automatically (built one partition at a time; the parent index
-- becomes valid only once every partition's index is valid).
--
-- Idempotent: safe to re-run. Each statement runs individually, outside a
-- transaction (CONCURRENTLY cannot run inside one) — see
-- run-parking-dashboard-indexes.ts.
-- ============================================================================

-- Revenue / KPI sums (SUM(total_fee), promotion_amount, voucher_bill_amount)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_tenant_checkout_fee
  ON parking_transaction (tenant_id, check_out_time)
  INCLUDE (total_fee, promotion_amount, voucher_bill_amount);

-- Primary time-range filter field for the dashboard (check_in_time) + inflow chart
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_tenant_checkin
  ON parking_transaction (tenant_id, check_in_time);

-- Active Occupancy KPI: COUNT(*) WHERE check_out_time IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_tenant_checkout_null
  ON parking_transaction (tenant_id, check_out_time)
  WHERE check_out_time IS NULL;

-- Promotion utilization chart
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_tenant_promo
  ON parking_transaction (tenant_id, check_out_time)
  WHERE promotion_used = true;

-- Lane filter + inflow/outflow-by-lane charts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_tenant_lane_checkin
  ON parking_transaction (tenant_id, check_in_lane_id, check_in_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_tenant_lane_checkout
  ON parking_transaction (tenant_id, check_out_lane_id, check_out_time);

-- Transaction page quick search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_vehicle_number
  ON parking_transaction (tenant_id, vehicle_number text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_card_number
  ON parking_transaction (tenant_id, card_number text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_invoice_no
  ON parking_transaction (tenant_id, invoice_no);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_reservation_code
  ON parking_transaction (tenant_id, reservation_code);

-- Filter-drawer categorical filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_invoice_status
  ON parking_transaction (tenant_id, invoice_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_payment_status
  ON parking_transaction (tenant_id, online_payment_status);

-- Keyset pagination sort key: WHERE (check_in_time, parking_session_id) < (:cursor)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_keyset
  ON parking_transaction (tenant_id, check_in_time DESC, parking_session_id DESC);
