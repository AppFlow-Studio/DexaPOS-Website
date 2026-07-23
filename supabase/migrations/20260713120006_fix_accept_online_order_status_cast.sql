-- ============================================================================
-- Fix: auto-accept for online orders was silently failing.
--
-- Symptom: with online_store_config.auto_accept_orders = true, storefront orders
-- stayed in `pending` and still required manual acceptance from the POS.
--
-- Cause: the create-online-order edge function intentionally creates the order as
-- `pending` (so the kitchen isn't fired before payment succeeds), then calls
-- accept_online_order() once payment clears. The live accept_online_order() was
-- raising:
--
--   42804: column "to_status" is of type order_status but expression is of type text
--
-- ...on the order_status_history INSERT. The edge function logs that failure and
-- continues, so the order was left sitting in `pending` — exactly the reported
-- behaviour. Auto-accept never actually took effect.
--
-- Fix: redefine accept_online_order() with explicit ::order_status casts on every
-- status expression so the enum assignment can never fall back to text. Behaviour
-- is otherwise unchanged (pending -> sent_to_kitchen, fire items, audit row).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_online_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  -- Lock the row to prevent race conditions (e.g. auto-accept vs. a manual accept).
  SELECT id, status, location_id, merchant_id
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending'::public.order_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status::text || ')'
    );
  END IF;

  -- Transition: pending -> sent_to_kitchen (keep accepted_at for audit).
  -- Going straight to sent_to_kitchen keeps the order visible to POS active-order
  -- fetches and lets the KDS bump auto-advance it.
  UPDATE public.orders
     SET status             = 'sent_to_kitchen'::public.order_status,
         accepted_at        = v_now,
         sent_to_kitchen_at = v_now,
         updated_at         = v_now
   WHERE id = p_order_id;

  -- Fire all not-yet-sent items to the kitchen.
  UPDATE public.order_items
     SET kitchen_status     = 'sent',
         sent_to_kitchen_at = v_now
   WHERE order_id = p_order_id
     AND (kitchen_status IS NULL OR kitchen_status = 'pending');

  -- Audit trail. Explicit casts: to_status/from_status are order_status enums, and
  -- an untyped text expression here is what was raising 42804.
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (
      p_order_id,
      'pending'::public.order_status,
      'sent_to_kitchen'::public.order_status,
      v_now,
      'Accepted (online order)'
    );

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'accepted_at', v_now
  );
END;
$function$;
