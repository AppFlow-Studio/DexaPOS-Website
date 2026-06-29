-- ============================================================================
-- DB Perf Phase 6 — Lever 3: set-based modifier/status pre-aggregation
--
-- Replaces per-item correlated subqueries in two hot RPCs with single
-- pre-aggregated CTEs that are LEFT JOINed before grouping:
--   * get_kds_tickets_v2  — per-item `order_item_modifiers` subquery + the
--     repeated per-item `kds_item_status` "acknowledged" EXISTS/NOT EXISTS
--     checks (5 occurrences) collapse to one `item_ack` CTE.
--   * get_order_details   — per-item `order_item_modifiers` subquery.
--
-- Output is content-identical to the prior definitions. The one nuance:
-- modifier arrays had NO ORDER BY in the live functions, so they returned
-- physical (ctid) heap order — non-deterministic (shifts on update/vacuum).
-- The rewrite emits them `ORDER BY oim.created_at, oim.id` (stable insertion
-- order). Verified against live staging: modifier *content* is identical for
-- every item; only element order changes, and only for items whose heap order
-- already diverged from insertion order (~17%). Order is cosmetic (KDS display).
--
-- Signatures, return types, SECURITY DEFINER and search_path are unchanged.
-- No CREATE INDEX CONCURRENTLY here, so a normal txn migration is fine.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_kds_tickets_v2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(p_location_id uuid, p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text], p_kds_display_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  WITH loc_items AS (
    -- Working set: items on currently-open orders at this location. Mirrors the
    -- outer order-status filter so the pre-aggregations cover exactly (a superset
    -- of) the items that can appear in the result, not the full order history.
    SELECT oi.id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
  ),
  item_mods AS (
    SELECT oim.order_item_id,
           jsonb_agg(
             jsonb_build_object(
               'modifier_name', oim.modifier_name,
               'modifier_group_name', oim.modifier_group_name,
               'price_modifier', oim.price_modifier,
               'is_no', COALESCE(oim.is_no, false)
             )
             ORDER BY oim.created_at, oim.id
           ) AS modifiers
    FROM public.order_item_modifiers oim
    WHERE oim.order_item_id IN (SELECT id FROM loc_items)
    GROUP BY oim.order_item_id
  ),
  item_ack AS (
    -- One row per acknowledged order_item (respecting the optional display filter).
    -- Replaces the repeated per-item `acknowledged` EXISTS / NOT EXISTS subqueries.
    SELECT DISTINCT kis.order_item_id
    FROM public.kds_item_status kis
    WHERE kis.acknowledged_at IS NOT NULL
      AND (p_kds_display_id IS NULL OR kis.kds_display_id = p_kds_display_id)
      AND kis.order_item_id IN (SELECT id FROM loc_items)
  )
  SELECT COALESCE(
    jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text
        || '_f' || COALESCE(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN NOT oi_grouped.any_active_items THEN 'cooking'
        WHEN oi_grouped.all_active_ready  THEN 'ready'
        WHEN oi_grouped.any_active_sent   THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_platform', COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'order_notes', o.special_instructions,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'ready_time', oi_grouped.ready_time,
      'item_count', oi_grouped.active_item_count,
      'prioritized', oi_grouped.any_prioritized,
      'session_id', o.session_id,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM public.orders o
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        bool_or(
          NOT COALESCE(oi.is_voided, false)
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
        ) AS any_active_items,
        bool_and(
          CASE
            WHEN NOT COALESCE(oi.is_voided, false)
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            THEN oi.kitchen_status = 'ready'
            ELSE true
          END
        ) AS all_active_ready,
        bool_or(
          CASE
            WHEN NOT COALESCE(oi.is_voided, false)
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            THEN oi.kitchen_status = 'sent'
            ELSE false
          END
        ) AS any_active_sent,
        SUM(
          CASE
            WHEN COALESCE(oi.is_voided, false) THEN 0
            ELSE GREATEST(oi.quantity - COALESCE(oi.refunded_quantity, 0), 0)
          END
        )::int AS active_item_count,
        oi.fire_time,
        MAX(oi.completed_at) FILTER (
          WHERE NOT COALESCE(oi.is_voided, false)
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
        ) AS ready_time,
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        bool_or(
          COALESCE(oi.is_voided, false) = true
          AND ia.order_item_id IS NULL
        ) AS has_unacknowledged_void_notice,
        bool_or(
          COALESCE(oi.refunded_quantity, 0) > 0
          AND oi.kitchen_status NOT IN ('served', 'done', 'completed')
          AND ia.order_item_id IS NULL
        ) AS has_unacknowledged_refund_notice,
        jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'name', COALESCE(oi.open_item_name, oi.item_name),
            'quantity', oi.quantity,
            'seat_number', oi.seat_number,
            'kitchen_status', COALESCE(oi.kitchen_status, 'sent'),
            'special_instructions', oi.special_instructions,
            'category_name', oi.category_name,
            'category_id', oi.category_id,
            'menu_name', oi.menu_name,
            'menu_id', oi.menu_id,
            'prep_station', oi.prep_station,
            'rush', COALESCE(oi.rush, false),
            'is_prioritized', COALESCE(oi.is_prioritized, false),
            'is_to_go', COALESCE(oi.is_to_go, false),
            'fire_time', oi.fire_time::timestamptz,
            'is_voided', COALESCE(oi.is_voided, false),
            'acknowledged', ia.order_item_id IS NOT NULL,
            'is_refunded', COALESCE(oi.refunded_quantity, 0) > 0,
            'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
            'modifiers', COALESCE(im.modifiers, '[]'::jsonb)
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM public.order_items oi
      LEFT JOIN public.kds_item_status kis
        ON kis.order_item_id = oi.id
        AND p_kds_display_id IS NOT NULL
        AND kis.kds_display_id = p_kds_display_id
      LEFT JOIN item_mods im ON im.order_item_id = oi.id
      LEFT JOIN item_ack  ia ON ia.order_item_id = oi.id
      WHERE (
          oi.kitchen_status IS NOT NULL
          OR COALESCE(oi.is_voided, false) = true
        )
        AND (
          (
            COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = ANY(p_statuses)
            AND (
              p_kds_display_id IS NULL
              OR (kis.id IS NOT NULL AND kis.status NOT IN ('cancelled', 'completed'))
            )
          )
          OR (
            COALESCE(oi.is_voided, false) = true
            AND ia.order_item_id IS NULL
          )
          OR (
            COALESCE(oi.refunded_quantity, 0) > 0
            AND oi.kitchen_status NOT IN ('served', 'done', 'completed')
            AND ia.order_item_id IS NULL
          )
        )
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
      AND (
        oi_grouped.any_active_items
        OR oi_grouped.has_unacknowledged_void_notice
        OR oi_grouped.has_unacknowledged_refund_notice
      )
  ) sub;

  RETURN v_result;
END;
$function$;

-- ----------------------------------------------------------------------------
-- get_order_details
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_details(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSON;
  v_station_name TEXT;
BEGIN
  -- Verify user has access
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
  ) THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  -- Get station name for this order
  SELECT s.station_name INTO v_station_name
  FROM public.orders o
  LEFT JOIN public.stations s ON s.id = o.station_id
  WHERE o.id = p_order_id;

  WITH order_item_mods AS (
    SELECT oim.order_item_id,
           json_agg(row_to_json(oim.*) ORDER BY oim.created_at, oim.id) AS modifiers
    FROM public.order_item_modifiers oim
    WHERE oim.order_item_id IN (
      SELECT oi.id FROM public.order_items oi WHERE oi.order_id = p_order_id
    )
    GROUP BY oim.order_item_id
  )
  SELECT json_build_object(
    'order', row_to_json(o.*),
    'station_name', v_station_name,
    'items', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'item', row_to_json(oi.*),
          'modifiers', COALESCE(m.modifiers, '[]'::json)
        )
        ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
      ), '[]'::json)
      FROM public.order_items oi
      LEFT JOIN order_item_mods m ON m.order_item_id = oi.id
      WHERE oi.order_id = o.id
        AND oi.is_voided = FALSE
    ),
    'payments', (
      SELECT COALESCE(json_agg(row_to_json(op.*)), '[]'::json)
      FROM public.order_payments op
      WHERE op.order_id = o.id
    ),
     'payment_items', (
      SELECT COALESCE(json_agg(row_to_json(opi.*)), '[]'::json)
      FROM public.order_payment_items opi
      JOIN public.order_payments op ON op.id = opi.order_payment_id
      WHERE op.order_id = o.id
    ),
    'reversals', (
      SELECT COALESCE(json_agg(row_to_json(r.*)), '[]'::json)
      FROM public.reversals r
      JOIN public.order_payments op ON op.id = r.original_payment_id
      WHERE op.order_id = o.id
    ),
    'order_refund_items', (
      SELECT COALESCE(json_agg(row_to_json(ori.*)), '[]'::json)
      FROM public.order_refund_items ori
      JOIN public.order_items oi ON oi.id = ori.order_item_id
      WHERE oi.order_id = o.id
    ),
    'status_history', (
      SELECT COALESCE(json_agg(row_to_json(osh.*) ORDER BY osh.changed_at), '[]'::json)
      FROM public.order_status_history osh
      WHERE osh.order_id = o.id
    ),
    'order_discounts', (
      SELECT COALESCE(json_agg(row_to_json(od.*) ORDER BY od.applied_at), '[]'::json)
      FROM public.order_discounts od
      WHERE od.order_id = o.id
        AND od.voided_at IS NULL
    )
  )
  INTO v_result
  FROM public.orders o
  WHERE o.id = p_order_id;

  RETURN v_result;
END;
$function$;
