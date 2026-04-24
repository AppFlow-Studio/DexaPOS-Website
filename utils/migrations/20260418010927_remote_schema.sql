drop policy "dexa admin full access" on "public"."locations";

drop policy "locations_delete" on "public"."locations";

drop policy "locations_insert" on "public"."locations";

drop policy "locations_update" on "public"."locations";

drop policy "location_select" on "public"."locations";

drop policy "support_tickets_admin_or_merchant_all" on "public"."support_tickets";

alter table "public"."receipt_templates" alter column "show_logo" set default false;

alter table "public"."waitlist" disable row level security;

CREATE INDEX idx_orders_active_bootstrap ON public.orders USING btree (location_id, status, created_at DESC) WHERE (status = ANY (ARRAY['draft'::public.order_status, 'pending'::public.order_status, 'sent_to_kitchen'::public.order_status, 'preparing'::public.order_status, 'ready'::public.order_status]));

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_reservation(p_location_id uuid, p_party_name text, p_party_size integer, p_phone text, p_reservation_date date, p_reservation_time time without time zone, p_email text DEFAULT NULL::text, p_duration_minutes integer DEFAULT 90, p_preferred_section text DEFAULT NULL::text, p_seating_preference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_special_requests text DEFAULT NULL::text, p_is_vip boolean DEFAULT false, p_source text DEFAULT 'direct'::text, p_assigned_table_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$DECLARE
  v_merchant_id UUID;
  v_reservation_id UUID;
  v_confirmation_number TEXT;
  v_location_tz TEXT;
  v_reservation_ts TIMESTAMPTZ;
BEGIN
  v_merchant_id := user_merchant_id();

  IF NOT p_location_id = ANY(user_location_ids()) THEN
    RAISE EXCEPTION 'Location access denied';
  END IF;

  -- get location timezone (example fallback)
  SELECT COALESCE(timezone, 'UTC')
  INTO v_location_tz
  FROM public.locations
  WHERE id = p_location_id;

  -- combine date+time as local location time, then convert to timestamptz
  v_reservation_ts := (p_reservation_date + p_reservation_time) AT TIME ZONE v_location_tz;

  -- strict future check
  IF v_reservation_ts <= now() THEN
    RAISE EXCEPTION 'Reservation must be in the future';
  END IF;
  -- Create reservation
  INSERT INTO public.reservations (
    merchant_id, location_id,
    party_name, party_size, phone, email,
    reservation_date, reservation_time, duration_minutes,
    preferred_section, seating_preference,
    notes, special_requests, is_vip, source,
    assigned_table_ids,
    created_by_staff_id
  ) VALUES (
    v_merchant_id, p_location_id,
    p_party_name, p_party_size, p_phone, p_email,
    p_reservation_date, p_reservation_time, p_duration_minutes,
    p_preferred_section, p_seating_preference,
    p_notes, p_special_requests, p_is_vip, p_source,
    p_assigned_table_ids,
    user_staff_profile_id()
  )
  RETURNING id, confirmation_number INTO v_reservation_id, v_confirmation_number;

  RETURN json_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'confirmation_number', v_confirmation_number,
    'party_name', p_party_name,
    'reservation_date', p_reservation_date,
    'reservation_time', p_reservation_time
  );
END;$function$
;

