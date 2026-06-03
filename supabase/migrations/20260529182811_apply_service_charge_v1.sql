CREATE OR REPLACE FUNCTION public.apply_service_charge_v1(
    p_order_id        uuid,
    p_party_size      integer DEFAULT NULL,
    p_idempotency_key uuid    DEFAULT NULL,
    p_station_id      uuid    DEFAULT NULL
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
    v_rule  record;

    v_party_size integer;

    v_gross_card_subtotal numeric := 0;
    v_gross_cash_subtotal numeric := 0;
    v_net_card_subtotal   numeric := 0;
    v_net_cash_subtotal   numeric := 0;

    v_sc_base    numeric := 0;
    v_old_sc     numeric := 0;
    v_new_sc     numeric := 0;

    v_rule_id_snap     uuid;
    v_rate_snap        numeric;
    v_applies_on_snap  text;
    v_name_snap        text;

    v_eligible boolean := false;
    v_result   jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'apply_service_charge_v1');
        IF v_cached IS NOT NULL THEN
            RETURN v_cached;
        END IF;
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

    v_old_sc := COALESCE(v_order.service_charge, 0);

    IF v_order.service_charge_is_manual = true THEN
        PERFORM public.calculate_order_totals_fast(p_order_id);

        SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

        v_result := jsonb_build_object(
            'success', true,
            'skipped', 'manual_override',
            'service_charge', v_old_sc,
            'service_charge_rule_id', v_order.service_charge_rule_id,
            'service_charge_rate', v_order.service_charge_rate,
            'service_charge_applies_on', v_order.service_charge_applies_on,
            'service_charge_name', v_order.service_charge_name,
            'card_subtotal', v_post_order.card_subtotal,
            'cash_subtotal', v_post_order.cash_subtotal,
            'card_total', v_post_order.card_total,
            'cash_total', v_post_order.cash_total,
            'total_amount', v_post_order.total_amount,
            'amount_due', v_post_order.amount_due,
            'cash_amount_due', v_post_order.cash_amount_due,
            'sync_version', v_post_order.sync_version,
            'eligible', false,
            'old_service_charge', v_old_sc
        );

        IF p_idempotency_key IS NOT NULL THEN
            PERFORM public._idempotency_complete(
                p_idempotency_key, 'apply_service_charge_v1', v_result
            );
        END IF;
        RETURN v_result;
    END IF;

    v_party_size := p_party_size;
    IF v_party_size IS NULL AND v_order.session_id IS NOT NULL THEN
        SELECT party_size INTO v_party_size
        FROM public.table_sessions
        WHERE id = v_order.session_id;
    END IF;

    SELECT
        COALESCE(SUM(oi.quantity * oi.unit_price), 0),
        COALESCE(SUM(oi.quantity * oi.cash_price), 0),
        COALESCE(SUM(
            (oi.quantity * oi.unit_price) - COALESCE(oi.discount_amount, 0)
        ), 0),
        COALESCE(SUM(
            (oi.quantity * oi.cash_price)
            - COALESCE(
                ROUND(
                    COALESCE(oi.discount_amount, 0)
                    * COALESCE(oi.cash_price, oi.unit_price)
                    / NULLIF(oi.unit_price, 0)
                , 2)
            , 0)
        ), 0)
    INTO
        v_gross_card_subtotal,
        v_gross_cash_subtotal,
        v_net_card_subtotal,
        v_net_cash_subtotal
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false;

    SELECT *
    INTO v_rule
    FROM public.service_charge_rules
    WHERE merchant_id = v_order.merchant_id
      AND (location_id = v_order.location_id OR location_id IS NULL)
      AND is_active = true
      AND auto_apply = true
    ORDER BY (location_id IS NOT NULL) DESC, updated_at DESC
    LIMIT 1;

    v_eligible := v_rule.id IS NOT NULL
        AND v_rule.rate_percent > 0
        AND v_order.order_type::text = ANY(v_rule.applies_to_order_types)
        AND v_party_size IS NOT NULL
        AND v_party_size >= v_rule.min_party_size;

    IF NOT v_eligible THEN
        v_new_sc          := 0;
        v_rule_id_snap    := NULL;
        v_rate_snap       := NULL;
        v_applies_on_snap := NULL;
        v_name_snap       := NULL;
    ELSE
        IF v_order.service_charge_rule_id IS NOT NULL
           AND v_order.service_charge_rule_id = v_rule.id THEN
            v_rule_id_snap    := v_order.service_charge_rule_id;
            v_rate_snap       := COALESCE(v_order.service_charge_rate, v_rule.rate_percent);
            v_applies_on_snap := COALESCE(v_order.service_charge_applies_on,
                                          (v_rule.applies_on)::text);
            v_name_snap       := COALESCE(v_order.service_charge_name, v_rule.name);
        ELSE
            v_rule_id_snap    := v_rule.id;
            v_rate_snap       := v_rule.rate_percent;
            v_applies_on_snap := (v_rule.applies_on)::text;
            v_name_snap       := v_rule.name;
        END IF;

        v_sc_base := CASE v_applies_on_snap
            WHEN 'pre_discount'  THEN v_gross_card_subtotal
            WHEN 'post_discount' THEN v_net_card_subtotal
            ELSE v_gross_card_subtotal
        END;
        v_new_sc := ROUND(v_sc_base * v_rate_snap / 100.0, 2);
    END IF;

    UPDATE public.orders
    SET service_charge            = v_new_sc,
        service_charge_rule_id    = v_rule_id_snap,
        service_charge_rate       = v_rate_snap,
        service_charge_applies_on = v_applies_on_snap,
        service_charge_name       = v_name_snap,
        updated_at                = now()
    WHERE id = p_order_id;

    PERFORM public.calculate_order_totals_fast(p_order_id);

    SELECT * INTO v_post_order FROM public.orders WHERE id = p_order_id;

    v_result := jsonb_build_object(
        'success', true,
        'service_charge', v_new_sc,
        'service_charge_rule_id', v_rule_id_snap,
        'service_charge_rate', v_rate_snap,
        'service_charge_applies_on', v_applies_on_snap,
        'service_charge_name', v_name_snap,
        'card_subtotal', v_post_order.card_subtotal,
        'cash_subtotal', v_post_order.cash_subtotal,
        'card_total', v_post_order.card_total,
        'cash_total', v_post_order.cash_total,
        'total_amount', v_post_order.total_amount,
        'amount_due', v_post_order.amount_due,
        'cash_amount_due', v_post_order.cash_amount_due,
        'sync_version', v_post_order.sync_version,
        'eligible', v_eligible,
        'old_service_charge', v_old_sc,
        'party_size_used', v_party_size
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(
            p_idempotency_key, 'apply_service_charge_v1', v_result
        );
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_service_charge_v1(uuid, integer, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.apply_service_charge_v1 IS
  'Server-authoritative service charge RPC. Re-resolves rule, resolves party_size from table_sessions when NULL, recomputes SC from order_items, persists snapshot fields, then PERFORMs calculate_order_totals_fast so total_amount / amount_due / sync_version reflect SC. Snapshot freeze: rate/applies_on/name pinned on first apply, re-pinned only when service_charge_rule_id changes. Manual override (service_charge_is_manual=true) skips SC math but still recomputes totals. Idempotency op: ''apply_service_charge_v1''.';;
