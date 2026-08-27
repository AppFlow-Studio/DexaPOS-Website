-- Revert dual pricing to the CASH-AS-BASE (surcharge) model.
--
-- 78ba2f38 switched the web dashboard to a cash-DISCOUNT model
--     cash = card * (1 - pct/100)      ($10 card -> $9.60 cash)
-- but the intended model (and what the POS already does, see
-- 20260706130000_open_item_dual_pricing_inverse.sql) is cash-as-base:
--     card = cash * (1 + pct/100)      ($10 cash -> $10.40 card)
--     cash = card / (1 + pct/100)      (exact inverse)
--
-- This migration:
--   (a) redefines the two bulk-adjust RPCs to derive cash with the inverse; and
--   (b) backfills stored cash prices as cash = floor2( card / (1 + pct/100) ),
--       keeping card prices as the anchor (menu/card prices do NOT change).
--
-- The backfill only touches rows that already have a cash value AND a card
-- anchor, so NULL (inherited) cash stays NULL. It is idempotent: re-running
-- recomputes the same cash from the unchanged card. Postgres numeric is exact
-- decimal, so no epsilon nudge is needed here (unlike the JS helper).

-- ===========================================================================
-- (a) RPC redefinitions — only the cash-derivation expression changes vs
--     20260825030247_bulk_adjust_dual_pricing_cash.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Item-level bulk adjust (base price OR L2 location override)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_adjust_menu_item_prices(
  p_merchant_id   uuid,
  p_location_id   uuid,            -- NULL => write menu_items.price (base)
  p_item_ids      uuid[],
  p_operation     text,
  p_value         numeric,
  p_rounding      text,
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
  v_is_dual boolean := false;
  v_pct     numeric := 0;
BEGIN
  IF p_operation NOT IN ('increase_pct','decrease_pct','increase_amt','decrease_amt','set_fixed') THEN
    RAISE EXCEPTION 'invalid operation: %', p_operation;
  END IF;
  IF p_rounding NOT IN ('cent','nickel_up','ninety_nine_up') THEN
    RAISE EXCEPTION 'invalid rounding: %', p_rounding;
  END IF;
  IF p_value < 0 THEN
    RAISE EXCEPTION 'value must be non-negative';
  END IF;
  IF array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('updated', 0, 'skipped', 0, 'changes', '[]'::jsonb);
  END IF;

  -- Dual-pricing config for the single target location (override scope only).
  IF p_location_id IS NOT NULL THEN
    SELECT (pricing_strategy = 'dual'), COALESCE(dual_pricing_percentage, 0)
      INTO v_is_dual, v_pct
      FROM locations
     WHERE id = p_location_id;
  END IF;

  WITH base AS (
    SELECT
      mi.id,
      mi.name,
      COALESCE(lio.custom_price, mi.price)::numeric AS old_price,
      CASE p_operation
        WHEN 'increase_pct' THEN COALESCE(lio.custom_price, mi.price) * (1 + p_value / 100.0)
        WHEN 'decrease_pct' THEN COALESCE(lio.custom_price, mi.price) * (1 - p_value / 100.0)
        WHEN 'increase_amt' THEN COALESCE(lio.custom_price, mi.price) + p_value
        WHEN 'decrease_amt' THEN COALESCE(lio.custom_price, mi.price) - p_value
        WHEN 'set_fixed'    THEN p_value
      END AS raw_price
    FROM menu_items mi
    LEFT JOIN location_item_overrides lio
      ON lio.menu_item_id = mi.id
     AND lio.location_id  = p_location_id
    WHERE mi.id = ANY(p_item_ids)
      AND mi.merchant_id = p_merchant_id
  ),
  rounded AS (
    SELECT
      id,
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
  upd_base AS (
    UPDATE menu_items mi
       SET price       = v.new_price,
           updated_at  = now(),
           version     = mi.version + 1
      FROM valid v
     WHERE mi.id = v.id
       AND p_location_id IS NULL
    RETURNING mi.id
  ),
  upd_ovr AS (
    INSERT INTO location_item_overrides (location_id, menu_item_id, custom_price, custom_cash_price, updated_at)
    SELECT
      p_location_id,
      v.id,
      v.new_price,
      -- Cash-as-base (surcharge) inverse: cash = card / (1 + pct/100).
      CASE WHEN v_is_dual AND v_pct > 0
           THEN floor(v.new_price / (1 + v_pct / 100.0) * 100) / 100
           ELSE NULL END,
      now()
      FROM valid v
     WHERE p_location_id IS NOT NULL
    ON CONFLICT (location_id, menu_item_id)
    DO UPDATE SET custom_price      = EXCLUDED.custom_price,
                  -- Only (re)derive cash for dual locations; never clobber an
                  -- existing manual cash value on non-dual locations.
                  custom_cash_price = CASE WHEN v_is_dual AND v_pct > 0
                                           THEN EXCLUDED.custom_cash_price
                                           ELSE location_item_overrides.custom_cash_price END,
                  updated_at        = now()
    RETURNING menu_item_id
  ),
  -- Force CTE materialization so the UPDATE/UPSERT actually run.
  applied AS (
    SELECT 1 AS x
      FROM upd_base
    UNION ALL
    SELECT 1 FROM upd_ovr
  ),
  totals AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'item_id',   v.id,
        'name',      v.name,
        'old_price', v.old_price,
        'new_price', v.new_price
      )), '[]'::jsonb) AS changes_json,
      (SELECT count(*) FROM valid)                                  AS updated_count,
      (SELECT count(*) FROM rounded) - (SELECT count(*) FROM valid) AS skipped_count
    FROM valid v
  )
  SELECT t.changes_json, t.updated_count::int, t.skipped_count::int
    INTO v_changes, v_updated, v_skipped
  FROM totals t, (SELECT count(*) FROM applied) a;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'changes', v_changes
  );