CREATE OR REPLACE FUNCTION public.ensure_course_exists(p_order_id uuid, p_course_number integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_course_id UUID;
BEGIN
  INSERT INTO public.order_courses (order_id, course_number, status)
  VALUES (p_order_id, p_course_number, 'open')
  ON CONFLICT (order_id, course_number) DO NOTHING;

  SELECT id INTO v_course_id
  FROM public.order_courses
  WHERE order_id = p_order_id
    AND course_number = p_course_number;

  RETURN v_course_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_categories_for_location(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', c.id, 'name', c.name, 'description', c.description, 'image', c.image, 'display_order', c.display_order,
                'location_id', c.location_id, 'is_global', COALESCE(c.is_global, c.location_id IS NULL), 'is_location_specific', (c.location_id IS NOT NULL),
                'location_name', (SELECT l.name FROM locations l WHERE l.id = c.location_id), 'created_by', c.created_by, 'is_active', c.is_active,
                'location_override', CASE WHEN c.location_id IS NULL AND lco.id IS NOT NULL THEN json_build_object('id', lco.id, 'is_active', lco.is_active, 'display_order', lco.display_order, 'custom_title', lco.custom_title) ELSE NULL END,
                'effective_is_active', CASE WHEN c.location_id IS NOT NULL THEN c.is_active ELSE COALESCE(lco.is_active, c.is_active) END,
                'effective_display_order', CASE WHEN c.location_id IS NOT NULL THEN c.display_order ELSE COALESCE(lco.display_order, c.display_order) END,
                'effective_name', CASE WHEN c.location_id IS NOT NULL THEN c.name ELSE COALESCE(lco.custom_title, c.name) END,
                'items', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', ci.id, 'menu_item_id', mi.id, 'display_order', ci.display_order, 'is_featured', ci.is_featured,
                            'category_price', ci.custom_price, 'category_cash_price', ci.custom_cash_price, 'category_delivery_price', ci.custom_delivery_price, 'category_is_available', ci.is_available,
                            'menu_item', json_build_object(
                                'id', mi.id, 'name', mi.name, 'description', mi.description, 'image', mi.image, 'allergens', mi.allergens, 'meal_types', mi.meal_types, 'card_bg_color', mi.card_bg_color, 'location_id', mi.location_id,
                                'base_price', mi.price, 'base_cash_price', mi.cash_price, 'base_delivery_price', mi.delivery_price, 'base_availability', mi.availability,
                                'location_item_override', CASE WHEN lio.id IS NOT NULL THEN json_build_object('id', lio.id, 'custom_price', lio.custom_price, 'custom_cash_price', lio.custom_cash_price, 'custom_delivery_price', lio.custom_delivery_price, 'price_modifier', lio.price_modifier, 'price_modifier_type', lio.price_modifier_type, 'is_available', lio.is_available, 'stock_tracking_mode', lio.stock_tracking_mode, 'current_stock', lio.current_stock) ELSE NULL END,
                                'location_category_override', CASE WHEN lcio.id IS NOT NULL THEN json_build_object('id', lcio.id, 'custom_price', lcio.custom_price, 'custom_cash_price', lcio.custom_cash_price, 'custom_delivery_price', lcio.custom_delivery_price, 'is_available', lcio.is_available) ELSE NULL END,
                                'effective_price', COALESCE(lcio.custom_price, ci.custom_price, lio.custom_price, mi.price),
                                'effective_cash_price', COALESCE(lcio.custom_cash_price, ci.custom_cash_price, lio.custom_cash_price, mi.cash_price),
                                'effective_delivery_price', COALESCE(lcio.custom_delivery_price, ci.custom_delivery_price, lio.custom_delivery_price, mi.delivery_price),
                                'effective_availability', (mi.availability = true AND COALESCE(lio.is_available, true) = true AND COALESCE(ci.is_available, true) = true AND COALESCE(lcio.is_available, true) = true),
                                'is_new', COALESCE(lio.is_new, false),
                                'is_popular', (COALESCE(lio.is_popular, false) OR (p_location_id IS NOT NULL AND (SELECT COUNT(*) >= 10 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.menu_item_id = mi.id AND o.location_id = p_location_id AND o.status = 'completed' AND o.completed_at > NOW() - INTERVAL '30 days' AND oi.is_voided = false))),
                                'price_source', CASE WHEN lcio.custom_price IS NOT NULL THEN 'location_category' WHEN ci.custom_price IS NOT NULL THEN 'category' WHEN lio.custom_price IS NOT NULL THEN 'location_item' ELSE 'base' END,
                                'has_location_item_override', (lio.id IS NOT NULL), 'has_category_price', (ci.custom_price IS NOT NULL), 'has_location_category_override', (lcio.id IS NOT NULL),
                                'modifier_groups', (
                                    SELECT COALESCE(json_agg(
                                        json_build_object(
                                            'id', mg.id, 'name', mg.name, 'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'is_required', mg.is_required, 'is_active', COALESCE(lmgo.is_active, true), 'source', mimg.source,
                                            'items', (SELECT COALESCE(json_agg(json_build_object('id', mgi.id, 'name', mgi.name, 'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier), 'is_active', (mgi.is_active = true AND COALESCE(lmio_mod.is_active, true) = true), 'is_default', mgi.is_default, 'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'), 'current_stock', lmio_mod.current_stock) ORDER BY mgi.display_order, mgi.name), '[]'::json) FROM modifier_group_items mgi LEFT JOIN location_modifier_item_overrides lmio_mod ON lmio_mod.modifier_group_item_id = mgi.id AND lmio_mod.location_id = p_location_id WHERE mgi.modifier_group_id = mg.id)
                                        ) ORDER BY mg.display_order, mg.name
                                    ), '[]'::json)
                                    FROM (SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id UNION SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups WHERE menu_item_id = mi.id AND location_id = p_location_id) mimg(modifier_group_id, source)
                                    JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                    LEFT JOIN location_modifier_group_overrides lmgo ON lmgo.modifier_group_id = mg.id AND lmgo.location_id = p_location_id
                                )
                            )
                        ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                    ), '[]'::json)
                    FROM category_items ci JOIN menu_items mi ON mi.id = ci.menu_item_id
                    LEFT JOIN location_item_overrides lio ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
                    LEFT JOIN location_category_item_overrides lcio ON lcio.menu_item_id = mi.id AND lcio.category_id = c.id AND lcio.location_id = p_location_id
                    WHERE ci.category_id = c.id
                ),
                'item_count', (SELECT COUNT(*) FROM category_items ci WHERE ci.category_id = c.id),
                'menu_count', (SELECT COUNT(*) FROM menu_categories mc WHERE mc.category_id = c.id),
                'has_location_override', (lco.id IS NOT NULL),
                'created_at', c.created_at, 'updated_at', c.updated_at
            ) ORDER BY CASE WHEN c.location_id IS NULL THEN 0 ELSE 1 END, COALESCE(lco.display_order, c.display_order) NULLS LAST, c.name
        ), '[]'::json)
        FROM categories c
        LEFT JOIN location_category_overrides lco ON lco.category_id = c.id AND lco.location_id = p_location_id AND c.location_id IS NULL
        WHERE c.merchant_id = p_merchant_id AND (p_location_id IS NULL OR (c.location_id IS NULL OR c.location_id = p_location_id))
    );
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_items_for_location_library(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', mi.id, 'name', mi.name, 'description', mi.description, 'image', mi.image, 'allergens', mi.allergens, 'meal_types', mi.meal_types, 'card_bg_color', mi.card_bg_color, 'location_id', mi.location_id,
                'stock_tracking_mode', mi.stock_tracking_mode, 'tax_category', mi.tax_category, 'is_tax_exempt', mi.is_tax_exempt, 'available_channels', mi.available_channels,
                'base_price', mi.price, 'base_cash_price', mi.cash_price, 'base_delivery_price', mi.delivery_price, 'base_availability', mi.availability,
                'location_override', CASE WHEN lio.id IS NOT NULL THEN json_build_object('id', lio.id, 'custom_price', lio.custom_price, 'custom_cash_price', lio.custom_cash_price, 'price_modifier', lio.price_modifier, 'price_modifier_type', lio.price_modifier_type, 'is_available', lio.is_available, 'stock_tracking_mode', lio.stock_tracking_mode, 'current_stock', lio.current_stock, 'tax_category', lio.tax_category, 'is_tax_exempt', lio.is_tax_exempt, 'available_channels', lio.available_channels, 'custom_delivery_price', lio.custom_delivery_price) ELSE NULL END,
                'effective_price', COALESCE(lio.custom_price, mi.price),
                'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
                'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
                'effective_availability', COALESCE(lio.is_available, mi.availability),
                'effective_tax_category', COALESCE(lio.tax_category, mi.tax_category),
                'effective_is_tax_exempt', COALESCE(lio.is_tax_exempt, mi.is_tax_exempt),
                'effective_available_channels', COALESCE(lio.available_channels, mi.available_channels),
                'price_source', CASE WHEN lio.custom_price IS NOT NULL THEN 'location_item' ELSE 'base' END,
                'has_location_override', (lio.id IS NOT NULL),
                'modifier_groups', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', mg.id, 'name', mg.name, 'description', mg.description,
                                'base_min_selections', mg.min_selections, 'base_max_selections', mg.max_selections, 'base_is_required', mg.is_required, 'base_is_active', mg.is_active,
                                'location_override', CASE WHEN lmgo.id IS NOT NULL THEN json_build_object('id', lmgo.id, 'is_available', lmgo.is_active) ELSE NULL END,
                                'effective_availability', COALESCE(lmgo.is_active, mg.is_active),
                                'has_location_override', (lmgo.id IS NOT NULL),
                                'source', mimg.source,
                                'items', COALESCE(
                                    (SELECT json_agg(json_build_object('id', mgi.id, 'name', mgi.name, 'description', mgi.description, 'base_price', mgi.price_modifier, 'base_is_default', mgi.is_default, 'base_is_active', mgi.is_active, 'location_override', CASE WHEN lmio.id IS NOT NULL THEN json_build_object('id', lmio.id, 'custom_price', lmio.price_modifier, 'is_active', lmio.is_active) ELSE NULL END, 'effective_price', COALESCE(lmio.price_modifier, mgi.price_modifier), 'effective_is_active', COALESCE(lmio.is_active, mgi.is_active), 'has_location_override', (lmio.id IS NOT NULL)) ORDER BY mgi.name) FROM modifier_group_items mgi LEFT JOIN location_modifier_item_overrides lmio ON lmio.modifier_group_item_id = mgi.id AND lmio.location_id = p_location_id WHERE mgi.modifier_group_id = mg.id),
                                    '[]'::json
                                )
                            ) ORDER BY mg.name
                        )
                        FROM (SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id UNION SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups WHERE menu_item_id = mi.id AND location_id = p_location_id) mimg(modifier_group_id, source)
                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                        LEFT JOIN location_modifier_group_overrides lmgo ON lmgo.modifier_group_id = mg.id AND lmgo.location_id = p_location_id
                    ),
                    '[]'::json
                ),
                'categories', COALESCE(
                    (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'location_id', c.location_id, 'location_name', (SELECT l.name FROM locations l WHERE l.id = c.location_id), 'is_global', COALESCE(c.is_global, c.location_id IS NULL)) ORDER BY c.name) FROM category_items ci JOIN categories c ON c.id = ci.category_id WHERE ci.menu_item_id = mi.id AND c.merchant_id = p_merchant_id AND (p_location_id IS NULL OR c.location_id IS NULL OR c.location_id = p_location_id)),
                    '[]'::json
                ),
                'created_at', mi.created_at, 'updated_at', mi.updated_at
            ) ORDER BY mi.name
        ), '[]'::json)
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
        WHERE mi.merchant_id = p_merchant_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_item_details(p_item_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN (
        SELECT json_build_object(
            'id', mi.id, 'name', mi.name, 'description', mi.description, 'image', mi.image, 'meal_types', mi.meal_types, 'allergens', mi.allergens, 'card_bg_color', mi.card_bg_color, 'stock_tracking_mode', mi.stock_tracking_mode,
            'base_price', mi.price, 'base_cash_price', mi.cash_price, 'base_delivery_price', mi.delivery_price, 'base_availability', mi.availability,
            'location_override', CASE WHEN lio.id IS NOT NULL THEN json_build_object('id', lio.id, 'custom_price', lio.custom_price, 'custom_cash_price', lio.custom_cash_price, 'custom_delivery_price', lio.custom_delivery_price, 'price_modifier', lio.price_modifier, 'price_modifier_type', lio.price_modifier_type, 'is_available', lio.is_available, 'stock_tracking_mode', lio.stock_tracking_mode, 'current_stock', lio.current_stock, 'is_popular', lio.is_popular) ELSE NULL END,
            'effective_price', COALESCE(lio.custom_price, mi.price),
            'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
            'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
            'effective_availability', COALESCE(lio.is_available, mi.availability),
            'has_location_override', (lio.id IS NOT NULL),
            'price_source', CASE WHEN lio.custom_price IS NOT NULL THEN 'location_override' ELSE 'base' END,
            'modifier_groups', (
                SELECT COALESCE(json_agg(
                    json_build_object(
                        'id', mg.id, 'name', mg.name, 'description', mg.description,
                        'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'is_required', mg.is_required,
                        'is_active', COALESCE(lmgo.is_active, true),
                        'source', mimg.source,
                        'items', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', mgi.id, 'name', mgi.name, 'description', mgi.description,
                                    'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                    'is_active', (mgi.is_active = true AND COALESCE(lmio_mod.is_active, true) = true),
                                    'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                    'current_stock', lmio_mod.current_stock
                                ) ORDER BY mgi.name ASC
                            ), '[]'::json)
                            FROM modifier_group_items mgi
                            LEFT JOIN location_modifier_item_overrides lmio_mod ON lmio_mod.modifier_group_item_id = mgi.id AND lmio_mod.location_id = p_location_id
                            WHERE mgi.modifier_group_id = mg.id
                        )
                    ) ORDER BY mg.name ASC
                ), '[]'::json)
                FROM (
                    SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                    UNION
                    SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups WHERE menu_item_id = mi.id AND location_id = p_location_id
                ) mimg(modifier_group_id, source)
                JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                LEFT JOIN location_modifier_group_overrides lmgo ON lmgo.modifier_group_id = mg.id AND lmgo.location_id = p_location_id
            ),
            'categories', (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)), '[]'::json) FROM category_items ci JOIN categories c ON c.id = ci.category_id WHERE ci.menu_item_id = mi.id),
            'menus', (SELECT COALESCE(json_agg(json_build_object('id', m.id, 'name', m.name, 'is_active', m.is_active, 'is_global', (m.location_id IS NULL), 'location_id', m.location_id) ORDER BY m.name ASC), '[]'::json) FROM menu_item_menus mim JOIN menus m ON m.id = mim.menu_id WHERE mim.menu_item_id = mi.id),
            'menu_count', (SELECT COUNT(*) FROM menu_item_menus mim WHERE mim.menu_item_id = mi.id)
        )
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
        WHERE mi.id = p_item_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_with_categories(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', m.id, 'merchant_id', m.merchant_id, 'location_id', m.location_id, 'name', m.name, 'description', m.description, 'is_active', m.is_active, 'is_global', (m.location_id IS NULL), 'is_location_owned', (m.location_id IS NOT NULL), 'created_at', m.created_at, 'updated_at', m.updated_at,
        'categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id, 'category_id', c.id,
                    'display_order', COALESCE(lmco.display_order, lco.display_order, mc.display_order),
                    'is_active', COALESCE(lmco.is_active, lco.is_active, mc.is_active, true),
                    'category', json_build_object('id', c.id, 'name', COALESCE(lmco.custom_title, mc.custom_title, c.name), 'description', c.description, 'image', COALESCE(mc.custom_image, c.image), 'has_location_override', (lco.id IS NOT NULL), 'has_menu_category_override', (lmco.id IS NOT NULL), 'location_id', c.location_id),
                    'items', (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'id', ci.id, 'menu_item_id', mi.id, 'category_id', c.id,
                                'display_order', COALESCE(lcio.display_order, ci.display_order),
                                'is_featured', COALESCE(lcio.is_featured, ci.is_featured),
                                'menu_item', json_build_object(
                                    'id', mi.id, 'name', mi.name, 'description', mi.description, 'image', mi.image, 'allergens', mi.allergens, 'meal_types', mi.meal_types, 'card_bg_color', mi.card_bg_color,
                                    'price_levels', json_build_object('level_1_base', mi.price, 'level_2_location_item', lio.custom_price, 'level_2_modifier', lio.price_modifier, 'level_2_modifier_type', lio.price_modifier_type, 'level_3_category', ci.custom_price, 'level_3_category_cash', ci.custom_cash_price, 'level_3_category_delivery', ci.custom_delivery_price, 'level_3_menu_category', ci_menu.custom_price, 'level_3_menu_category_cash', ci_menu.custom_cash_price, 'level_3_menu_category_delivery', ci_menu.custom_delivery_price, 'level_4_location_category', lcio.custom_price, 'level_4_location_category_cash', lcio.custom_cash_price, 'level_4_location_category_delivery', lcio.custom_delivery_price, 'level_5_location_menu', lmio.custom_price, 'level_5_location_menu_cash', lmio.custom_cash_price, 'level_5_location_menu_delivery', lmio.custom_delivery_price, 'level_1_delivery', mi.delivery_price, 'level_1_cash', mi.cash_price, 'level_2_location_item_delivery', lio.custom_delivery_price),
                                    'effective_price', CASE WHEN m.location_id IS NOT NULL THEN COALESCE(ci.custom_price, mi.price) ELSE COALESCE(lmio.custom_price, ci_menu.custom_price, lcio.custom_price, ci.custom_price, CASE WHEN lio.price_modifier_type = 'add' AND lio.price_modifier IS NOT NULL THEN mi.price + lio.price_modifier WHEN lio.price_modifier_type = 'percent' AND lio.price_modifier IS NOT NULL THEN mi.price * (1 + lio.price_modifier / 100) WHEN lio.custom_price IS NOT NULL THEN lio.custom_price ELSE NULL END, mi.price) END,
                                    'effective_cash_price', CASE WHEN m.location_id IS NOT NULL THEN COALESCE(ci.custom_cash_price, mi.cash_price) ELSE COALESCE(lmio.custom_cash_price, ci_menu.custom_cash_price, lcio.custom_cash_price, ci.custom_cash_price, lio.custom_cash_price, mi.cash_price) END,
                                    'effective_delivery_price', CASE WHEN m.location_id IS NOT NULL THEN COALESCE(ci.custom_delivery_price, mi.delivery_price) ELSE COALESCE(lmio.custom_delivery_price, ci_menu.custom_delivery_price, lcio.custom_delivery_price, ci.custom_delivery_price, lio.custom_delivery_price, mi.delivery_price) END,
                                    'effective_availability', (mi.availability = true AND COALESCE(lio.is_available, true) = true AND COALESCE(ci.is_available, true) = true AND COALESCE(ci_menu.is_available, true) = true AND COALESCE(lcio.is_available, true) = true AND COALESCE(lmio.is_available, true) = true),
                                    'is_new', COALESCE(lio.is_new, false),
                                    'is_popular', (COALESCE(lio.is_popular, false) OR (p_location_id IS NOT NULL AND (SELECT COUNT(*) >= 10 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.menu_item_id = mi.id AND o.location_id = p_location_id AND o.status = 'completed' AND o.completed_at > NOW() - INTERVAL '30 days' AND oi.is_voided = false))),
                                    'price_source', CASE WHEN lmio.custom_price IS NOT NULL THEN 'location_menu' WHEN ci_menu.custom_price IS NOT NULL THEN 'menu_category' WHEN lcio.custom_price IS NOT NULL THEN 'location_category' WHEN ci.custom_price IS NOT NULL THEN 'category' WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL THEN 'location_item' ELSE 'base' END,
                                    'has_location_item_override', (lio.id IS NOT NULL), 'has_category_override', (ci.custom_price IS NOT NULL), 'has_menu_category_override', (ci_menu.id IS NOT NULL), 'has_location_category_override', (lcio.id IS NOT NULL), 'has_location_menu_override', (lmio.id IS NOT NULL),
                                    'stock_tracking_mode', COALESCE(NULLIF(lio.stock_tracking_mode, 'use_default'), mi.stock_tracking_mode), 'current_stock', lio.current_stock,
                                    'modifier_groups', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mg.id, 'name', mg.name, 'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'is_required', mg.is_required, 'is_active', COALESCE(lmgo.is_active, true), 'source', mimg.source,
                                                'items', (SELECT COALESCE(json_agg(json_build_object('id', mgi.id, 'name', mgi.name, 'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier), 'is_active', (mgi.is_active = true AND COALESCE(lmio_mod.is_active, true) = true), 'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'), 'current_stock', lmio_mod.current_stock) ORDER BY mgi.display_order, mgi.name), '[]'::json) FROM modifier_group_items mgi LEFT JOIN location_modifier_item_overrides lmio_mod ON lmio_mod.modifier_group_item_id = mgi.id AND lmio_mod.location_id = p_location_id WHERE mgi.modifier_group_id = mg.id)
                                            ) ORDER BY mg.display_order, mg.name
                                        ), '[]'::json)
                                        FROM (SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id UNION SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups WHERE menu_item_id = mi.id AND location_id = p_location_id) mimg(modifier_group_id, source)
                                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                        LEFT JOIN location_modifier_group_overrides lmgo ON lmgo.modifier_group_id = mg.id AND lmgo.location_id = p_location_id
                                    )
                                )
                            ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                        ), '[]'::json)
                        FROM category_items ci JOIN menu_items mi ON mi.id = ci.menu_item_id
                        LEFT JOIN category_items ci_menu ON ci_menu.menu_item_id = ci.menu_item_id AND ci_menu.category_id = ci.category_id AND ci_menu.menu_id = m.id
                        LEFT JOIN location_item_overrides lio ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
                        LEFT JOIN location_category_item_overrides lcio ON lcio.menu_item_id = mi.id AND lcio.category_id = c.id AND lcio.location_id = p_location_id
                        LEFT JOIN location_menu_item_overrides lmio ON lmio.menu_item_id = mi.id AND lmio.menu_id = m.id AND lmio.category_id = c.id AND lmio.location_id = p_location_id
                        WHERE ci.category_id = c.id AND ci.menu_id IS NULL AND COALESCE(ci.is_available, true) = true
                    )
                ) ORDER BY COALESCE(lmco.display_order, lco.display_order, mc.display_order)
            ), '[]'::json)
            FROM menu_categories mc JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco ON lco.category_id = c.id AND lco.location_id = p_location_id
            LEFT JOIN location_menu_category_overrides lmco ON lmco.category_id = c.id AND lmco.menu_id = m.id AND lmco.location_id = p_location_id
            WHERE mc.menu_id = m.id AND COALESCE(lmco.is_active, lco.is_active, mc.is_active, true) = true
        ),
        'schedules', (SELECT COALESCE(json_agg(json_build_object('id', ms.id, 'schedule', (SELECT json_build_object('id', s.id, 'name', s.name, 'time_slots', (SELECT COALESCE(json_agg(json_build_object('id', ts.id, 'day_of_week', ts.day_of_week, 'start_time', ts.start_time, 'end_time', ts.end_time) ORDER BY ts.day_of_week, ts.start_time), '[]'::json) FROM schedule_time_slots ts WHERE ts.schedule_id = s.id)) FROM schedules s WHERE s.id = ms.schedule_id))), '[]'::json) FROM menu_schedules ms WHERE ms.menu_id = m.id)
    ) INTO result FROM menus m WHERE m.id = p_menu_id;
    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_order_item(p_order_item_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_item_kitchen_status TEXT;
  v_item_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Get order and item info and verify access
  SELECT 
    o.id,
    o.status,
    oi.subtotal,
    oi.kitchen_status
  INTO v_order_id, v_order_status, v_item_subtotal, v_item_kitchen_status
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or access denied';
  END IF;

  -- Check item's kitchen_status instead of order status
  -- Items that have been sent to kitchen must be voided, not removed
  -- Allow hard delete for items with kitchen_status = 'new', NULL, or empty
  IF v_item_kitchen_status IS NOT NULL 
     AND v_item_kitchen_status NOT IN ('new', '') THEN
    RAISE EXCEPTION 'Cannot remove item with kitchen_status=%. Use void_order_item() instead.', v_item_kitchen_status;
  END IF;

  -- Delete modifiers first (cascade would handle this, but being explicit)
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  -- Delete the item
  DELETE FROM public.order_items
  WHERE id = p_order_item_id;

  -- Recalculate totals (handles discount redistribution + amount_due)
  PERFORM recalculate_order_discount(v_order_id);

  -- Return result
  SELECT json_build_object(
    'success', true,
    'removed_item_id', p_order_item_id,
    'order_id', v_order_id,
    'removed_subtotal', v_item_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;


  create policy "Location Write"
  on "public"."locations"
  as permissive
  for all
  to public
using ((public.is_merchant_admin(merchant_id) OR public.user_has_location_permission(id, 'location.manage'::text)))
with check ((public.is_merchant_admin(merchant_id) OR public.user_has_location_permission(id, 'location.manage'::text)));



  create policy "location_select"
  on "public"."locations"
  as permissive
  for select
  to public
using (true);



  create policy "support_tickets_admin_or_merchant_all"
  on "public"."support_tickets"
  as permissive
  for all
  to public
using (((EXISTS ( SELECT 1
   FROM (public.members mem
     JOIN public.organizations o ON ((o.id = mem.organization_id)))
  WHERE ((mem.user_id = (( SELECT (auth.jwt() -> 'sub'::text) AS uid))::text) AND (o.id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = current_setting('app.dexa_hq_org_id'::text, true))
         LIMIT 1))))) OR (merchant_id IN ( SELECT m.id
   FROM public.merchants m
  WHERE (m.clerk_org_id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = ((auth.jwt() -> 'org'::text) ->> 'id'::text))
         LIMIT 1))))))
