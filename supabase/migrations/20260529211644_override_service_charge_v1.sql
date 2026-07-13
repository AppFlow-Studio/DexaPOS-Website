CREATE OR REPLACE FUNCTION public.override_service_charge_v1(
    p_order_id        uuid,
    p_amount          numeric,
    p_manager_id      uuid,
    p_reason          text DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL,
    p_station_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached jsonb;
    v_order record;
    v_post_order record;
    v_old_sc numeric;
    v_payment_exists boolean;
    v_result jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'override_service_charge_v1');
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'override_service_charge_v1: p_amount must be >= 0 (got %)', p_amount;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;

    PERFORM public._assert_order_station_match(p_order_id, p_station_id);

    v_old_sc := COALESCE(v_order.service_charge, 0);

    SELECT EXISTS (
        SELECT 1 FROM public.order_payments
        WHERE order_id = p_order_id
          AND is_voided = false
          AND status IN ('captured', 'partially_refunded', 'refunded')
    ) INTO v_payment_exists;

    IF v_payment_exists THEN
        RAISE EXCEPTION 'cannot override service charge: order has non-voided payments (void or refund them first)'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.orders
    SET service_charge = p_amount,
        service_charge_is_manual = true,
        updated_at = now()
    WHERE id = p_order_id;

    PERFORM public.calculate_order_totals_fast(p_order_id);

    SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

    v_result := jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'manager_id', p_manager_id,
        'reason', p_reason,
        'old_service_charge', v_old_sc,
        'new_service_charge', p_amount,
        'service_charge_is_manual', true,
        'card_subtotal', v_post_order.card_subtotal,
        'cash_subtotal', v_post_order.cash_subtotal,
        'card_total', v_post_order.card_total,
        'cash_total', v_post_order.cash_total,
        'total_amount', v_post_order.total_amount,
        'amount_due', v_post_order.amount_due,
        'cash_amount_due', v_post_order.cash_amount_due,
        'sync_version', v_post_order.sync_version
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(
            p_idempotency_key, 'override_service_charge_v1', v_result
        );
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.override_service_charge_v1(
    uuid, numeric, uuid, text, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.override_service_charge_v1 IS
  'Wave D — manager-PIN EDIT / REMOVE service charge. Sets orders.service_charge = p_amount, flips service_charge_is_manual = true (which apply_service_charge_v1 short-circuits on), recomputes canonical totals via calculate_order_totals_fast. Refuses when non-voided captured/partially_refunded/refunded payments exist on the order. Pass p_amount = 0 for REMOVE, p_amount > 0 for EDIT. Idempotency op: ''override_service_charge_v1''.';;
