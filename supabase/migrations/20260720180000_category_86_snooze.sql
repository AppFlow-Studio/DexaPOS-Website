-- [POS/Web] Category-level 86ing: transient per-location "Sold Out" for a whole
-- category, mirroring the item/modifier snooze model (20260712130000).
--
-- Unlike the is_active toggle (deliberate hide -> category is FILTERED OUT of the
-- menu), a category snooze KEEPS the category live and instead marks its items
-- "Sold Out" downstream (OrderOut suspension_info; auto-restores at snoozed_until).
-- Therefore a snooze does NOT touch is_active (that would drop the category via the
-- WHERE COALESCE(is_active) filter). A category is snoozed while snoozed_until >
-- now(). NULL = live. 'infinity' = until manually cleared. Expiry is lazy.

-- ============================================================================
-- 1. Schema: snooze columns on location_category_overrides (L2, per-location)
-- ============================================================================
ALTER TABLE public.location_category_overrides
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_reason text;

COMMENT ON COLUMN public.location_category_overrides.snoozed_until IS
  '86ing: category is temporarily Sold Out at this location while snoozed_until > now(). '
  'NULL = not snoozed. ''infinity'' = until manually cleared. Does NOT set is_active '
  '(that would drop the category); consumers mark the category''s items Sold Out instead.';

COMMENT ON COLUMN public.location_category_overrides.snooze_reason IS
  '86ing: optional free-text reason. Surfaced in dashboard + audit.';