with check (((EXISTS ( SELECT 1
   FROM (public.members mem
     JOIN public.organizations o ON ((o.id = mem.organization_id)))
  WHERE ((mem.user_id = (( SELECT (auth.jwt() -> 'sub'::text) AS uid))::text) AND (o.id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = current_setting('app.dexa_hq_org_id'::text, true))
         LIMIT 1))))) OR (merchant_id IN ( SELECT m.id
   FROM public.merchants m
  WHERE (m.clerk_org_id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = ((auth.jwt() -> 'org'::text) ->> 'id'::text))
         LIMIT 1))))));



  create policy "Location Members can insert Broadcasts"
  on "realtime"."messages"
  as permissive
  for insert
  to public
with check (
CASE
    WHEN (topic ~~ 'location:%'::text) THEN (EXISTS ( SELECT 1
       FROM public.location_members lm
      WHERE ((lm.user_id = (auth.jwt() ->> 'sub'::text)) AND (lm.location_id = ((regexp_match(messages.topic, 'location:([a-f0-9-]+):'::text))[1])::uuid) AND (lm.is_active = true))))
    ELSE false
END);



  create policy "Location members can read broadcasts"
  on "realtime"."messages"
  as permissive
  for select
  to public
using (
CASE
    WHEN (topic ~~ 'location:%'::text) THEN (EXISTS ( SELECT 1
       FROM public.location_members lm
      WHERE ((lm.user_id = (auth.jwt() ->> 'sub'::text)) AND (lm.location_id = ((regexp_match(messages.topic, 'location:([a-f0-9-]+):'::text))[1])::uuid) AND (lm.is_active = true))))
    WHEN (topic ~~ 'session:%'::text) THEN (EXISTS ( SELECT 1
       FROM (public.table_sessions ts
         JOIN public.location_members lm ON ((lm.location_id = ts.location_id)))
      WHERE ((ts.id = ((regexp_match(messages.topic, 'session:([a-f0-9-]+):'::text))[1])::uuid) AND (lm.user_id = (auth.jwt() ->> 'sub'::text)) AND (lm.is_active = true))))
    ELSE false
END);



  create policy "Location members can read thier floor status"
  on "realtime"."messages"
  as permissive
  for select
  to public
using (((realtime.topic() ~~ 'floor-plan-%'::text) AND public.user_has_location_permission(("substring"(realtime.topic(), 'floor-plan-(.*)'::text))::uuid, 'merchant.orders.manage'::text)));



  create policy "Location orders channel for merchant admins"
  on "realtime"."messages"
  as permissive
  for select
  to public
using (
CASE
    WHEN (topic ~~ 'location:%:orders'::text) THEN ((EXISTS ( SELECT 1
       FROM public.location_members lm
      WHERE ((lm.user_id = (auth.jwt() ->> 'sub'::text)) AND (lm.location_id = ((regexp_match(messages.topic, 'location:([a-f0-9-]+):'::text))[1])::uuid) AND (lm.is_active = true)))) OR (EXISTS ( SELECT 1
       FROM (public.locations l
         JOIN public.admin_merchant_access ama ON ((ama.merchant_id = l.merchant_id)))
      WHERE ((l.id = ((regexp_match(messages.topic, 'location:([a-f0-9-]+):'::text))[1])::uuid) AND (ama.admin_user_id = (auth.jwt() ->> 'sub'::text)) AND (ama.is_active = true) AND (ama.revoked_at IS NULL)))))
    ELSE false
END);



