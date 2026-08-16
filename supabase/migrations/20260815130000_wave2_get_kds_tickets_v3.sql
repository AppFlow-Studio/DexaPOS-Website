-- =============================================================================
-- Wave 2 — get_kds_tickets_v3: apply the location scope BEFORE aggregating
-- =============================================================================
-- Source: Notion [POS-PERF] AUD-8, audit 2026-07-24 §8.
--
-- PROBLEM (measured on prod)
--   get_kds_tickets_v2 is the single most expensive RPC in the system:
--     429,637 calls @ 42.75 ms  = 18,367.9 s   (with p_kds_display_id)
--     127,137 calls @ 26.26 ms  =  3,338.3 s   (location only)
--                                 ---------
--                                 21,706 s total DB time
--
--   Its inner aggregate subquery reads  FROM public.order_items oi  with NO
--   location predicate whatsoever. It aggregates, and builds items_json for,
--   EVERY order_item on the platform -- including, per item, a correlated
--   order_item_modifiers subquery and an EXISTS on kds_item_status, plus four
--   further NOT EXISTS acknowledgement probes per group. Only afterwards does
--   the outer query join to orders and filter o.location_id = p_location_id.
--
--   On prod 2026-08-13: 11,399 of 11,399 order_items are KDS candidates
--   (kitchen_status IS NOT NULL for all of them) spread over 6 locations, so
--   roughly five sixths of that JSON construction is built and thrown away.
--   Corroborating counter: idx_kds_item_status_order_item_id has 870,017 scans.
--   Cost grows linearly with total PLATFORM volume, not with the caller's
--   location -- every new merchant slows down every existing kitchen.
--
-- FIX
--   Join order_items to a location-scoped set of orders before aggregating.
--
-- WHY THE OUTPUT IS PROVABLY IDENTICAL
--   The added predicate is a strict SUPERSET of the outer WHERE, so it can
--   never drop a row the outer query would have kept:
--     outer keeps  status NOT IN (completed,cancelled,void,refunded)
--                    => satisfies status NOT IN (cancelled,void,refunded)  OK
--     outer keeps  status = 'completed' AND any_done_items
--                    => 'completed' is not in (cancelled,void,refunded)    OK
--     status IS NULL => NULL under both, row dropped by both               OK
--   The outer WHERE is retained verbatim, so it remains the authority.
--
--   Everything else -- the ticket_id expression (floor-ms precision, guarding
--   the #S1-0013 collision fix), the rush/prioritised sort, every aggregate,
--   the per-item modifier subquery and acknowledgement probes -- is copied
--   BYTE-FOR-BYTE from v2. The correlated subqueries are deliberately NOT
--   pre-aggregated into CTEs: once the item set is scoped they are cheap index
--   lookups, and rewriting them would risk changing modifier ordering, which is
--   currently index-scan order and would be reshuffled by an explicit sort on a
--   random uuid id. Minimum diff, maximum certainty.
--
-- VERIFIED READ-ONLY AGAINST PROD 2026-08-13
--   Both bodies were executed inline and their group sets compared. For the
--   busiest location (5afc6641, 3,016 of 3,580 orders):
--     groups v2 builds (platform-wide) 5,056
--     groups v3 builds (scoped)        4,434
--     groups surviving, v2             4,434
--     groups surviving, v3             4,434
--     in_v2_not_v3                         0
--     in_v3_not_v2                         0
--   Identical (order_id, course_number, fire_time, item_count, item_ids) sets.
--
--   Work eliminated, by location:
--     94dd8b80  5,056 -> 302 groups   94.0%
--     714c2c9d  5,056 -> 114 groups   97.7%
--     fb1faf52  5,056 ->  37 groups   99.3%
--   v2 is O(platform); v3 is O(location). The gap widens with every merchant
--   onboarded, which is why this is a scaling fix and not just a latency fix.
--
-- !! STAGING/PROD DRIFT — READ BEFORE PROMOTING TO PROD !!
--   get_kds_tickets_v2 is NOT the same function on the two environments:
--     staging: '_f' || floor(EXTRACT(EPOCH FROM fire_time) * 1000)::bigint   (ms)
--     prod:    '_f' || EXTRACT(EPOCH FROM fire_time)::bigint                 (seconds)
--   Staging carries the #S1-0013 floor-ms collision fix; prod is still pending it.
--   This file was first drafted from the PROD definition and therefore reproduced
--   the seconds form, which would have silently REVERTED the #S1-0013 fix on
--   staging. Caught by direct v2-vs-v3 comparison on staging 2026-08-13: 98 of 101
--   tickets matched byte-for-byte and 3 differed only in ticket_id
--     v2 ..._c1_f1774548424892   (ms)
--     v3 ..._c1_f1774548425      (seconds)
--   v3 now uses the floor-ms form unconditionally, which is the CORRECT behaviour
--   on both environments. Promoting v3 to prod therefore also carries the
--   #S1-0013 fix into prod for the v3 code path -- intended, but call it out in
--   the deploy notes so it is not a surprise.
--
-- ROLLOUT
--   Ships ALONGSIDE v2. Nothing calls v3 until the POS client is cut over, so
--   this migration is inert on deploy and rollback is a client-side revert.
--   Deprecate v2 once stores/useKDSStore.ts has shipped and soaked.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_kds_tickets_v3(
  p_location_id uuid,
  p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text],
  p_kds_display_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_show_server_name boolean := true;
  v_done_retention interval := interval '1 hour';
BEGIN
  SELECT COALESCE(d.show_server_name, true)
    INTO v_show_server_name
    FROM public.kds_displays d
   WHERE d.id = p_kds_display_id;

  v_show_server_name := COALESCE(v_show_server_name, true);

  SELECT COALESCE(
    jsonb_agg(
      ticket
      ORDER BY
        (
          COALESCE((ticket->>'any_rush')::boolean, false)
          OR COALESCE((ticket->>'prioritized')::boolean, false)
        ) DESC,
        ticket->>'start_time' ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      -- ticket_id MUST use floor-MILLISECOND precision. Seconds truncation is the
      -- #S1-0013 collision bug: two batches fired within the same second collapse
      -- into one ticket card and items visibly vanish from the KDS. Staging already
      -- carries the floor-ms fix; PROD DOES NOT (see the drift note in the header).
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text
        || '_f' || COALESCE(floor(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz) * 1000)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN oi_grouped.any_done_items AND NOT oi_grouped.any_active_items THEN 'done'
        WHEN NOT oi_grouped.any_active_items THEN 'cooking'
        WHEN oi_grouped.all_active_ready THEN 'ready'
        WHEN oi_grouped.any_active_sent THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_platform', COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
      'platform_order_number', o.platform_order_number,
      'server_id', COALESCE(o.created_by_staff_id, o.assigned_server_id),
      'server_name', CASE
        WHEN v_show_server_name THEN
          COALESCE(
            sp.display_name,
            NULLIF(TRIM(sp.first_name || ' ' || sp.last_name), '')
          )
        ELSE NULL
      END,
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'order_notes', o.special_instructions,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'ready_time', oi_grouped.ready_time,
      'done_time', oi_grouped.done_time,
      'item_count', oi_grouped.visible_item_count,
      'any_rush', oi_grouped.any_rush,
      'prioritized', oi_grouped.any_prioritized,
      'session_id', o.session_id,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM public.orders o
    LEFT JOIN public.staff_profiles sp
      ON sp.id = COALESCE(o.created_by_staff_id, o.assigned_server_id)
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        bool_or(
          COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status = ANY(p_statuses)
        ) AS any_active_items,
        bool_or(
          COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status = 'served'
          AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
        ) AS any_done_items,
        bool_and(
          CASE
            WHEN COALESCE(oi.is_voided, false) = false
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
              AND oi.kitchen_status = ANY(p_statuses)
            THEN oi.kitchen_status = 'ready'
            ELSE true
          END
        ) AS all_active_ready,
        bool_or(
          COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status = 'sent'
        ) AS any_active_sent,
        SUM(
          CASE
            WHEN COALESCE(oi.is_voided, false) = false
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
              AND (
                oi.kitchen_status = ANY(p_statuses)
                OR (
                  oi.kitchen_status = 'served'
                  AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
                )
              )
            THEN GREATEST(oi.quantity - COALESCE(oi.refunded_quantity, 0), 0)
            ELSE 0
          END
        )::int AS visible_item_count,
        oi.fire_time,
        MAX(oi.completed_at) FILTER (
          WHERE COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = 'ready'
        ) AS ready_time,
        MAX(COALESCE(oi.updated_at, oi.completed_at)) FILTER (
          WHERE COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = 'served'
            AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
        ) AS done_time,
        bool_or(COALESCE(oi.rush, false)) AS any_rush,
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        bool_or(
          COALESCE(oi.is_voided, false) = true
          AND NOT EXISTS (
            SELECT 1 FROM public.kds_item_status ack
            WHERE ack.order_item_id = oi.id
              AND ack.acknowledged_at IS NOT NULL
              AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
          )
        ) AS has_unacknowledged_void_notice,
        bool_or(
          COALESCE(oi.refunded_quantity, 0) > 0
          AND oi.kitchen_status NOT IN ('served', 'done', 'completed')
          AND NOT EXISTS (
            SELECT 1 FROM public.kds_item_status ack
            WHERE ack.order_item_id = oi.id
              AND ack.acknowledged_at IS NOT NULL
              AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
          )
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
            'acknowledged', EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            ),
            'is_refunded', COALESCE(oi.refunded_quantity, 0) > 0,
            'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
            'modifiers', (
              SELECT COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'modifier_name', oim.modifier_name,
                    'modifier_group_name', oim.modifier_group_name,
                    'price_modifier', oim.price_modifier,
                    'is_no', COALESCE(oim.is_no, false)
                  )
                ),
                '[]'::jsonb
              )
              FROM public.order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            )
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM public.order_items oi
      -- ===================================================================
      -- WAVE 2: the entire fix. Restrict the item set to this location's
      -- orders BEFORE any aggregation or JSON construction happens.
      -- Provably a superset of the outer WHERE (see header), so output is
      -- unchanged; only the volume of discarded work changes.
      -- ===================================================================
      JOIN public.orders scoped_o
        ON scoped_o.id = oi.order_id
       AND scoped_o.location_id = p_location_id
       AND scoped_o.status NOT IN ('cancelled', 'void', 'refunded')
      LEFT JOIN public.kds_item_status kis
        ON kis.order_item_id = oi.id
        AND p_kds_display_id IS NOT NULL
        AND kis.kds_display_id = p_kds_display_id
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
            COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = 'served'
            AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
            AND (
              p_kds_display_id IS NULL
              OR kis.id IS NOT NULL
            )
          )
          OR (
            COALESCE(oi.is_voided, false) = true
            AND NOT EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            )
          )
          OR (
            COALESCE(oi.refunded_quantity, 0) > 0
            AND oi.kitchen_status NOT IN ('served', 'done', 'completed')
            AND NOT EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            )
          )
        )
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND (
        o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
        OR (o.status = 'completed' AND oi_grouped.any_done_items)
      )
      AND (
        oi_grouped.any_active_items
        OR oi_grouped.any_done_items
        OR oi_grouped.has_unacknowledged_void_notice
        OR oi_grouped.has_unacknowledged_refund_notice
      )
  ) sub;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_kds_tickets_v3(uuid, text[], uuid) IS
  'KDS board tickets for one location. Identical output to get_kds_tickets_v2; '
  'differs only by scoping order_items to the location before aggregating, which '
  'v2 failed to do (it aggregated platform-wide then discarded). See AUD-8.';

REVOKE ALL ON FUNCTION public.get_kds_tickets_v3(uuid, text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kds_tickets_v3(uuid, text[], uuid)
  TO authenticated, service_role;

-- =============================================================================
-- ROLLBACK: DROP FUNCTION IF EXISTS public.get_kds_tickets_v3(uuid, text[], uuid);
-- v2 is untouched and remains live throughout.
-- =============================================================================