CREATE INDEX IF NOT EXISTS idx_lco_snoozed
  ON public.location_category_overrides (location_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

-- ============================================================================
-- 2. RPC: set / clear a category snooze (called by POS and web)
-- ============================================================================
-- Writes ONLY snoozed_until/snooze_reason -- never is_active -- so a snooze can
-- never collide with a manager's deliberate hide, and the category stays on the
-- menu (marked Sold Out) instead of disappearing.
CREATE OR REPLACE FUNCTION public.set_location_category_snooze_v1(
  p_location_id   uuid,
  p_category_id   uuid,
  p_snoozed_until timestamptz,   -- NULL = clear/un-86; future ts = timed; 'infinity' = until manual
  p_reason        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to snooze categories for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.location_category_overrides AS lco
        (location_id, category_id, snoozed_until, snooze_reason, updated_at)
  VALUES (p_location_id, p_category_id, p_snoozed_until, p_reason, now())
  ON CONFLICT (location_id, category_id) DO UPDATE
    SET snoozed_until = EXCLUDED.snoozed_until,
        snooze_reason = EXCLUDED.snooze_reason,
        updated_at    = now()
  RETURNING to_jsonb(lco.*) INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_location_category_snooze_v1(uuid, uuid, timestamptz, text)
  TO authenticated, service_role;

-- ============================================================================
-- 3. get_menu_with_categories: surface category snoozed_until/snooze_reason.
--    Verbatim from the live definition (post-20260712130001) with two new fields
--    added to the category json_build_object. The is_active WHERE filter is
--    UNCHANGED -- a snoozed category stays is_active=true and passes it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_menu_with_categories(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', m.id,
        'merchant_id', m.merchant_id,
        'location_id', m.location_id,
        'name', m.name,
        'description', m.description,
        'is_active', m.is_active,
        'is_global', (m.location_id IS NULL),
        'is_location_owned', (m.location_id IS NOT NULL),
        'created_at', m.created_at,
        'updated_at', m.updated_at,

        -- Categories with items (Uber Eats / DoorDash style)
        'categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id,
                    'category_id', c.id,
                    'display_order', COALESCE(
                        lmco.display_order,
                        lco.display_order,
                        mc.display_order
                    ),
                    'is_active', COALESCE(
                        lmco.is_active,
                        lco.is_active,
                        mc.is_active,
                        true
                    ),
                    -- 86ing: raw category snooze state (L2, per-location). A snoozed
                    -- category stays is_active=true; consumers mark its items Sold Out.
                    'snoozed_until', lco.snoozed_until,
                    'snooze_reason', lco.snooze_reason,

                    'category', json_build_object(
                        'id', c.id,
                        'name', COALESCE(lmco.custom_title, mc.custom_title, c.name),
                        'description', c.description,
                        'image', COALESCE(mc.custom_image, c.image),
                        'has_location_override', (lco.id IS NOT NULL),
                        'has_menu_category_override', (lmco.id IS NOT NULL),
                        'location_id', c.location_id
                    ),

                    -- Items in this category on this menu
                    'items', (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'id', ci.id,
                                'menu_item_id', mi.id,
                                'category_id', c.id,
                                'display_order', COALESCE(lcio.display_order, ci.display_order),
                                'is_featured', COALESCE(lcio.is_featured, ci.is_featured),

                                'menu_item', json_build_object(
                                    'id', mi.id,
                                    'name', mi.name,
                                    'description', mi.description,
                                    'image', mi.image,
                                    'allergens', mi.allergens,
                                    'meal_types', mi.meal_types,
                                    'dietary_flags', mi.dietary_flags,
                                    'card_bg_color', mi.card_bg_color,

                                    -- ============================================
                                    -- AVAILABILITY (AND logic across all levels)
                                    -- Restored: consumers (OrderOut, storefront,
                                    -- menu views) depend on this field.
                                    -- + 86ing: item is unavailable while snoozed.
                                    -- ============================================
                                    'effective_availability', (
                                        mi.availability = true                            -- L1: base item
                                        AND COALESCE(lio.is_available, true) = true        -- L2: location item
                                        AND COALESCE(ci.is_available, true) = true         -- global category row
                                        AND COALESCE(ci_menu.is_available, true) = true    -- global menu-category row
                                        AND COALESCE(lcio.is_available, true) = true       -- branch category override
                                        AND COALESCE(lmio.is_available, true) = true       -- branch menu override
                                        AND (lio.snoozed_until IS NULL OR lio.snoozed_until <= now())  -- 86ing
                                    ),
                                    -- Raw snooze state for dashboard badges (NULL when live/expired-unread)
                                    'snoozed_until', lio.snoozed_until,
                                    'snooze_reason', lio.snooze_reason,

                                    -- ============================================
                                    -- PRICE BREAKDOWN (All Levels)
                                    -- ============================================
                                    'price_levels', json_build_object(
                                        'level_1_base', mi.price,
                                        'level_2_location_item', lio.custom_price,
                                        'level_2_modifier', lio.price_modifier,
                                        'level_2_modifier_type', lio.price_modifier_type,
                                        -- L2: global category price (menu_id IS NULL)
                                        'level_3_category', ci.custom_price,
                                        'level_3_category_cash', ci.custom_cash_price,
                                        'level_3_category_delivery', ci.custom_delivery_price,
                                        -- L4: global menu category price (menu_id = p_menu_id)
                                        'level_3_menu_category', ci_menu.custom_price,
                                        'level_3_menu_category_cash', ci_menu.custom_cash_price,
                                        'level_3_menu_category_delivery', ci_menu.custom_delivery_price,
                                        -- L3: branch category price
                                        'level_4_location_category', lcio.custom_price,
                                        'level_4_location_category_cash', lcio.custom_cash_price,
                                        'level_4_location_category_delivery', lcio.custom_delivery_price,
                                        -- L5: branch menu price
                                        'level_5_location_menu', lmio.custom_price,
                                        'level_5_location_menu_cash', lmio.custom_cash_price,
                                        'level_5_location_menu_delivery', lmio.custom_delivery_price,
                                        'level_1_delivery', mi.delivery_price,
                                        'level_1_cash', mi.cash_price,
                                        'level_2_location_item_delivery', lio.custom_delivery_price
                                    ),

                                    -- ============================================
                                    -- EFFECTIVE PRICE (Full Cascade)
                                    -- UI: L5 > L4 > L3 > L2 > L1
                                    -- DB: lmio > ci_menu > lcio > ci > lio/mi
                                    -- ============================================
                                    'effective_price', CASE
                                        -- Location-owned menu: simplified cascade
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(
                                                ci.custom_price,
                                                mi.price
                                            )
                                        -- Global menu with location context
                                        ELSE COALESCE(
                                            lmio.custom_price,          -- UI L5: Location + Menu
                                            ci_menu.custom_price,       -- UI L4: Global Menu Category
                                            lcio.custom_price,          -- UI L3: Location + Category
                                            ci.custom_price,            -- UI L2: Global Category
                                            -- UI L1 with modifier logic
                                            CASE
                                                WHEN lio.price_modifier_type = 'add'
                                                     AND lio.price_modifier IS NOT NULL
                                                THEN mi.price + lio.price_modifier
                                                WHEN lio.price_modifier_type = 'percent'
                                                     AND lio.price_modifier IS NOT NULL
                                                THEN mi.price * (1 + lio.price_modifier / 100)
                                                WHEN lio.custom_price IS NOT NULL
                                                THEN lio.custom_price
                                                ELSE NULL
                                            END,
                                            mi.price                    -- UI L1: Base
                                        )
                                    END,

                                    'effective_cash_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_cash_price, mi.cash_price)
                                        ELSE COALESCE(
                                            lmio.custom_cash_price,
                                            ci_menu.custom_cash_price,
                                            lcio.custom_cash_price,
                                            ci.custom_cash_price,
                                            lio.custom_cash_price,
                                            mi.cash_price
                                        )
                                    END,

                                    'effective_delivery_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_delivery_price, mi.delivery_price)
                                        ELSE COALESCE(
                                            lmio.custom_delivery_price,
                                            ci_menu.custom_delivery_price,
                                            lcio.custom_delivery_price,
                                            ci.custom_delivery_price,
                                            lio.custom_delivery_price,
                                            mi.delivery_price
                                        )
                                    END,

                                    'price_source', CASE
                                        WHEN lmio.custom_price IS NOT NULL THEN 'location_menu'
                                        WHEN ci_menu.custom_price IS NOT NULL THEN 'menu_category'
                                        WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                        WHEN ci.custom_price IS NOT NULL THEN 'category'
                                        WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL
                                            THEN 'location_item'
                                        ELSE 'base'
                                    END,

                                    -- Override flags for UI
                                    'has_location_item_override', (lio.id IS NOT NULL),
                                    'has_category_override', (ci.custom_price IS NOT NULL),
                                    'has_menu_category_override', (ci_menu.id IS NOT NULL),
                                    'has_location_category_override', (lcio.id IS NOT NULL),
                                    'has_location_menu_override', (lmio.id IS NOT NULL),

                                    -- Stock info
                                    'stock_tracking_mode', COALESCE(
                                        NULLIF(lio.stock_tracking_mode, 'use_default'),
                                        mi.stock_tracking_mode
                                    ),
                                    'current_stock', lio.current_stock,

                                    -- Modifiers (with location overrides)
                                    'modifier_groups', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mg.id,
                                                'name', mg.name,
                                                'min_selections', mg.min_selections,
                                                'max_selections', mg.max_selections,
                                                'is_required', mg.is_required,
                                                'is_active', COALESCE(lmgo.is_active, true),
                                                -- Per-item ordering surfaced for client (POS sort path)
                                                'display_order', COALESCE(lmgo.display_order, mimg.display_order),

                                                'items', (
                                                    SELECT COALESCE(json_agg(
                                                        json_build_object(
                                                            'id', mgi.id,
                                                            'name', mgi.name,
                                                            'price_modifier', COALESCE(
                                                                lmio_mod.price_modifier,
                                                                mgi.price_modifier
                                                            ),
                                                            'is_active', (
                                                                mgi.is_active = true
                                                                AND COALESCE(lmio_mod.is_active, true) = true
                                                                AND (lmio_mod.snoozed_until IS NULL OR lmio_mod.snoozed_until <= now())  -- 86ing
                                                            ),
                                                            'snoozed_until', lmio_mod.snoozed_until,
                                                            'snooze_reason', lmio_mod.snooze_reason,
                                                            'stock_tracking_mode', COALESCE(
                                                                lmio_mod.stock_tracking_mode,
                                                                'in_stock'
                                                            ),
                                                            'current_stock', lmio_mod.current_stock
                                                        ) ORDER BY COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name
                                                    ), '[]'::json)
                                                    FROM modifier_group_items mgi
                                                    LEFT JOIN location_modifier_item_overrides lmio_mod
                                                        ON lmio_mod.modifier_group_item_id = mgi.id
                                                        AND lmio_mod.location_id = p_location_id
                                                    WHERE mgi.modifier_group_id = mg.id
                                                )
                                            ) ORDER BY COALESCE(lmgo.display_order, mimg.display_order), mg.name
                                        ), '[]'::json)
                                        FROM (
                                            SELECT modifier_group_id, display_order
                                            FROM menu_item_modifier_groups
                                            WHERE menu_item_id = mi.id
                                            UNION
                                            SELECT modifier_group_id, display_order
                                            FROM location_item_modifier_groups
                                            WHERE menu_item_id = mi.id
                                              AND location_id = p_location_id
                                        ) mimg(modifier_group_id, display_order)
                                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                        LEFT JOIN location_modifier_group_overrides lmgo
                                            ON lmgo.modifier_group_id = mg.id
                                            AND lmgo.location_id = p_location_id
                                    )
                                )
                            ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                        ), '[]'::json)
                        -- L2: global category rows (menu_id IS NULL)
                        FROM category_items ci
                        JOIN menu_items mi ON mi.id = ci.menu_item_id
                        -- L4: menu-specific global category rows
                        LEFT JOIN category_items ci_menu
                            ON ci_menu.menu_item_id = ci.menu_item_id
                            AND ci_menu.category_id = ci.category_id
                            AND ci_menu.menu_id = m.id
                        -- Location item override
                        LEFT JOIN location_item_overrides lio
                            ON lio.menu_item_id = mi.id
                            AND lio.location_id = p_location_id
                        -- Branch category override (UI L3)
                        LEFT JOIN location_category_item_overrides lcio
                            ON lcio.menu_item_id = mi.id
                            AND lcio.category_id = c.id
                            AND lcio.location_id = p_location_id
                        -- Branch menu override (UI L5)
                        LEFT JOIN location_menu_item_overrides lmio
                            ON lmio.menu_item_id = mi.id
                            AND lmio.menu_id = m.id
                            AND lmio.category_id = c.id
                            AND lmio.location_id = p_location_id
                        WHERE ci.category_id = c.id
                          AND ci.menu_id IS NULL
                          AND COALESCE(ci.is_available, true) = true
                    )
                ) ORDER BY COALESCE(lmco.display_order, lco.display_order, mc.display_order)
            ), '[]'::json)
            FROM menu_categories mc
            JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco
                ON lco.category_id = c.id
                AND lco.location_id = p_location_id
            LEFT JOIN location_menu_category_overrides lmco
                ON lmco.category_id = c.id
                AND lmco.menu_id = m.id
                AND lmco.location_id = p_location_id
            WHERE mc.menu_id = m.id
              AND COALESCE(lmco.is_active, lco.is_active, mc.is_active, true) = true
        ),

        -- Schedules
        'schedules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', ms.id,
                    'schedule', (
                        SELECT json_build_object(
                            'id', s.id,
                            'name', s.name,
                            'time_slots', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', ts.id,
                                        'day_of_week', ts.day_of_week,
                                        'start_time', ts.start_time,
                                        'end_time', ts.end_time
                                    ) ORDER BY ts.day_of_week, ts.start_time
                                ), '[]'::json)
                                FROM schedule_time_slots ts WHERE ts.schedule_id = s.id
                            )
                        )
                        FROM schedules s WHERE s.id = ms.schedule_id
                    )
                )
            ), '[]'::json)
            FROM menu_schedules ms WHERE ms.menu_id = m.id
        )
    )
    INTO result
    FROM menus m
    WHERE m.id = p_menu_id;
