-- Trigger: automatically call loyalty_earn_on_order when order is completed
CREATE OR REPLACE FUNCTION trigger_earn_on_order_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Call the loyalty RPC function (ignore result, just execute)
    PERFORM loyalty_earn_on_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS earn_loyalty_on_completion ON orders;

-- Create the trigger (only fires on status updates, not all updates)
CREATE TRIGGER earn_loyalty_on_completion
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_earn_on_order_completion();