END;
$$;
REVOKE ALL ON FUNCTION public.bulk_adjust_menu_item_prices(
  uuid, uuid, uuid[], text, numeric, text, text
) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_adjust_menu_item_prices(
  uuid, uuid, uuid[], text, numeric, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Menu-level (L5) bulk adjust — fans out one override row per location
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_adjust_menu_item_menu_prices(
  p_merchant_id   uuid,
  p_menu_id       uuid,
  p_location_id   uuid,
  p_item_ids      uuid[],
  p_operation     text,
  p_value         numeric,
  p_rounding      text,
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

  IF p_operation = 'reset' THEN
    WITH locs AS (
      SELECT id AS location_id FROM locations
       WHERE merchant_id = p_merchant_id
         AND (p_location_id IS NULL OR id = p_location_id)
    ),
    reset_rows AS (
      -- Reset clears BOTH card and cash so the item inherits consistently.
      UPDATE location_menu_item_overrides lmio
         SET custom_price = NULL, custom_cash_price = NULL, updated_at = now()
        FROM locs
       WHERE lmio.location_id  = locs.location_id
         AND lmio.menu_id      = p_menu_id
         AND lmio.menu_item_id = ANY(p_item_ids)
         AND lmio.custom_price IS NOT NULL
      RETURNING lmio.menu_item_id
    ),
    distinct_reset AS (SELECT DISTINCT menu_item_id FROM reset_rows)
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object('item_id', dr.menu_item_id, 'name', mi.name, 'old_price', NULL, 'new_price', NULL)), '[]'::jsonb),
      COUNT(*)
      INTO v_changes, v_updated
      FROM distinct_reset dr JOIN menu_items mi ON mi.id = dr.menu_item_id;

    RETURN jsonb_build_object('updated', COALESCE(v_updated, 0), 'skipped', 0, 'changes', COALESCE(v_changes, '[]'::jsonb));
  END IF;

  WITH item_cats AS (
    SELECT DISTINCT ON (ci.menu_item_id) ci.menu_item_id, ci.category_id
      FROM menu_categories mc JOIN category_items ci ON ci.category_id = mc.category_id
     WHERE mc.menu_id = p_menu_id AND mc.merchant_id = p_merchant_id AND ci.menu_item_id = ANY(p_item_ids)
     ORDER BY ci.menu_item_id
  ),
  target_locs AS (
    SELECT id AS location_id,
           (pricing_strategy = 'dual') AS is_dual,
           COALESCE(dual_pricing_percentage, 0) AS dpp
      FROM locations
     WHERE merchant_id = p_merchant_id AND (p_location_id IS NULL OR id = p_location_id)
  ),
  base AS (
    SELECT ic.menu_item_id, ic.category_id, tl.location_id, tl.is_dual, tl.dpp, mi.name,
      COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price) AS old_price,
      CASE p_operation
        WHEN 'increase_pct' THEN COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price) * (1 + p_value / 100.0)
        WHEN 'decrease_pct' THEN COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price) * (1 - p_value / 100.0)
        WHEN 'increase_amt' THEN COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price) + p_value
        WHEN 'decrease_amt' THEN COALESCE(lmio.custom_price, lcio.custom_price, ci_prices.custom_price, lio.custom_price, mi.price) - p_value
        WHEN 'set_fixed' THEN p_value
      END AS raw_price
    FROM item_cats ic CROSS JOIN target_locs tl
    JOIN menu_items mi ON mi.id = ic.menu_item_id AND mi.merchant_id = p_merchant_id
    LEFT JOIN location_menu_item_overrides lmio ON lmio.menu_item_id = ic.menu_item_id AND lmio.location_id = tl.location_id AND lmio.menu_id = p_menu_id
    LEFT JOIN location_category_item_overrides lcio ON lcio.menu_item_id = ic.menu_item_id AND lcio.location_id = tl.location_id AND lcio.category_id = ic.category_id
    LEFT JOIN category_items ci_prices ON ci_prices.menu_item_id = ic.menu_item_id AND ci_prices.category_id = ic.category_id
    LEFT JOIN location_item_overrides lio ON lio.menu_item_id = ic.menu_item_id AND lio.location_id = tl.location_id
  ),
  rounded AS (
    SELECT menu_item_id, category_id, location_id, is_dual, dpp, name, old_price,
      CASE p_rounding
        WHEN 'cent' THEN ROUND(raw_price, 2)
        WHEN 'nickel_up' THEN CEIL(raw_price * 20) / 20.0
        WHEN 'ninety_nine_up' THEN CASE WHEN raw_price <= FLOOR(raw_price) + 0.99 THEN FLOOR(raw_price) + 0.99 ELSE FLOOR(raw_price) + 1.99 END
      END AS new_price
    FROM base
  ),
  valid AS (SELECT * FROM rounded WHERE new_price >= 0),
  upserted AS (
    INSERT INTO location_menu_item_overrides (location_id, menu_id, category_id, menu_item_id, custom_price, custom_cash_price, updated_at)
    SELECT v.location_id, p_menu_id, v.category_id, v.menu_item_id, v.new_price,
           -- Cash-as-base (surcharge) inverse: cash = card / (1 + pct/100).
           CASE WHEN v.is_dual AND v.dpp > 0
                THEN floor(v.new_price / (1 + v.dpp / 100.0) * 100) / 100
                ELSE NULL END,
           now()
      FROM valid v
    ON CONFLICT (location_id, menu_id, menu_item_id)
    DO UPDATE SET custom_price      = EXCLUDED.custom_price,
                  -- EXCLUDED cash is non-null only for dual locations; preserve
                  -- any existing value on manual locations.
                  custom_cash_price = CASE WHEN EXCLUDED.custom_cash_price IS NOT NULL
                                           THEN EXCLUDED.custom_cash_price
                                           ELSE location_menu_item_overrides.custom_cash_price END,
                  updated_at        = now()
    RETURNING menu_item_id
  ),
  applied AS (SELECT 1 AS x FROM upserted),
  distinct_items AS (SELECT DISTINCT ON (menu_item_id) menu_item_id, name, old_price, new_price FROM valid ORDER BY menu_item_id),
  totals AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object('item_id', di.menu_item_id, 'name', di.name, 'old_price', di.old_price, 'new_price', di.new_price)), '[]'::jsonb) AS changes_json,
      (SELECT count(DISTINCT menu_item_id) FROM valid)::int AS updated_count,
      ((SELECT count(DISTINCT menu_item_id) FROM rounded) - (SELECT count(DISTINCT menu_item_id) FROM valid))::int AS skipped_count
    FROM distinct_items di
  )
  SELECT t.changes_json, t.updated_count, t.skipped_count INTO v_changes, v_updated, v_skipped
  FROM totals t, (SELECT count(*) FROM applied) _force;

  RETURN jsonb_build_object('updated', v_updated, 'skipped', v_skipped, 'changes', v_changes);