RETURN result;
END;
$function$;

-- ============================================================================
-- 4. get_active_snoozes: add a `categories` array for the "86'd" dashboard view.
--    Items + modifiers blocks are unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_active_snoozes(
  p_location_id uuid
) RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  result json;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to view snoozes for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'items', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'kind', 'item',
          'menu_item_id', lio.menu_item_id,
          'name', mi.name,
          'image', mi.image,
          'snoozed_until', lio.snoozed_until,
          'snooze_reason', lio.snooze_reason,
          'updated_at', lio.updated_at
        ) ORDER BY mi.name
      ), '[]'::json)
      FROM public.location_item_overrides lio
      JOIN public.menu_items mi ON mi.id = lio.menu_item_id
      WHERE lio.location_id = p_location_id
        AND lio.snoozed_until IS NOT NULL
        AND lio.snoozed_until > now()
    ),
    'modifiers', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'kind', 'modifier',
          'modifier_group_item_id', lmio.modifier_group_item_id,
          'name', mgi.name,
          'group_name', mg.name,
          'snoozed_until', lmio.snoozed_until,
          'snooze_reason', lmio.snooze_reason,
          'updated_at', lmio.updated_at
        ) ORDER BY mg.name, mgi.name
      ), '[]'::json)
      FROM public.location_modifier_item_overrides lmio
      JOIN public.modifier_group_items mgi ON mgi.id = lmio.modifier_group_item_id
      JOIN public.modifier_groups mg ON mg.id = mgi.modifier_group_id
      WHERE lmio.location_id = p_location_id
        AND lmio.snoozed_until IS NOT NULL
        AND lmio.snoozed_until > now()
    ),
    'categories', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'kind', 'category',
          'category_id', lco.category_id,
          'name', c.name,
          'image', c.image,
          'snoozed_until', lco.snoozed_until,
          'snooze_reason', lco.snooze_reason,
          'updated_at', lco.updated_at
        ) ORDER BY c.name
      ), '[]'::json)
      FROM public.location_category_overrides lco
      JOIN public.categories c ON c.id = lco.category_id
      WHERE lco.location_id = p_location_id
        AND lco.snoozed_until IS NOT NULL
        AND lco.snoozed_until > now()
    )
  )
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_snoozes(uuid) TO authenticated, service_role;

