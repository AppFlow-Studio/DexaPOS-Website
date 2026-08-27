-- =============================================================================
-- HQ KDS send ledger (support-facing projection of kds_send_attempts)
-- =============================================================================
-- Source: repeated merchant reports of "some items I send are not showing in
-- KDS". The board mirror (20260827120000_hq_kds_board_mirror.sql) answers
-- "what does the server say a station should show". This answers the earlier
-- question: "did the server ever receive the send, from which station, and did
-- every requested item apply?"
--
-- Splitting a "orders are not reaching the KDS" report into its three cases:
--   1. No send-attempt row for an order the merchant says they fired
--        -> the POS never reached the server (offline, API error, client bug).
--   2. actually_updated_count < requested_count (partial send)
--        -> a sync/idempotency problem; the row lists exactly which items did
--           not apply.
--   3. Items routed (kds_routing_log shows the target display) but the kitchen
--        screen is blank -> the server did its job; the fault is device-side,
--        and the board mirror confirms it.
--
-- Append-only: kds_send_attempts is immutable and RLS-scoped; this RPC is a
-- read-only HQ projection of it (is_dexapos_admin), same pattern as the other
-- hq_* KDS functions. Item names, routing outcomes and dropped flags come from
-- order_items + kds_routing_log so support sees "order #3, 4 items, sent at
-- 1pm, all routed to Grill" without extra round trips.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hq_get_kds_send_ledger_v1(
  p_location_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100,
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
  v_from timestamptz := COALESCE(p_from, now() - interval '7 days');
  v_to timestamptz := COALESCE(p_to, now());
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'hq_get_kds_send_ledger_v1 requires Dexa HQ access'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_location_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(entry ORDER BY (entry->>'created_at_ms')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', sa.id,
      'created_at', sa.created_at,
      -- Sort key as epoch ms: timestamptz->jsonb renders in the session
      -- timezone, so lexicographic ordering of the ISO string is not stable.
      'created_at_ms', (extract(epoch from sa.created_at) * 1000)::bigint,
      'order_id', sa.order_id,
      'order_number', o.order_number,
      'order_type', o.order_type,
      'order_status', o.status,
      'sent_to_kitchen_at', o.sent_to_kitchen_at,
      'requested_count', sa.requested_count,
      'actually_updated_count', sa.actually_updated_count,
      'order_item_count', sa.order_item_count,
      'item_status', sa.item_status,
      'station_name', st.station_name,
      'device_id', sa.device_id,
      'staff_name', trim(both from
        coalesce(sp.display_name, sp.first_name || ' ' || sp.last_name)),
      'idempotency_key', sa.idempotency_key,
      'was_replay', sa.was_replay,
      'partial', sa.actually_updated_count <> sa.requested_count,
      'items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'order_item_id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'kitchen_status', oi.kitchen_status,
            'category_name', oi.category_name,
            'prep_station', oi.prep_station,
            'routed_to', COALESCE(rt.routed_displays, ARRAY[]::text[]),
            'dropped', COALESCE(rt.dropped, false)
          )
          ORDER BY rid.ord
        )
        FROM unnest(sa.requested_item_ids) WITH ORDINALITY AS rid(order_item_id, ord)
        JOIN public.order_items oi ON oi.id = rid.order_item_id
        LEFT JOIN LATERAL (
          SELECT
            array_agg(l.kds_display_name ORDER BY l.kds_display_name)
              FILTER (WHERE l.outcome = 'routed') AS routed_displays,
            bool_or(l.outcome = 'dropped') AS dropped
          FROM public.kds_routing_log l
          WHERE l.order_item_id = oi.id
        ) rt ON true
      ), '[]'::jsonb)
    ) AS entry
    FROM public.kds_send_attempts sa
    JOIN public.orders o ON o.id = sa.order_id
    LEFT JOIN public.stations st ON st.id = sa.station_id
    LEFT JOIN public.staff_profiles sp ON sp.id = sa.staff_id
    WHERE sa.location_id = p_location_id
      AND sa.created_at >= v_from
      AND sa.created_at <= v_to
      AND (p_order_id IS NULL OR sa.order_id = p_order_id)
    ORDER BY sa.created_at DESC
    LIMIT v_limit
  ) led;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.hq_get_kds_send_ledger_v1(uuid, timestamptz, timestamptz, integer, uuid) IS
  'HQ-only chronological ledger of every order-to-kitchen send attempt at a location, with per-item routing outcomes, for diagnosing "items are not reaching the KDS" reports.';

REVOKE ALL ON FUNCTION public.hq_get_kds_send_ledger_v1(uuid, timestamptz, timestamptz, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_get_kds_send_ledger_v1(uuid, timestamptz, timestamptz, integer, uuid)
  TO authenticated, service_role;