END;
$$;
REVOKE ALL ON FUNCTION public.bulk_adjust_menu_item_menu_prices(uuid, uuid, uuid, uuid[], text, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_adjust_menu_item_menu_prices(uuid, uuid, uuid, uuid[], text, numeric, text, text) TO authenticated, service_role;

-- ===========================================================================
-- (b) One-shot backfill — recompute stored cash from the card anchor using the
--     surcharge inverse: cash = floor2( card / (1 + pct/100) ). Card unchanged.
--     Only rows with an existing cash value AND a card anchor are touched.
-- ===========================================================================

-- L2: per-location item overrides (location's own dual %)
UPDATE location_item_overrides o
   SET custom_cash_price = floor(o.custom_price / (1 + l.dual_pricing_percentage / 100.0) * 100) / 100,
       updated_at        = now()
  FROM locations l
 WHERE o.location_id = l.id
   AND l.pricing_strategy = 'dual'
   AND l.dual_pricing_percentage > 0
   AND o.custom_price IS NOT NULL
   AND o.custom_cash_price IS NOT NULL;

-- L5: per-location + per-menu overrides (location's own dual %)
UPDATE location_menu_item_overrides o
   SET custom_cash_price = floor(o.custom_price / (1 + l.dual_pricing_percentage / 100.0) * 100) / 100,
       updated_at        = now()
  FROM locations l
 WHERE o.location_id = l.id
   AND l.pricing_strategy = 'dual'
   AND l.dual_pricing_percentage > 0
   AND o.custom_price IS NOT NULL
   AND o.custom_cash_price IS NOT NULL;

-- L4: per-location + per-category overrides (location's own dual %)
UPDATE location_category_item_overrides o
   SET custom_cash_price = floor(o.custom_price / (1 + l.dual_pricing_percentage / 100.0) * 100) / 100,
       updated_at        = now()
  FROM locations l
 WHERE o.location_id = l.id
   AND l.pricing_strategy = 'dual'
   AND l.dual_pricing_percentage > 0
   AND o.custom_price IS NOT NULL
   AND o.custom_cash_price IS NOT NULL;

-- L1 global item cash (merchant's default dual %). Card anchor = menu_items.price.
UPDATE menu_items mi
   SET cash_price  = floor(mi.price / (1 + m.dual_pricing_percentage / 100.0) * 100) / 100,
       updated_at  = now()
  FROM merchants m
 WHERE mi.merchant_id = m.id
   AND m.pricing_strategy = 'dual'
   AND m.dual_pricing_percentage > 0
   AND mi.price IS NOT NULL
   AND mi.cash_price IS NOT NULL;

-- L3 global category-item cash (merchant's default dual %). Card anchor =
-- category custom_price, falling back to the item's base price.
UPDATE category_items ci
   SET custom_cash_price = floor(COALESCE(ci.custom_price, mi.price) / (1 + m.dual_pricing_percentage / 100.0) * 100) / 100,
       updated_at        = now()
  FROM merchants m, menu_items mi
 WHERE ci.merchant_id = m.id
   AND ci.menu_item_id = mi.id
   AND m.pricing_strategy = 'dual'
   AND m.dual_pricing_percentage > 0
   AND COALESCE(ci.custom_price, mi.price) IS NOT NULL
   AND ci.custom_cash_price IS NOT NULL;
