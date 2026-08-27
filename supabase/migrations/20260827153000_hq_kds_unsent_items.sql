-- =============================================================================
-- HQ KDS unsent items (support-facing "what never reached the kitchen" view)
-- =============================================================================
-- Source: the same merchant reports as the send ledger, flipped around. The
-- send ledger answers "what did the server receive?". This answers "which
-- items are still sitting in an order, never sent to the kitchen?"
--
-- A non-voided order item is UNSENT when order_items.sent_to_kitchen_at is
-- null -- bulk_update_order_item_status_v2 stamps that column the moment an
-- item fires to the kitchen as 'sent' or 'preparing'. Items on
-- cancelled/void/refunded/declined orders are excluded: an unsent item there
-- is expected, not a bug.
--
-- USE CASES
--   1. Merchant: "I sent the order but the kitchen got nothing."
--        Send ledger: no row. Unsent view: the order's items still unsent.
--        -> the send never reached the server.
--   2. "Some items made it, some didn't."
--        Unsent view: an order with sent_item_count > 0 AND unsent items ->
--        a partial fire; the listed items are the ones that did not apply.
--   3. A draft nobody fired (forgot to send / left sitting).
--        Unsent view: a fully_unsent order with status draft/pending.
--
-- HQ-only read (is_dexapos_admin), same pattern as the other hq_* KDS RPCs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hq_get_kds_unsent_items_v1(
  p_location_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to, now());
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'hq_get_kds_unsent_items_v1 requires Dexa HQ access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_location_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(entry ORDER BY (entry->>'order_created_ms')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'order_type', o.order_type,
      'order_status', o.status,
      'order_created_at', o.created_at,
      -- Epoch-ms sort key, same reasoning as the send ledger: timestamptz
      -- -> jsonb renders in the session timezone, so the ISO string is not
      -- lexicographically stable across sessions.
      'order_created_ms', (extract(epoch from o.created_at) * 1000)::bigint,
      'order_updated_at', o.updated_at,
      'sent_to_kitchen_at', o.sent_to_kitchen_at,
      'total_item_count', agg.total_item_count,
      'sent_item_count', agg.sent_item_count,
      'unsent_item_count', agg.unsent_item_count,
      'fully_unsent', agg.sent_item_count = 0,
      'items', agg.items_json
    ) AS entry
    FROM (
      SELECT
        oi.order_id,
        count(*) AS total_item_count,
        count(*) FILTER (WHERE oi.sent_to_kitchen_at IS NOT NULL)
          AS sent_item_count,
        count(*) FILTER (WHERE oi.sent_to_kitchen_at IS NULL)
          AS unsent_item_count,
        jsonb_agg(
          jsonb_build_object(
            'order_item_id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'kitchen_status', oi.kitchen_status,
            'category_name', oi.category_name,
            'prep_station', oi.prep_station,
            'created_at', oi.created_at
          )
          ORDER BY oi.created_at, oi.id
        ) FILTER (WHERE oi.sent_to_kitchen_at IS NULL) AS items_json
      FROM public.order_items oi
      WHERE COALESCE(oi.is_voided, false) = false
        AND oi.order_id IN (
          -- Orders at this location that still have at least one unsent item.
          SELECT DISTINCT oi2.order_id
          FROM public.order_items oi2
          JOIN public.orders o2 ON o2.id = oi2.order_id
          WHERE o2.location_id = p_location_id
            AND COALESCE(oi2.is_voided, false) = false
            AND oi2.sent_to_kitchen_at IS NULL
            -- o2.status is the order_status enum; the literals coerce to it,
            -- and a NULL status would simply not match (orders always carry
            -- one). Do NOT COALESCE it with '' -- '' is not a valid enum label.
            AND o2.status NOT IN (
              'cancelled', 'void', 'refunded', 'declined'
            )
            AND o2.created_at >= v_from
            AND o2.created_at <= v_to
            AND (p_order_id IS NULL OR o2.id = p_order_id)
        )
      GROUP BY oi.order_id
    ) agg
    JOIN public.orders o ON o.id = agg.order_id
    ORDER BY o.created_at DESC
    LIMIT v_limit
  ) led;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.hq_get_kds_unsent_items_v1(uuid, timestamptz, timestamptz, integer, uuid) IS
  'HQ-only list of orders (at a location) that still have non-voided items which never fired to the kitchen, with per-order sent/unsent counts.';

REVOKE ALL ON FUNCTION public.hq_get_kds_unsent_items_v1(uuid, timestamptz, timestamptz, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_get_kds_unsent_items_v1(uuid, timestamptz, timestamptz, integer, uuid)
  TO authenticated, service_role;
