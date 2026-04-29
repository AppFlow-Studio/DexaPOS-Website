-- =====================================================================
-- Migration: update_order_item_v3 + update_order_item_quantity_v3 — idempotency-key support
-- =====================================================================
-- Bad-WiFi Phase 2 Wave 3.0a. Forks the two cart-hot-path UPDATE RPCs to add
-- optional `p_idempotency_key UUID DEFAULT NULL`. Same `(order_item_id, value)`
-- retried under bad WiFi produces the same client-derived key (uuidv5);
-- server returns the cached jsonb via `_idempotency_claim` instead of
-- re-executing. Different intents (qty 3 → qty 5) produce distinct keys
-- and execute independently.
--
-- Per-RPC adoption gated by client-side feature flags (see
-- `lib/network/featureFlags.ts → IdempotentRpc`). With p_idempotency_key
-- NULL, both functions behave identically to v2.
--
-- Bundles the at-most-once helpers (`idempotency_keys` table,
-- `_idempotency_claim`, `_idempotency_complete`, daily purge) so the
-- migration is self-contained for environments that haven't received
-- the Wave 0.5 layer separately. All `IF NOT EXISTS` / `CREATE OR REPLACE`
-- semantics — safe to re-apply.
--
-- Already applied to staging (project dfwqakoyittmrwbqvxgw) via MCP on 2026-04-28.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Idempotency layer (Wave 0.5 helpers)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; daily purge job will NOT be scheduled. Use Edge Function fallback.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key uuid PRIMARY KEY,
  op text NOT NULL,
  result_json jsonb,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
  ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._idempotency_claim(p_key uuid, p_op text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing record;
BEGIN
  -- Atomic claim. Same row inserted or no-op.
  INSERT INTO public.idempotency_keys (key, op, result_json, status)
  VALUES (p_key, p_op, NULL, 'claimed')
  ON CONFLICT (key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT result_json, status, created_at INTO v_existing
    FROM public.idempotency_keys WHERE key = p_key;

    IF v_existing.status = 'completed' THEN
      RETURN v_existing.result_json;
    ELSIF v_existing.status = 'claimed' AND v_existing.created_at > now() - INTERVAL '60 seconds' THEN
      -- Concurrent same-key in flight — caller should retry after backoff.
      RAISE EXCEPTION 'idempotency_in_flight: key %', p_key
        USING ERRCODE = 'serialization_failure';
    ELSIF v_existing.status = 'claimed' THEN
      -- Stale claim (>60s, assume crashed). Refresh timestamp and let caller take over.
      -- SAFE only for assignment-style mutations where two concurrent executions
      -- converge to the same final state. Counter-increment / row-append RPCs
      -- MUST add a precondition check before this branch.
      UPDATE public.idempotency_keys
      SET created_at = now()
      WHERE key = p_key;
      RETURN NULL;
    ELSE
      RETURN v_existing.result_json;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public._idempotency_complete(p_key uuid, p_op text, p_result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Cap result at 32KB. Oversize → delete the row to force re-execute on retry,
  -- which is safer than caching a truncated result.
  IF octet_length(p_result::text) > 32768 THEN
    DELETE FROM public.idempotency_keys WHERE key = p_key;
    RETURN;
  END IF;

  UPDATE public.idempotency_keys
  SET result_json = p_result,
      status = 'completed',
      completed_at = now()
  WHERE key = p_key AND op = p_op;
END;
$function$;

REVOKE ALL ON FUNCTION public._idempotency_claim(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._idempotency_complete(uuid, text, jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('idempotency_keys_purge')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'idempotency_keys_purge');

    PERFORM cron.schedule(
      'idempotency_keys_purge',
      '0 3 * * *',
      $cron$ DELETE FROM public.idempotency_keys WHERE created_at < now() - INTERVAL '24 hours' $cron$
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- update_order_item_quantity_v3 — hot-path quantity update
-- ---------------------------------------------------------------------
-- Verbatim from update_order_item_quantity_v2 deployed body (per
-- pg_get_functiondef on staging) plus claim/complete bookends and a
-- RAISE LOG for cache-hit observability. json_build_object →
-- jsonb_build_object so v_result is jsonb directly.
CREATE OR REPLACE FUNCTION public.update_order_item_quantity_v3(
    p_order_item_id uuid,
    p_quantity integer,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached jsonb;
    v_order_id uuid;
    v_location_id uuid;
    v_unit_price numeric;
    v_cash_unit_price numeric;
    v_tax_rate numeric;
    v_is_tax_exempt boolean;
    v_modifier_total numeric;
    v_new_subtotal numeric;
    v_new_cash_subtotal numeric;
    v_new_tax_amount numeric;
    v_new_cash_tax_amount numeric;
    v_discount_amount numeric := 0;
    v_discount_cash_amount numeric := 0;
    v_has_active_discount boolean := false;
    v_new_sync_version integer;
    v_price_paid numeric;
    v_result jsonb;
BEGIN
    -- 1. Idempotency claim (NULL key → behaves like v2)
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'update_order_item_quantity_v3');
        IF v_cached IS NOT NULL THEN
            RAISE LOG 'idempotency_cache_hit op=% key=%', 'update_order_item_quantity_v3', p_idempotency_key;
            RETURN v_cached;
        END IF;
    END IF;

    -- 2. Validate quantity
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'Invalid quantity: must be at least 1';
    END IF;

    -- 3. Get current item details (RLS via merchant + location)
    SELECT
        oi.order_id,
        oi.unit_price,
        oi.cash_price,
        oi.tax_rate,
        COALESCE(oi.is_tax_exempt, false),
        o.location_id,
        o.sync_version + 1
    INTO
        v_order_id,
        v_unit_price,
        v_cash_unit_price,
        v_tax_rate,
        v_is_tax_exempt,
        v_location_id,
        v_new_sync_version
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    -- 4. Modifier total (for reference)
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_modifier_total
    FROM public.order_item_modifiers
    WHERE order_item_id = p_order_item_id;

    -- 5. Recalculate pricing for new quantity
    v_new_subtotal := v_unit_price * p_quantity;
    v_new_cash_subtotal := v_cash_unit_price * p_quantity;

    IF v_is_tax_exempt THEN
        v_new_tax_amount := 0;
        v_new_cash_tax_amount := 0;
    ELSE
        v_new_tax_amount := ROUND(v_new_subtotal * v_tax_rate / 100, 2);
        v_new_cash_tax_amount := ROUND(v_new_cash_subtotal * v_tax_rate / 100, 2);
    END IF;

    v_price_paid := v_unit_price * p_quantity;

    -- 6. Update order item
    UPDATE public.order_items SET
        quantity = p_quantity,
        subtotal = v_new_subtotal,
        cash_subtotal = v_new_cash_subtotal,
        tax_amount = v_new_tax_amount,
        cash_tax_amount = v_new_cash_tax_amount,
        discount_amount = 0,
        discount_cash_amount = 0,
        updated_at = now()
    WHERE id = p_order_item_id;

    -- 7. Redistribute active order discount (if any)
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = v_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;

    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(v_order_id);

        SELECT
            subtotal,
            cash_subtotal,
            tax_amount,
            cash_tax_amount,
            COALESCE(discount_amount, 0),
            COALESCE(discount_cash_amount, 0)
        INTO
            v_new_subtotal,
            v_new_cash_subtotal,
            v_new_tax_amount,
            v_new_cash_tax_amount,
            v_discount_amount,
            v_discount_cash_amount
        FROM public.order_items
        WHERE id = p_order_item_id;

        v_price_paid := v_new_subtotal;
    END IF;

    -- 8. Bump sync_version + recalculate order totals
    v_new_sync_version := increment_order_sync_version(v_order_id);
    PERFORM recalculate_order_discount(v_order_id);

    -- 9. Build result
    v_result := jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,
        'quantity', p_quantity,
        'price_paid', v_price_paid,
        'modifier_total', v_modifier_total,
        'new_subtotal', v_new_subtotal,
        'unit_price', v_unit_price,
        'card_subtotal', v_new_subtotal,
        'card_tax_amount', v_new_tax_amount,
        'cash_unit_price', v_cash_unit_price,
        'cash_subtotal', v_new_cash_subtotal,
        'cash_tax_amount', v_new_cash_tax_amount,
        'discount_amount', v_discount_amount,
        'discount_cash_amount', v_discount_cash_amount,
        'sync_version', v_new_sync_version
    );

    -- 10. Idempotency complete (cache result for replay-safety)
    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'update_order_item_quantity_v3', v_result);
    END IF;

    RETURN v_result;
END
$function$;

-- ---------------------------------------------------------------------
-- update_order_item_v3 — polymorphic UPDATE (qty / price / instructions / seat)
-- ---------------------------------------------------------------------
-- Verbatim from update_order_item_v2 deployed body (per pg_get_functiondef
-- on staging). The deployed signature has 5 args + DEFAULTs; v3 adds
-- p_idempotency_key as the 6th DEFAULT NULL — preserves all named callers.
--
-- Note: `update_order_item_v2_dep` is a separate function (different name)
-- and is NOT affected.
--
-- Client-side `toUpdateItemKey` (lib/network/idempotencyKey.ts) allowlists
-- the same params consumed here; ghost fields like `p_prep_station` /
-- `p_course_number` / `p_price_override` (present on the TS type but
-- ignored server-side) are stripped before key derivation.
CREATE OR REPLACE FUNCTION public.update_order_item_v3(
    p_order_item_id uuid,
    p_quantity integer DEFAULT NULL::integer,
    p_unit_price numeric DEFAULT NULL::numeric,
    p_special_instructions text DEFAULT NULL::text,
    p_seat_number integer DEFAULT NULL::integer,
    p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cached jsonb;
    v_order_id uuid;
    v_is_open_item boolean;
    v_location_id uuid;
    v_tax_rate numeric;
    v_new_quantity integer;
    v_new_price numeric;
    v_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;
    v_cash_discount_rate numeric := 0.04;
    v_result jsonb;
BEGIN
    -- 1. Idempotency claim (NULL key → behaves like v2)
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'update_order_item_v3');
        IF v_cached IS NOT NULL THEN
            RAISE LOG 'idempotency_cache_hit op=% key=%', 'update_order_item_v3', p_idempotency_key;
            RETURN v_cached;
        END IF;
    END IF;

    -- 2. Get current item details (RLS via merchant + location)
    SELECT
        oi.order_id,
        oi.is_open_item,
        oi.quantity,
        oi.unit_price,
        oi.tax_rate,
        o.location_id
    INTO v_order_id, v_is_open_item, v_new_quantity, v_new_price, v_tax_rate, v_location_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids());

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    -- 3. Apply incoming overrides (NULL preserves existing)
    IF p_quantity IS NOT NULL THEN
        v_new_quantity := p_quantity;
    END IF;

    IF p_unit_price IS NOT NULL THEN
        IF NOT v_is_open_item THEN
            RAISE EXCEPTION 'Cannot change price of regular menu items';
        END IF;
        v_new_price := p_unit_price;
    END IF;

    -- 4. Recalculate pricing
    v_cash_price := v_new_price * (1 - v_cash_discount_rate);
    v_subtotal := v_new_price * v_new_quantity;
    v_cash_subtotal := v_cash_price * v_new_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    -- 5. Update order item
    UPDATE public.order_items SET
        quantity = v_new_quantity,
        unit_price = v_new_price,
        cash_price = v_cash_price,
        subtotal = v_subtotal,
        cash_subtotal = v_cash_subtotal,
        tax_amount = v_tax_amount,
        cash_tax_amount = v_cash_tax_amount,
        open_item_price = CASE WHEN v_is_open_item THEN v_new_price ELSE open_item_price END,
        special_instructions = COALESCE(p_special_instructions, special_instructions),
        seat_number = COALESCE(p_seat_number, seat_number),
        updated_at = now()
    WHERE id = p_order_item_id;

    -- 6. Recalculate order totals
    PERFORM calculate_order_totals_fast(v_order_id);

    -- 7. Build result
    v_result := jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,
        'quantity', v_new_quantity,
        'unit_price', v_new_price,
        'subtotal', v_subtotal
    );

    -- 8. Idempotency complete (cache result for replay-safety)
    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'update_order_item_v3', v_result);
    END IF;

    RETURN v_result;
END
$function$;
