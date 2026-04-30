-- =====================================================================
-- Patch: claim_order_v1 — drop payment_lock_* references
-- =====================================================================
-- The original claim_order_v1 referenced orders.payment_lock_station_id
-- and orders.payment_lock_expires_at, which don't exist on this DB.
-- The payment-lock feature predicted by phase6_sync_version.sql never
-- landed here. Remove the check so claim works; ORDER_LOCKED_FOR_PAYMENT
-- is now unreachable until those columns exist.
--
-- Re-evaluate when the payment-lock columns are added.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.claim_order_v1(
  p_order_id uuid,
  p_station_id uuid,
  p_expected_station_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_updated_count int;
  v_new_version int;
  v_current_station_id uuid;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status IN ('void', 'cancelled', 'completed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ORDER_FINALIZED',
      'status', v_order.status
    );
  END IF;

  -- Payment-lock guard removed: orders.payment_lock_station_id / _expires_at
  -- are not present on this DB. Re-introduce when those columns exist.

  IF v_order.station_id IS NOT DISTINCT FROM p_station_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'new_station_id', p_station_id,
      'sync_version', COALESCE(v_order.sync_version, 0)
    );
  END IF;

  UPDATE public.orders
  SET station_id = p_station_id,
      sync_version = COALESCE(sync_version, 0) + 1,
      updated_at = now()
  WHERE id = p_order_id
    AND station_id IS NOT DISTINCT FROM p_expected_station_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    SELECT station_id INTO v_current_station_id
    FROM public.orders
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'CONCURRENT_CLAIM',
      'current_station_id', v_current_station_id
    );
  END IF;

  SELECT sync_version INTO v_new_version
  FROM public.orders
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_station_id', p_station_id,
    'sync_version', v_new_version
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_order_v1(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_order_v1(uuid, uuid, uuid) IS
'Lever 2 — atomic optimistic-concurrency transfer of orders.station_id. Returns typed errors (ORDER_NOT_FOUND, ORDER_FINALIZED, CONCURRENT_CLAIM). Used by the cross-station Take Over UX. Payment-lock guard temporarily disabled — re-add when orders.payment_lock_* columns land.';;
