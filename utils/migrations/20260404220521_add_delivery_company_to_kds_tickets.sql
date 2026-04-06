-- Add delivery_company to get_kds_tickets_v2 response
-- Reads from orders.metadata->>'delivery_company' (populated by process_online_order RPC)
-- This allows KDS displays to show which delivery platform an order came from

CREATE OR REPLACE FUNCTION "public"."get_kds_tickets_v2"("p_location_id" "uuid", "p_statuses" "text"[] DEFAULT ARRAY['sent'::"text", 'preparing'::"text", 'ready'::"text"], "p_kds_display_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text  || '_f' || COALESCE(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN oi_grouped.all_ready THEN 'ready'
        WHEN oi_grouped.any_sent THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_company', o.metadata->>'delivery_company',
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'item_count', oi_grouped.item_count,
      'prioritized', oi_grouped.any_prioritized,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM orders o
    -- Join aggregated items grouped by course
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        -- Status aggregation
        bool_and(oi.kitchen_status = 'ready') AS all_ready,
        bool_or(oi.kitchen_status = 'sent' OR oi.kitchen_status IS NULL) AS any_sent,
        -- Item count (sum of quantities)
        SUM(oi.quantity)::int AS item_count,
        oi.fire_time,
        -- Ticket-level priority flag (true if any item is prioritized)
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        -- Items array with nested modifiers (stable ordering)
        jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'name', COALESCE(oi.open_item_name, oi.item_name),
            'quantity', oi.quantity,
            'kitchen_status', COALESCE(oi.kitchen_status, 'sent'),
            'special_instructions', oi.special_instructions,
            'category_name', oi.category_name,
            'category_id', oi.category_id,
            'menu_name', oi.menu_name,
            'menu_id', oi.menu_id,
            'prep_station', oi.prep_station,
            'rush', COALESCE(oi.rush, false),
            'is_prioritized', COALESCE(oi.is_prioritized, false),
            'fire_time', oi.fire_time::timestamptz,
            'modifiers', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'modifier_name', oim.modifier_name,
                  'modifier_group_name', oim.modifier_group_name,
                  'price_modifier', oim.price_modifier,
                  'is_no', COALESCE(oim.is_no, false)

                )
              ), '[]'::jsonb)
              FROM order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            )
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM order_items oi
      -- When p_kds_display_id is provided, only include items routed to that display
      LEFT JOIN kds_item_status kis
        ON kis.order_item_id = oi.id
        AND kis.kds_display_id = p_kds_display_id
        AND kis.status NOT IN ('cancelled', 'completed')
      WHERE COALESCE(oi.is_voided, false) = false
        AND (oi.kitchen_status = ANY(p_statuses) OR oi.kitchen_status IS NULL)
        -- Filter: if display ID provided, only show routed items; otherwise show all
        AND (p_kds_display_id IS NULL OR kis.id IS NOT NULL)
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
  ) sub;

  RETURN v_result;
END;$$;
