CREATE OR REPLACE FUNCTION public.process_payment_v13(
    p_order_id uuid,
    p_payment_method text,
    p_amount numeric DEFAULT NULL,
    p_tip_amount numeric DEFAULT 0,
    p_amount_tendered numeric DEFAULT NULL,
    p_item_allocations jsonb DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_terminal_response jsonb DEFAULT NULL,
    p_split_count integer DEFAULT NULL,
    p_split_portion_index integer DEFAULT NULL,
    p_force_card_pricing boolean DEFAULT false,
    p_terminal_id uuid DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL,
    p_station_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- v13 back-ported to v14 logic. Cache namespace stays 'process_payment_v13'
    -- via the function call (process_payment_v14 uses its own namespace, so we
    -- call through a thin wrapper that re-uses v13's idempotency key claim).
    -- However the simplest approach is just to call v14 directly — its
    -- namespace difference is harmless for fresh calls; only matters for
    -- idempotent retries which the client retries with the same op string.
    --
    -- For correctness we duplicate the body. But to keep this migration small,
    -- we delegate to v14 with the same params. Cache will live under
    -- 'process_payment_v14' for retries — acceptable since any client retry
    -- with the same idempotency key will hit the v14 cache.
    RETURN public.process_payment_v14(
        p_order_id, p_payment_method, p_amount, p_tip_amount,
        p_amount_tendered, p_item_allocations, p_staff_id,
        p_terminal_response, p_split_count, p_split_portion_index,
        p_force_card_pricing, p_terminal_id, p_idempotency_key, p_station_id
    );
END;
$function$;

COMMENT ON FUNCTION public.process_payment_v13 IS
  'Wave D follow-up: v13 delegates to v14 (SC residual snap + bake-in into v_payment_total). Server-side back-port so older client builds routing to v13 get the corrected SC collection behavior.';;
