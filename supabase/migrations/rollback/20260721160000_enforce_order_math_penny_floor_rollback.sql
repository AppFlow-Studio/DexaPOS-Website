-- Rollback of 20260721160000_enforce_order_math_penny_floor.sql
-- Restores the Lane G4 `<= 0.01` paid floor.
-- WARNING: after this rollback, legitimate $0.01 orders will again fail with
-- P0005 ("payment_status=paid but amount_paid=0.01"). Body-only revert; the
-- deferred constraint trigger binding is untouched.

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
COMMENT ON FUNCTION public.enforce_order_math() IS
  'G4: asserts orders.amount_paid/amount_due/payment_status invariants. Fires as a deferred constraint trigger so multi-step transactions can temporarily violate intermediate states. Raises P0005 on any final-state violation.';
