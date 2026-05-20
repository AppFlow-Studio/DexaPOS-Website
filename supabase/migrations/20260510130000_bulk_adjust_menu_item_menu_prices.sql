-- Bulk menu-level (L5) price adjustment RPCs.
--
-- These mirror bulk_adjust_menu_item_prices / bulk_adjust_menu_item_delivery_prices
-- but target location_menu_item_overrides (L5), the most specific level in the
-- 5-level cascade: (location_id, menu_id, category_id, menu_item_id).
--
-- Fan-out: when p_location_id IS NULL all merchant locations are written so the
-- adjustment covers "this menu at every location".  When p_location_id is given
-- only that single location row is written.
--
-- Reset nulls only the relevant price column; other columns on the same row
-- (is_available, stock_tracking_mode, custom_delivery_price, etc.) are preserved.
--
-- Markup for the delivery RPC is always re-computed from the current effective
-- card price (L5 card → L4 → L3 → L2 → L1 cascade), never compounded over the
-- existing delivery price.  This matches the behaviour of
-- bulk_adjust_menu_item_delivery_prices at the L1/L2 level.
--
-- Changes payload reports one row per item (not per location) so the audit log
-- stays compact for the fan-out case.

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 1: bulk_adjust_menu_item_menu_prices  (card price, L5)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_adjust_menu_item_menu_prices(
  p_merchant_id   uuid,
  p_menu_id       uuid,
  p_location_id   uuid,            -- NULL ⇒ fan-out across all merchant locations
  p_item_ids      uuid[],
  p_operation     text,            -- increase_pct|decrease_pct|increase_amt|decrease_amt|set_fixed|reset
  p_value         numeric,         -- ignored for reset
  p_rounding      text,            -- cent|nickel_up|ninety_nine_up
  p_actor_user_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '[]'::jsonb;
  v_updated int   := 0;
  v_skipped int   := 0;
BEGIN
  IF p_operation NOT IN ('increase_pct','decrease_pct','increase_amt','decrease_amt','set_fixed','reset') THEN
    RAISE EXCEPTION 'invalid operation: %', p_operation;
  END IF;
  IF p_rounding NOT IN ('cent','nickel_up','ninety_nine_up') THEN
    RAISE EXCEPTION 'invalid rounding: %', p_rounding;
  END IF;
  IF p_operation <> 'reset' AND (p_value IS NULL OR p_value < 0) THEN
    RAISE EXCEPTION 'value must be non-negative';
  END IF;
  IF array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('updated', 0, 'skipped', 0, 'changes', '[]'::jsonb);
  END IF;

  -- ── RESET branch ────────────────────────────────────────────────────────────
  IF p_operation = 'reset' THEN
    WITH locs AS (
      SELECT id AS location_id
        FROM locations
       WHERE merchant_id = p_merchant_id
         AND (p_location_id IS NULL OR id = p_location_id)
    ),
    reset_rows AS (
      UPDATE location_menu_item_overrides lmio
         SET custom_price = NULL,
             updated_at   = now()
        FROM locs
       WHERE lmio.location_id  = locs.location_id
         AND lmio.menu_id      = p_menu_id
         AND lmio.menu_item_id = ANY(p_item_ids)
         AND lmio.custom_price IS NOT NULL
      RETURNING lmio.menu_item_id
    ),
    distinct_reset AS (
      SELECT DISTINCT menu_item_id FROM reset_rows
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'item_id',   dr.menu_item_id,
        'name',      mi.name,
        'old_price', NULL,
        'new_price', NULL
      )), '[]'::jsonb),
      COUNT(*)
      INTO v_changes, v_updated
      FROM distinct_reset dr
      JOIN menu_items mi ON mi.id = dr.menu_item_id;

    RETURN jsonb_build_object(
      'updated', COALESCE(v_updated, 0),
      'skipped', 0,
      'changes', COALESCE(v_changes, '[]'::jsonb)
    );
  END IF;

  -- ── MARKUP / SET_FIXED branch ─────────────────────────────────────────────
  WITH item_cats AS (
    -- Resolve one (item, category) pair per item within this menu.
    -- DISTINCT ON handles the edge-case where an item appears in
    -- multiple categories of the same menu.
    SELECT DISTINCT ON (ci.menu_item_id)
           ci.menu_item_id,
           ci.category_id
      FROM menu_categories mc
      JOIN category_items ci ON ci.category_id = mc.category_id
     WHERE mc.menu_id     = p_menu_id
       AND mc.merchant_id = p_merchant_id
       AND ci.menu_item_id = ANY(p_item_ids)
     ORDER BY ci.menu_item_id
  ),
  target_locs AS (
    SELECT id AS location_id
      FROM locations
     WHERE merchant_id = p_merchant_id
       AND (p_location_id IS NULL OR id = p_location_id)
  ),
  base AS (
    SELECT
      ic.menu_item_id,
      ic.category_id,
      tl.location_id,
      mi.name,
      -- Effective card price at L5→L4→L3→L2→L1 (old price for audit & markup base)
      COALESCE(
        lmio.custom_price,
        lcio.custom_price,
        ci_prices.custom_price,
        lio.custom_price,
        mi.price
      ) AS old_price,
      CASE p_operation
        WHEN 'increase_pct' THEN
          COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price)
            * (1 + p_value / 100.0)
        WHEN 'decrease_pct' THEN
          COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price)
            * (1 - p_value / 100.0)
        WHEN 'increase_amt' THEN
          COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price)
            + p_value
        WHEN 'decrease_amt' THEN
          COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price)
            - p_value
        WHEN 'set_fixed' THEN p_value
      END AS raw_price
    FROM item_cats ic
    CROSS JOIN target_locs tl
    JOIN menu_items mi
      ON mi.id = ic.menu_item_id
     AND mi.merchant_id = p_merchant_id
    LEFT JOIN location_menu_item_overrides lmio
      ON lmio.menu_item_id = ic.menu_item_id
     AND lmio.location_id  = tl.location_id
     AND lmio.menu_id      = p_menu_id
    LEFT JOIN location_category_item_overrides lcio
      ON lcio.menu_item_id = ic.menu_item_id
     AND lcio.location_id  = tl.location_id
     AND lcio.category_id  = ic.category_id
    LEFT JOIN category_items ci_prices
      ON ci_prices.menu_item_id = ic.menu_item_id
     AND ci_prices.category_id  = ic.category_id
    LEFT JOIN location_item_overrides lio
      ON lio.menu_item_id = ic.menu_item_id
     AND lio.location_id  = tl.location_id
  ),
  rounded AS (
    SELECT
      menu_item_id,
      category_id,
      location_id,
      name,
      old_price,
      CASE p_rounding
        WHEN 'cent'      THEN ROUND(raw_price, 2)
        WHEN 'nickel_up' THEN CEIL(raw_price * 20) / 20.0
        WHEN 'ninety_nine_up' THEN
          CASE
            WHEN raw_price <= FLOOR(raw_price) + 0.99 THEN FLOOR(raw_price) + 0.99
            ELSE FLOOR(raw_price) + 1.99
          END
      END AS new_price
    FROM base
  ),
  valid AS (
    SELECT * FROM rounded WHERE new_price >= 0
  ),
  upserted AS (
    INSERT INTO location_menu_item_overrides
      (location_id, menu_id, category_id, menu_item_id, custom_price, updated_at)
    SELECT v.location_id, p_menu_id, v.category_id, v.menu_item_id, v.new_price, now()
      FROM valid v
    ON CONFLICT (location_id, menu_id, menu_item_id)
    DO UPDATE SET custom_price = EXCLUDED.custom_price,
                  updated_at   = now()
    RETURNING menu_item_id
  ),
  -- Force upserted CTE to materialise before totals reads valid counts.
  applied AS (
    SELECT 1 AS x FROM upserted
  ),
  -- One audit row per item (not per location) to keep the payload compact.
  distinct_items AS (
    SELECT DISTINCT ON (menu_item_id)
           menu_item_id, name, old_price, new_price
      FROM valid
     ORDER BY menu_item_id
  ),
  totals AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'item_id',   di.menu_item_id,
        'name',      di.name,
        'old_price', di.old_price,
        'new_price', di.new_price
      )), '[]'::jsonb)                                                     AS changes_json,
      (SELECT count(DISTINCT menu_item_id) FROM valid)::int                AS updated_count,
      ((SELECT count(DISTINCT menu_item_id) FROM rounded)
         - (SELECT count(DISTINCT menu_item_id) FROM valid))::int          AS skipped_count
    FROM distinct_items di
  )
  SELECT t.changes_json, t.updated_count, t.skipped_count
    INTO v_changes, v_updated, v_skipped
  FROM totals t, (SELECT count(*) FROM applied) _force;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'changes', v_changes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_adjust_menu_item_menu_prices(
  uuid, uuid, uuid, uuid[], text, numeric, text, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.bulk_adjust_menu_item_menu_prices(
  uuid, uuid, uuid, uuid[], text, numeric, text, text
) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 2: bulk_adjust_menu_item_menu_delivery_prices  (delivery price, L5)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_adjust_menu_item_menu_delivery_prices(
  p_merchant_id   uuid,
  p_menu_id       uuid,
  p_location_id   uuid,            -- NULL ⇒ fan-out across all merchant locations
  p_item_ids      uuid[],
  p_operation     text,            -- markup_pct|markup_amt|set_fixed|reset
  p_value         numeric,         -- ignored for reset
  p_rounding      text,            -- cent|nickel_up|ninety_nine_up
  p_actor_user_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '[]'::jsonb;
  v_updated int   := 0;
  v_skipped int   := 0;
BEGIN
  IF p_operation NOT IN ('markup_pct','markup_amt','set_fixed','reset') THEN
    RAISE EXCEPTION 'invalid operation: %', p_operation;
  END IF;
  IF p_rounding NOT IN ('cent','nickel_up','ninety_nine_up') THEN
    RAISE EXCEPTION 'invalid rounding: %', p_rounding;
  END IF;
  IF p_operation <> 'reset' AND (p_value IS NULL OR p_value < 0) THEN
    RAISE EXCEPTION 'value must be non-negative';
  END IF;
  IF array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('updated', 0, 'skipped', 0, 'changes', '[]'::jsonb);
  END IF;

  -- ── RESET branch ────────────────────────────────────────────────────────────
  IF p_operation = 'reset' THEN
    WITH locs AS (
      SELECT id AS location_id
        FROM locations
       WHERE merchant_id = p_merchant_id
         AND (p_location_id IS NULL OR id = p_location_id)
    ),
    reset_rows AS (
      UPDATE location_menu_item_overrides lmio
         SET custom_delivery_price = NULL,
             updated_at            = now()
        FROM locs
       WHERE lmio.location_id  = locs.location_id
         AND lmio.menu_id      = p_menu_id
         AND lmio.menu_item_id = ANY(p_item_ids)
         AND lmio.custom_delivery_price IS NOT NULL
      RETURNING lmio.menu_item_id
    ),
    distinct_reset AS (
      SELECT DISTINCT menu_item_id FROM reset_rows
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'item_id',   dr.menu_item_id,
        'name',      mi.name,
        'old_price', NULL,
        'new_price', NULL
      )), '[]'::jsonb),
      COUNT(*)
      INTO v_changes, v_updated
      FROM distinct_reset dr
      JOIN menu_items mi ON mi.id = dr.menu_item_id;

    RETURN jsonb_build_object(
      'updated', COALESCE(v_updated, 0),
      'skipped', 0,
      'changes', COALESCE(v_changes, '[]'::jsonb)
    );
  END IF;

  -- ── MARKUP / SET_FIXED branch ─────────────────────────────────────────────
  WITH item_cats AS (
    SELECT DISTINCT ON (ci.menu_item_id)
           ci.menu_item_id,
           ci.category_id
      FROM menu_categories mc
      JOIN category_items ci ON ci.category_id = mc.category_id
     WHERE mc.menu_id     = p_menu_id
       AND mc.merchant_id = p_merchant_id
       AND ci.menu_item_id = ANY(p_item_ids)
     ORDER BY ci.menu_item_id
  ),
  target_locs AS (
    SELECT id AS location_id
      FROM locations
     WHERE merchant_id = p_merchant_id
       AND (p_location_id IS NULL OR id = p_location_id)
  ),
  base AS (
    SELECT
      ic.menu_item_id,
      ic.category_id,
      tl.location_id,
      mi.name,
      -- Card price cascade (L5→L4→L3→L2→L1): markup is always from card price.
      COALESCE(
        lmio.custom_price,
        lcio.custom_price,
        ci_prices.custom_price,
        lio.custom_price,
        mi.price
      ) AS card_price,
      -- Current delivery price at L5 (for audit "old_price").
      lmio.custom_delivery_price AS old_delivery,
      CASE p_operation
        WHEN 'markup_pct' THEN
          COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price)
            * (1 + p_value / 100.0)
        WHEN 'markup_amt' THEN
          COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price)
            + p_value
        WHEN 'set_fixed' THEN p_value
      END AS raw_price
    FROM item_cats ic
    CROSS JOIN target_locs tl
    JOIN menu_items mi
      ON mi.id = ic.menu_item_id
     AND mi.merchant_id = p_merchant_id
    LEFT JOIN location_menu_item_overrides lmio
      ON lmio.menu_item_id = ic.menu_item_id
     AND lmio.location_id  = tl.location_id
     AND lmio.menu_id      = p_menu_id
    LEFT JOIN location_category_item_overrides lcio
      ON lcio.menu_item_id = ic.menu_item_id
     AND lcio.location_id  = tl.location_id
     AND lcio.category_id  = ic.category_id
    LEFT JOIN category_items ci_prices
      ON ci_prices.menu_item_id = ic.menu_item_id
     AND ci_prices.category_id  = ic.category_id
    LEFT JOIN location_item_overrides lio
      ON lio.menu_item_id = ic.menu_item_id
     AND lio.location_id  = tl.location_id
  ),
  rounded AS (
    SELECT
      menu_item_id,
      category_id,
      location_id,
      name,
      old_delivery,
      CASE p_rounding
        WHEN 'cent'      THEN ROUND(raw_price, 2)
        WHEN 'nickel_up' THEN CEIL(raw_price * 20) / 20.0
        WHEN 'ninety_nine_up' THEN
          CASE
            WHEN raw_price <= FLOOR(raw_price) + 0.99 THEN FLOOR(raw_price) + 0.99
            ELSE FLOOR(raw_price) + 1.99
          END
      END AS new_price
    FROM base
  ),
  valid AS (
    SELECT * FROM rounded WHERE new_price >= 0
  ),
  upserted AS (
    INSERT INTO location_menu_item_overrides
      (location_id, menu_id, category_id, menu_item_id, custom_delivery_price, updated_at)
    SELECT v.location_id, p_menu_id, v.category_id, v.menu_item_id, v.new_price, now()
      FROM valid v
    ON CONFLICT (location_id, menu_id, menu_item_id)
    DO UPDATE SET custom_delivery_price = EXCLUDED.custom_delivery_price,
                  updated_at            = now()
    RETURNING menu_item_id
  ),
  applied AS (
    SELECT 1 AS x FROM upserted
  ),
  distinct_items AS (
    SELECT DISTINCT ON (menu_item_id)
           menu_item_id, name, old_delivery, new_price
      FROM valid
     ORDER BY menu_item_id
  ),
  totals AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'item_id',   di.menu_item_id,
        'name',      di.name,
        'old_price', di.old_delivery,
        'new_price', di.new_price
      )), '[]'::jsonb)                                                     AS changes_json,
      (SELECT count(DISTINCT menu_item_id) FROM valid)::int                AS updated_count,
      ((SELECT count(DISTINCT menu_item_id) FROM rounded)
         - (SELECT count(DISTINCT menu_item_id) FROM valid))::int          AS skipped_count
    FROM distinct_items di
  )
  SELECT t.changes_json, t.updated_count, t.skipped_count
    INTO v_changes, v_updated, v_skipped
  FROM totals t, (SELECT count(*) FROM applied) _force;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'changes', v_changes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_adjust_menu_item_menu_delivery_prices(
  uuid, uuid, uuid, uuid[], text, numeric, text, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.bulk_adjust_menu_item_menu_delivery_prices(
  uuid, uuid, uuid, uuid[], text, numeric, text, text
) TO authenticated, service_role;
