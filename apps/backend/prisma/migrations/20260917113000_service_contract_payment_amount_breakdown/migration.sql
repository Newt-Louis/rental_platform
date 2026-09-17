-- The nullable JSON source preserves legacy scalar payment rows exactly as
-- they are. New recurring rows and adjusted rows store their components here.
ALTER TABLE "ServiceContractPayment"
  ADD COLUMN "amountBreakdown" JSONB;

CREATE OR REPLACE FUNCTION sync_service_contract_payment_amount_breakdown()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  computed_total DOUBLE PRECISION;
BEGIN
  IF NEW."amountBreakdown" IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW."amountBreakdown") <> 'array' THEN
    RAISE EXCEPTION 'amountBreakdown must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW."amountBreakdown") AS element(value)
    WHERE jsonb_typeof(value) <> 'number'
  ) THEN
    RAISE EXCEPTION 'amountBreakdown must contain only JSON numbers';
  END IF;

  SELECT COALESCE(SUM((value #>> '{}')::DOUBLE PRECISION), 0)
  INTO computed_total
  FROM jsonb_array_elements(NEW."amountBreakdown") AS element(value);

  NEW.amount := computed_total;
  NEW."totalAmount" := computed_total;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_contract_payment_amount_breakdown_sync
BEFORE INSERT OR UPDATE OF "amountBreakdown"
ON "ServiceContractPayment"
FOR EACH ROW
EXECUTE FUNCTION sync_service_contract_payment_amount_breakdown();
