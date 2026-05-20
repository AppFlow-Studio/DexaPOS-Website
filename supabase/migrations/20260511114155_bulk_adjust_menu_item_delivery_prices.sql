-- Bulk delivery (online) price adjustment RPC.
CREATE OR REPLACE VIEW public.v_location_menu_items AS
SELECT
  m.id              AS menu_id,
  m.merchant_id,
  m.name            AS menu_name,
  mim.id            AS menu_item_menu_id,
  mim.display_order,
  mi.id             AS menu_item_id,
  mi.name           AS item_name,
  mi.description,
  mi.image,
  mi.meal_types,
  mi.allergens,
  mi.card_bg_color,
  mi.price          AS base_price,
  mi.cash_price     AS base_cash_price,
  mim.custom_price        AS menu_price,
  mim.custom_cash_price   AS menu_cash_price,
  mim.is_available        AS menu_available,
  l.id              AS location_id,
  l.name            AS location_name,
  lmio.custom_price          AS location_price,
  lmio.custom_cash_price     AS location_cash_price,
  lmio.is_available          AS location_available,
  lmio.stock_tracking_mode   AS location_stock_mode,
  COALESCE(lmio.custom_price,      mim.custom_price,      mi.price)      AS effective_price,
  COALESCE(lmio.custom_cash_price, mim.custom_cash_price, mi.cash_price) AS effective_cash_price,
  COALESCE(lmio.is_available, mim.is_available, mi.availability) AS effective_available,
  COALESCE(lmio.stock_tracking_mode, mi.stock_tracking_mode)     AS effective_stock_mode,
  (lmio.id IS NOT NULL) AS has_location_override,
  mi.delivery_price          AS base_delivery_price,
  mi.use_delivery_price      AS use_delivery_price,
  lmio.custom_delivery_price AS location_delivery_price,
  COALESCE(
    lmio.custom_delivery_price,
    lio.custom_delivery_price,
    CASE WHEN mi.use_delivery_price THEN mi.delivery_price END,
    COALESCE(lmio.custom_price, mim.custom_price, mi.price)
  ) AS effective_delivery_price
FROM public.menus m
JOIN public.menu_item_menus mim ON mim.menu_id = m.id
JOIN public.menu_items mi      ON mi.id       = mim.menu_item_id
CROSS JOIN public.locations l
LEFT JOIN public.location_menu_item_overrides lmio
  ON lmio.menu_item_id = mi.id
 AND lmio.location_id  = l.id
LEFT JOIN public.location_item_overrides lio
  ON lio.menu_item_id = mi.id
 AND lio.location_id  = l.id
WHERE l.merchant_id = m.merchant_id;

ALTER VIEW public.v_location_menu_items SET (security_invoker = true);
ALTER VIEW public.v_location_menu_items OWNER TO postgres;

GRANT ALL ON TABLE public.v_location_menu_items TO anon;
GRANT ALL ON TABLE public.v_location_menu_items TO authenticated;
GRANT ALL ON TABLE public.v_location_menu_items TO service_role;

CREATE OR REPLACE FUNCTION public.bulk_adjust_menu_item_delivery_prices(
  p_merchant_id   uuid,
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

  IF p_operation = 'reset' THEN
    IF p_location_id IS NULL THEN
      WITH reset AS (
        UPDATE menu_items mi
           SET delivery_price     = NULL,
               use_delivery_price = false,
               updated_at         = now(),
               version            = mi.version + 1
         WHERE mi.id = ANY(p_item_ids)
           AND mi.merchant_id = p_merchant_id
        RETURNING mi.id, mi.name
      )
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
          'item_id', id, 'name', name, 'old_price', NULL, 'new_price', NULL
        )), '[]'::jsonb),
        COUNT(*)
        INTO v_changes, v_updated
        FROM reset;
    ELSE
      WITH reset AS (
        UPDATE location_item_overrides lio
           SET custom_delivery_price = NULL,
               updated_at            = now()
          FROM menu_items mi
         WHERE lio.menu_item_id = mi.id
           AND mi.merchant_id   = p_merchant_id
           AND lio.location_id  = p_location_id
           AND lio.menu_item_id = ANY(p_item_ids)
        RETURNING mi.id, mi.name
      )
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
          'item_id', id, 'name', name, 'old_price', NULL, 'new_price', NULL
        )), '[]'::jsonb),
        COUNT(*)
        INTO v_changes, v_updated
        FROM reset;
    END IF;

    RETURN jsonb_build_object(
      'updated', COALESCE(v_updated, 0),
      'skipped', 0,
      'changes', COALESCE(v_changes, '[]'::jsonb)
    );
  END IF;

  WITH base AS (
    SELECT
      mi.id,
      mi.name,
      CASE
        WHEN p_location_id IS NULL THEN mi.price
        ELSE COALESCE(lio.custom_price, mi.price)
      END AS card_price,
      CASE
        WHEN p_location_id IS NULL THEN mi.delivery_price
        ELSE lio.custom_delivery_price
      END AS old_delivery,
      CASE p_operation
        WHEN 'markup_pct' THEN
          (CASE WHEN p_location_id IS NULL THEN mi.price ELSE COALESCE(lio.custom_price, mi.price) END)
            * (1 + p_value / 100.0)
        WHEN 'markup_amt' THEN
          (CASE WHEN p_location_id IS NULL THEN mi.price ELSE COALESCE(lio.custom_price, mi.price) END)
            + p_value
        WHEN 'set_fixed' THEN p_value
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
  upd_base AS (
    UPDATE menu_items mi
       SET delivery_price     = v.new_price,
           use_delivery_price = true,
           updated_at         = now(),
           version            = mi.version + 1
      FROM valid v
     WHERE mi.id = v.id
       AND p_location_id IS NULL
    RETURNING mi.id
  ),
  upd_ovr AS (
    INSERT INTO location_item_overrides (location_id, menu_item_id, custom_delivery_price, updated_at)
    SELECT p_location_id, v.id, v.new_price, now()
      FROM valid v
     WHERE p_location_id IS NOT NULL
    ON CONFLICT (location_id, menu_item_id)
    DO UPDATE SET custom_delivery_price = EXCLUDED.custom_delivery_price,
                  updated_at            = now()
    RETURNING menu_item_id
  ),
  applied AS (
    SELECT 1 AS x FROM upd_base
    UNION ALL
    SELECT 1 FROM upd_ovr
  ),
  totals AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'item_id',   v.id,
        'name',      v.name,
        'old_price', v.old_delivery,
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

REVOKE ALL ON FUNCTION public.bulk_adjust_menu_item_delivery_prices(
  uuid, uuid, uuid[], text, numeric, text, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.bulk_adjust_menu_item_delivery_prices(
  uuid, uuid, uuid[], text, numeric, text, text
) TO authenticated, service_role;;