-- ============================================================================
-- 5. Auto-restore cron: also clear expired CATEGORY snoozes. Categories do NOT
--    couple is_active, so we only clear snoozed_until (housekeeping + delta sync).
--    Items/modifiers blocks unchanged. Keeps the existing 5-minute schedule.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.restore_expired_item_snoozes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  -- Items: coupling set is_available=false on 86; restore it + clear the expired snooze.
  UPDATE public.location_item_overrides
     SET is_available = true,
         snoozed_until = NULL,
         updated_at = now()
   WHERE snoozed_until IS NOT NULL
     AND snoozed_until <= now();

  -- Modifiers: is_active was not coupled; just clear the expired snooze.
  UPDATE public.location_modifier_item_overrides
     SET snoozed_until = NULL,
         updated_at = now()
   WHERE snoozed_until IS NOT NULL
     AND snoozed_until <= now();

  -- Categories: is_active is NOT coupled (a snooze never sets it); just clear the
  -- expired snooze. The trigger below fires an OrderOut resync so items un-Sold-Out.
  UPDATE public.location_category_overrides
     SET snoozed_until = NULL,
         updated_at = now()
   WHERE snoozed_until IS NOT NULL
     AND snoozed_until <= now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_expired_item_snoozes() TO service_role;

-- ============================================================================
-- 6. POS-origin resync: a category 86 done on the POS calls the RPC directly and
--    never hits the web action, so reuse notify_item_snooze_change() (it POSTs
--    NEW.location_id to the internal resync endpoint) on snoozed_until changes.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_category_snooze_resync ON public.location_category_overrides;
CREATE TRIGGER trg_category_snooze_resync
  AFTER INSERT OR UPDATE OF snoozed_until ON public.location_category_overrides
  FOR EACH ROW EXECUTE FUNCTION public.notify_item_snooze_change();
