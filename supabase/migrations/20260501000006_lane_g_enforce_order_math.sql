-- Lane G4: enforce_order_math — deferred constraint trigger.
--
-- Invariants the trigger asserts on every committed orders row:
--   1. amount_paid >= -$0.01  (rounding tolerance; clearly negative is a bug)
--   2. amount_due  >= -$0.01
--   3. payment_status='paid'    implies amount_paid > 0 AND amount_due <= $0.01
--   4. payment_status='pending' implies amount_paid <= $0.01
--
-- Why DEFERRABLE INITIALLY DEFERRED:
--   process_payment_v8, void_payment, complete_reversal, etc. update the
--   orders row multiple times within one transaction. Intermediate states
--   may temporarily violate the invariants. A row-level AFTER trigger would
--   block legitimate flows. A constraint trigger fires at the end of the
--   transaction (or at the SET CONSTRAINTS IMMEDIATE point), so only the
--   committed final state must satisfy the invariants.
--
-- Why INSERT OR UPDATE:
--   New orders also get vetted, so a freshly-inserted row with bad math
--   never reaches durable state.
--
-- DEPLOYMENT ORDER:
--   This migration MUST come after Section C of
--   supabase/validation/049_lane_g_orphan_diagnostics.sql has been COMMITted
--   on the target env. If pre-existing orphans remain, this migration still
--   succeeds (the trigger only fires on subsequent INSERT/UPDATE), but the
--   first time those rows are touched they will raise P0005 and block the
--   transaction. Clean first, then ship.

CREATE OR REPLACE FUNCTION public.enforce_order_math()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_amount_paid numeric := COALESCE(NEW.amount_paid, 0);
  v_amount_due  numeric := COALESCE(NEW.amount_due, 0);
  v_status      text    := NEW.payment_status::text;
BEGIN
  IF v_amount_paid < -0.01 THEN
    RAISE EXCEPTION 'enforce_order_math: order % has negative amount_paid (%)',
      NEW.id, v_amount_paid
      USING ERRCODE = 'P0005';
  END IF;

  IF v_amount_due < -0.01 THEN
    RAISE EXCEPTION 'enforce_order_math: order % has negative amount_due (%)',
      NEW.id, v_amount_due
      USING ERRCODE = 'P0005';
  END IF;

  IF v_status = 'paid' THEN
    IF v_amount_paid <= 0.01 THEN
      RAISE EXCEPTION
        'enforce_order_math: order % is payment_status=paid but amount_paid=%',
        NEW.id, v_amount_paid
        USING ERRCODE = 'P0005',
              HINT    = 'Reset payment_status to ''pending'' or record the missing payment row.';
    END IF;
    IF v_amount_due > 0.01 THEN
      RAISE EXCEPTION
        'enforce_order_math: order % is payment_status=paid but amount_due=%',
        NEW.id, v_amount_due
        USING ERRCODE = 'P0005',
              HINT    = 'Call update_order_payment_status_after_refund(order_id) to recompute.';
    END IF;
  END IF;

  IF v_status = 'pending' AND v_amount_paid > 0.01 THEN
    RAISE EXCEPTION
      'enforce_order_math: order % is payment_status=pending but amount_paid=%',
      NEW.id, v_amount_paid
      USING ERRCODE = 'P0005',
            HINT    = 'Set payment_status to ''partial'' or ''paid'' to match amount_paid.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_order_math() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_order_math ON public.orders;

CREATE CONSTRAINT TRIGGER enforce_order_math
  AFTER INSERT OR UPDATE ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_math();

COMMENT ON FUNCTION public.enforce_order_math() IS
  'G4: asserts orders.amount_paid/amount_due/payment_status invariants. Fires as a deferred constraint trigger so multi-step transactions can temporarily violate intermediate states. Raises P0005 on any final-state violation.';
