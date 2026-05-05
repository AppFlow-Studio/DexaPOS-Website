-- Lane E: Order / KDS / Menu concurrency — DB side
--
-- E1 remove_order_item: wrap delete + recalculate_order_discount in a row
--    lock on orders so concurrent removals/recalcs serialize per-order.
-- E2 bulk_update_order_item_status_v2: optional p_expected_sync_version
--    parameter. If set, every affected order must currently match the version
--    or the function raises (optimistic concurrency).
-- E3 menu_items.version column: nullable bigint, default 0. App-code
--    maintains the increment + expected-version check (Temur's piece).
--
-- Style follows the post-Apr-30 hardening pattern for these RPCs:
--   - search_path TO '' on remove_order_item (already the canonical form)
--   - search_path TO 'public', 'pg_temp' on bulk_update_order_item_status_v2
--     (matches the existing v2 definition that we're patching)

-- ============================================================================
-- E1. remove_order_item — add FOR UPDATE row lock on the parent order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.remove_order_item(p_order_item_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_id            uuid;
  v_order_status        text;
  v_item_kitchen_status text;
  v_item_subtotal       numeric(10, 2);
  v_result              json;
BEGIN
  -- Resolve order_id + access guard via the item.
  SELECT
    o.id,
    o.status,
    oi.subtotal,
    oi.kitchen_status
  INTO v_order_id, v_order_status, v_item_subtotal, v_item_kitchen_status
  FROM public.order_items oi
  JOIN public.orders      o ON o.id = oi.order_id
  WHERE oi.id          = p_order_item_id
    AND oi.is_voided   = FALSE
    AND o.merchant_id  = public.user_merchant_id()
    AND o.location_id  = ANY(public.user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or access denied';
  END IF;

  -- Lock the parent order row so the delete + discount recalc are atomic
  -- against any other writer touching this order (other removals,
  -- recalculate_order_discount, bulk status updates, payment apply, etc.).
  PERFORM 1
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF v_item_kitchen_status IS NOT NULL
     AND v_item_kitchen_status NOT IN ('new', '') THEN
    RAISE EXCEPTION
      'Cannot remove item with kitchen_status=%. Use void_order_item() instead.',
      v_item_kitchen_status;
  END IF;

  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  DELETE FROM public.order_items
  WHERE id = p_order_item_id;

  PERFORM public.recalculate_order_discount(v_order_id);

  SELECT json_build_object(
    'success',          true,
    'removed_item_id',  p_order_item_id,
    'order_id',         v_order_id,
    'removed_subtotal', v_item_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ============================================================================
-- E2. bulk_update_order_item_status_v2 — optional optimistic concurrency
-- New optional last parameter `p_expected_sync_version`. If non-null, every
-- order touched by the update must currently match that version or the
-- function raises P0004. Caller passes NULL to opt out (preserves prior
-- behavior).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bulk_update_order_item_status_v2(
  p_order_item_ids        uuid[],
  p_status                text,
  p_staff_id              uuid    DEFAULT NULL,
  p_idempotency_key       uuid    DEFAULT NULL,
  p_expected_sync_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached              jsonb;
  v_affected_order_ids  uuid[];
  v_target_order_ids    uuid[];
  v_mismatch_count      int;
  v_result              jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'bulk_update_order_item_status_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  -- Optimistic concurrency gate. Lock the affected order rows first so the
  -- version check is atomic against subsequent updates.
  IF p_expected_sync_version IS NOT NULL THEN
    SELECT ARRAY_AGG(DISTINCT order_id)
      INTO v_target_order_ids
      FROM public.order_items
     WHERE id = ANY(p_order_item_ids);

    IF v_target_order_ids IS NOT NULL THEN
      PERFORM 1
        FROM public.orders
       WHERE id = ANY(v_target_order_ids)
         FOR UPDATE;

      SELECT COUNT(*)
        INTO v_mismatch_count
        FROM public.orders
       WHERE id = ANY(v_target_order_ids)
         AND COALESCE(sync_version, 0) <> p_expected_sync_version;

      IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION
          'sync_version mismatch — expected %, refusing to update % order(s)',
          p_expected_sync_version, v_mismatch_count
          USING ERRCODE = 'P0004',
                HINT    = 'Re-fetch the order, then retry with the current sync_version.';
      END IF;
    END IF;
  END IF;

  UPDATE order_items
  SET
    kitchen_status = p_status,
    updated_at     = NOW(),
    fire_time = CASE
      WHEN p_status = 'sent' THEN NOW()
      WHEN p_status = 'preparing' AND fire_time IS NULL THEN NOW()
      ELSE fire_time
    END,
    sent_to_kitchen_at = CASE
      WHEN p_status IN ('sent', 'preparing')
        THEN COALESCE(sent_to_kitchen_at, NOW())
      ELSE sent_to_kitchen_at
    END,
    started_preparing_at = CASE
      WHEN p_status = 'preparing'
        THEN COALESCE(started_preparing_at, NOW())
      ELSE started_preparing_at
    END,
    completed_at = CASE
      WHEN p_status IN ('ready', 'served')
        THEN COALESCE(completed_at, NOW())
      ELSE completed_at
    END
  WHERE id = ANY(p_order_item_ids);

  IF p_status = 'preparing' THEN
    UPDATE kds_item_status
    SET started_at = COALESCE(started_at, NOW())
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status = 'pending';
  END IF;

  IF p_status = 'ready' THEN
    UPDATE kds_item_status
    SET completed_at = COALESCE(completed_at, NOW())
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status NOT IN ('cancelled', 'completed');
  END IF;

  IF p_status = 'served' THEN
    UPDATE kds_item_status
    SET status       = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        bumped_at    = NOW(),
        bumped_by    = p_staff_id
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status NOT IN ('cancelled', 'completed');
  END IF;

  SELECT ARRAY_AGG(DISTINCT order_id) INTO v_affected_order_ids
  FROM order_items
  WHERE id = ANY(p_order_item_ids);

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE orders o
    SET
      sent_to_kitchen_at = CASE
        WHEN p_status IN ('sent', 'preparing') THEN COALESCE(o.sent_to_kitchen_at, NOW())
        ELSE o.sent_to_kitchen_at
      END,
      started_preparing_at = CASE
        WHEN p_status = 'preparing' THEN COALESCE(o.started_preparing_at, NOW())
        ELSE o.started_preparing_at
      END,
      ready_at = CASE
        WHEN agg.all_ready_or_served AND o.status::text IN ('sent_to_kitchen', 'preparing')
          THEN COALESCE(o.ready_at, NOW())
        ELSE o.ready_at
      END,
      status = CASE
        WHEN p_status = 'sent' THEN o.status
        WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing') THEN o.status
        WHEN agg.all_ready_or_served THEN 'ready'::order_status
        WHEN agg.any_beyond_sent THEN 'preparing'::order_status
        ELSE o.status
      END,
      sync_version = COALESCE(o.sync_version, 0) + 1,
      updated_at   = NOW()
    FROM (
      SELECT
        oi.order_id,
        bool_and(oi.kitchen_status IN ('ready', 'served'))                    AS all_ready_or_served,
        bool_or(oi.kitchen_status IN ('preparing', 'ready', 'served'))        AS any_beyond_sent
      FROM order_items oi
      WHERE oi.order_id = ANY(v_affected_order_ids)
        AND COALESCE(oi.is_voided, false) = false
        AND oi.kitchen_status IS NOT NULL
      GROUP BY oi.order_id
    ) agg
    WHERE o.id = agg.order_id;
  END IF;

  v_result := jsonb_build_object(
    'updated_count',      array_length(p_order_item_ids, 1),
    'affected_order_ids', to_jsonb(v_affected_order_ids)
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'bulk_update_order_item_status_v2', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

-- Re-grant on the new signature. The previous 4-arg overload is automatically
-- replaced by the 5-arg version (CREATE OR REPLACE only matches identical
-- arg lists), so we DROP it explicitly.
DROP FUNCTION IF EXISTS public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid);

GRANT EXECUTE ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid, integer) IS
  'Bulk-update kitchen_status on order_items + cascade to kds_item_status / orders. v2 adds optional p_idempotency_key for at-most-once execution and optional p_expected_sync_version for optimistic concurrency. When p_expected_sync_version is set, every affected order must currently match or the function raises P0004.';

-- ============================================================================
-- E3. menu_items.version — concurrency-control column
-- App-code (Temur) does the expected-version check on UPDATE; this migration
-- only ships the column + default.
-- ============================================================================
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.menu_items.version IS
  'Optimistic-concurrency token. App-code increments on UPDATE and uses WHERE version = expected_version to detect conflicting writers.';
