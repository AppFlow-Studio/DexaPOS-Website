-- Bulk price adjustment RPC for the merchant menu.
-- Single-statement CTE chain so all writes are atomic. Skips rows that would
-- price below zero, returns a jsonb { updated, skipped, changes[] } payload
-- the calling server action persists in audit_logs (one row per bulk op).
--
-- Rounding modes mirror the client-side computeNewPrice() in
-- components/dashboard/menu/items/BulkPriceAdjustDialog.tsx — keep in sync.

CREATE OR REPLACE FUNCTION public.bulk_adjust_menu_item_prices(
  p_merchant_id   uuid,
  p_location_id   uuid,            -- NULL => write menu_items.price (base)
  p_item_ids      uuid[],
  p_operation     text,            -- increase_pct|decrease_pct|increase_amt|decrease_amt|set_fixed
  p_value         numeric,
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
    INSERT INTO location_item_overrides (location_id, menu_item_id, custom_price, updated_at)
    SELECT p_location_id, v.id, v.new_price, now()
      FROM valid v
     WHERE p_location_id IS NOT NULL
    ON CONFLICT (location_id, menu_item_id)
    DO UPDATE SET custom_price = EXCLUDED.custom_price,
                  updated_at   = now()
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
