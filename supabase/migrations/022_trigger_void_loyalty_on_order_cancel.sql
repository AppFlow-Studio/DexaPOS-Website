-- Trigger: automatically reverse loyalty earnings when order is voided or refunded
CREATE OR REPLACE FUNCTION trigger_void_loyalty_earnings()
RETURNS TRIGGER AS $$
BEGIN
  -- Trigger when status changes TO 'voided' or 'refunded' (from any other status)
  IF NEW.status IN ('voided', 'refunded') AND (OLD.status NOT IN ('voided', 'refunded')) THEN
    -- Call the loyalty RPC function to reverse earnings (ignore result, just execute)
    PERFORM loyalty_void_order_earnings(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS void_loyalty_on_cancel ON orders;

-- Create the trigger (only fires on status updates, not all updates)
CREATE TRIGGER void_loyalty_on_cancel
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_void_loyalty_earnings();
