create type "public"."inventory_stock_mode" as enum ('in_stock', 'stock_tracking', 'out_of_stock');

drop trigger if exists "trigger_update_inventory_on_po_received" on "public"."purchase_orders";

alter table "public"."inventory_items" drop constraint "inventory_items_stock_mode_check";

drop function if exists "public"."update_inventory_on_po_received"();

drop function if exists "public"."upsert_menu_item_with_recipe"(p_menu_item_id uuid, p_ingredients jsonb);

drop function if exists "public"."upsert_menu_item_with_recipe"(p_menu_item_id uuid, p_location_id uuid, p_recipe_items jsonb);

drop index if exists "public"."idx_inventory_items_stock_mode";

alter table "public"."inventory_items" add column "reorder_quantity" numeric;

alter table "public"."inventory_items" alter column "stock_mode" set default 'in_stock'::public.inventory_stock_mode;

alter table "public"."inventory_items" alter column "stock_mode" set data type public.inventory_stock_mode using "stock_mode"::public.inventory_stock_mode;

alter table "public"."location_inventory_overrides" add column "cost_per_unit" numeric;

alter table "public"."location_inventory_overrides" add column "reorder_point" numeric;

alter table "public"."orders" add column "inventory_deducted" boolean not null default false;

alter table "public"."receipt_templates" add column "group_by_seat" boolean not null default false;

alter table "public"."receipt_templates" add column "show_approved_by" boolean default false;

alter table "public"."receipt_templates" add column "show_break_details" boolean default false;

alter table "public"."receipt_templates" add column "show_void_reason" boolean default false;

alter table "public"."vendor_items" alter column "default_cost" set default NULL::numeric;

CREATE INDEX idx_inv_merchant_active ON public.inventory_items USING btree (merchant_id, is_active);

CREATE INDEX idx_orders_inventory_deducted ON public.orders USING btree (id) WHERE (inventory_deducted = false);

CREATE INDEX idx_po_merchant_status ON public.purchase_orders USING btree (merchant_id, status);

CREATE INDEX idx_stock_log_location_date ON public.stock_update_log USING btree (location_id, created_at DESC);

CREATE INDEX idx_inventory_items_stock_mode ON public.inventory_items USING btree (stock_mode);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.authorize_location_access(p_location_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_merchant_id UUID;
BEGIN
    -- Service role has no JWT sub — allow through (server-side only, already trusted)
    IF auth.jwt()->>'sub' IS NULL THEN
        RETURN;
    END IF;

    SELECT merchant_id INTO v_merchant_id
    FROM locations
    WHERE id = p_location_id;

    IF v_merchant_id IS NULL THEN
        RAISE EXCEPTION 'Location % not found', p_location_id
            USING ERRCODE = '42501';
    END IF;

    -- Use existing RLS helpers: merchant admin OR direct location member
    IF NOT (is_merchant_admin(v_merchant_id) OR is_location_member(p_location_id)) THEN
        RAISE EXCEPTION 'Unauthorized: no access to location %', p_location_id
            USING ERRCODE = '42501';
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.authorize_merchant_access(p_merchant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.jwt()->>'sub' IS NULL THEN
        RETURN;
    END IF;

    IF NOT is_merchant_admin(p_merchant_id) THEN
        RAISE EXCEPTION 'Unauthorized: no access to merchant %', p_merchant_id
            USING ERRCODE = '42501';
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_adhoc_expense(p_merchant_id uuid, p_location_id uuid, p_expense_vendor_name text, p_expense_category text, p_expense_notes text, p_payment_method text, p_card_last_four text, p_total_amount numeric, p_user_id text, p_user_name text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_po_id     UUID;
    v_po_number TEXT;
    v_item      JSONB;
BEGIN
    -- Authorization check (#7)
    IF p_location_id IS NOT NULL THEN
        PERFORM public.authorize_location_access(p_location_id);
    ELSE
        PERFORM public.authorize_merchant_access(p_merchant_id);
    END IF;

    v_po_number := 'EXP-' || to_char(now(), 'YYYYMMDD') || '-' ||
                   UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6));

    INSERT INTO purchase_orders (
        merchant_id, location_id, po_number, status, total_amount,
        is_adhoc_expense, expense_vendor_name, expense_category, expense_notes,
        payment_method, card_last_four, paid_at, created_by
    ) VALUES (
        p_merchant_id, p_location_id, v_po_number, 'paid', p_total_amount,
        true, p_expense_vendor_name, p_expense_category, p_expense_notes,
        p_payment_method, p_card_last_four, now(),
        CASE WHEN p_user_id ~ '^[0-9a-f-]{36}$' THEN p_user_id::UUID ELSE NULL END
    )
    RETURNING id INTO v_po_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO purchase_order_items (
            purchase_order_id, item_name,
            quantity_ordered, unit_cost, line_total
        ) VALUES (
            v_po_id,
            v_item->>'name',
            COALESCE((v_item->>'quantity')::NUMERIC, 1),
            COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
            COALESCE((v_item->>'line_total')::NUMERIC, 0)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success',           true,
        'purchase_order_id', v_po_id,
        'po_number',         v_po_number
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_items_for_location_library(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', mi.id,
                'name', mi.name,
                'description', mi.description,
                'image', mi.image,
                'allergens', mi.allergens,
                'meal_types', mi.meal_types,
                'card_bg_color', mi.card_bg_color,
                'location_id', mi.location_id,

                -- Stock info
                'stock_tracking_mode', mi.stock_tracking_mode,

                -- Tax & Inventory Control (L1 - Base)
                'tax_category', mi.tax_category,
                'is_tax_exempt', mi.is_tax_exempt,
                'available_channels', mi.available_channels,

                -- Level 1: Base price
                'base_price', mi.price,
                'base_cash_price', mi.cash_price,
                'base_delivery_price', mi.delivery_price,
                'base_availability', mi.availability,

                -- Level 2: Location item override (if exists)
                'location_override', CASE
                    WHEN lio.id IS NOT NULL THEN json_build_object(
                        'id', lio.id,
                        'custom_price', lio.custom_price,
                        'custom_cash_price', lio.custom_cash_price,
                        'price_modifier', lio.price_modifier,
                        'price_modifier_type', lio.price_modifier_type,
                        'is_available', lio.is_available,
                        'stock_tracking_mode', lio.stock_tracking_mode,
                        'current_stock', lio.current_stock,
                        'tax_category', lio.tax_category,
                        'is_tax_exempt', lio.is_tax_exempt,
                        'available_channels', lio.available_channels,
                        'custom_delivery_price', lio.custom_delivery_price
                    )
                    ELSE NULL
                END,

                -- ============================================================
                -- EFFECTIVE PRICE: L2 > L1 ONLY (NO CATEGORY PRICES!)
                -- ============================================================
                'effective_price', COALESCE(
                    lio.custom_price,            -- L2: Location item override
                    mi.price                     -- L1: Base
                ),

                'effective_cash_price', COALESCE(
                    lio.custom_cash_price,
                    mi.cash_price
                ),

                'effective_delivery_price', COALESCE(
                    lio.custom_delivery_price,       -- L2: Location item override
                    mi.delivery_price                -- L1: Base
                ),

                'effective_availability', COALESCE(
                    lio.is_available,
                    mi.availability
                ),

                -- Effective Tax & Inventory (L2 > L1)
                'effective_tax_category', COALESCE(
                    lio.tax_category,
                    mi.tax_category
                ),
                'effective_is_tax_exempt', COALESCE(
                    lio.is_tax_exempt,
                    mi.is_tax_exempt
                ),
                'effective_available_channels', COALESCE(
                    lio.available_channels,
                    mi.available_channels
                ),

                -- Price source indicator
                'price_source', CASE
                    WHEN lio.custom_price IS NOT NULL THEN 'location_item'
                    ELSE 'base'
                END,

                -- Override flags
                'has_location_override', (lio.id IS NOT NULL),

                -- ============================================================
                -- MODIFIER GROUPS WITH ITEMS
                -- All groups assigned to this item, with location overrides.
                -- Shown in the Edit Item dialog (read-only when location-scoped).
                -- ============================================================
                'modifier_groups', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', mg.id,
                                'name', mg.name,
                                'description', mg.description,

                                -- Base selection rules
                                'base_min_selections', mg.min_selections,
                                'base_max_selections', mg.max_selections,
                                'base_is_required', mg.is_required,
                                'base_is_active', mg.is_active,

                                -- Location override
                                'location_override', CASE
                                    WHEN lmgo.id IS NOT NULL THEN json_build_object(
                                        'id', lmgo.id,
                                        'is_available', lmgo.is_active
                                    )
                                    ELSE NULL
                                END,

                                'effective_availability', COALESCE(lmgo.is_active, mg.is_active),
                                'has_location_override', (lmgo.id IS NOT NULL),

                                -- Modifier items
                                'items', COALESCE(
                                    (
                                        SELECT json_agg(
                                            json_build_object(
                                                'id', mgi.id,
                                                'name', mgi.name,
                                                'description', mgi.description,

                                                -- Base prices
                                                'base_price', mgi.price_modifier,
                                                'base_is_default', mgi.is_default,
                                                'base_is_active', mgi.is_active,

                                                -- Location override
                                                'location_override', CASE
                                                    WHEN lmio.id IS NOT NULL THEN json_build_object(
                                                        'id', lmio.id,
                                                        'custom_price', lmio.price_modifier,
                                                        'is_active', lmio.is_active
                                                    )
                                                    ELSE NULL
                                                END,

                                                -- Effective values
                                                'effective_price', COALESCE(lmio.price_modifier, mgi.price_modifier),
                                                'effective_is_active', COALESCE(lmio.is_active, mgi.is_active),
                                                'has_location_override', (lmio.id IS NOT NULL)
                                            )
                                            ORDER BY mgi.name
                                        )
                                        FROM modifier_group_items mgi
                                        LEFT JOIN location_modifier_item_overrides lmio
                                            ON lmio.modifier_group_item_id = mgi.id
                                            AND lmio.location_id = p_location_id
                                        WHERE mgi.modifier_group_id = mg.id
                                    ),
                                    '[]'::json
                                )
                            )
                            ORDER BY mg.name
                        )
                        FROM menu_item_modifier_groups mimg
                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                        LEFT JOIN location_modifier_group_overrides lmgo
                            ON lmgo.modifier_group_id = mg.id
                            AND lmgo.location_id = p_location_id
                        WHERE mimg.menu_item_id = mi.id
                    ),
                    '[]'::json
                ),

                -- Categories this item belongs to (for UI filtering/display)
                -- NOTE: We show categories but don't use their prices!
                'categories', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', c.id,
                                'name', c.name,
                                'location_id', c.location_id,
                                'location_name', (SELECT l.name FROM locations l WHERE l.id = c.location_id),
                                'is_global', COALESCE(c.is_global, c.location_id IS NULL)
                            ) ORDER BY c.name
                        )
                        FROM category_items ci
                        JOIN categories c ON c.id = ci.category_id
                        WHERE ci.menu_item_id = mi.id
                          AND c.merchant_id = p_merchant_id
                          AND (
                              -- All categories if no location specified
                              p_location_id IS NULL
                              OR
                              -- Global + location-specific categories
                              c.location_id IS NULL
                              OR
                              c.location_id = p_location_id
                          )
                    ),
                    '[]'::json
                ),

                'created_at', mi.created_at,
                'updated_at', mi.updated_at
            )
            ORDER BY mi.name
        ), '[]'::json)
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio
            ON lio.menu_item_id = mi.id
            AND lio.location_id = p_location_id
        WHERE mi.merchant_id = p_merchant_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pos_full_sync(p_location_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'synced_at', NOW(),
        'location_id', p_location_id,
        'menus', (
            SELECT COALESCE(json_agg(
                -- Inject display_order into the menu JSON
                (get_menu_with_categories(m.id, p_location_id)::jsonb
                 || jsonb_build_object(
                      'display_order',
                      COALESCE(lm.display_order, m.display_order)
                    )
                )::json
                ORDER BY COALESCE(lm.display_order, m.display_order) NULLS LAST, m.name
            ), '[]'::json)
            FROM menus m
            LEFT JOIN location_menus lm
              ON lm.menu_id = m.id
              AND lm.location_id = p_location_id
            WHERE m.merchant_id = (SELECT merchant_id FROM locations WHERE id = p_location_id)
            AND (
                (m.location_id IS NULL)
                OR
                (m.location_id = p_location_id)
            )
            AND (
                -- For location-specific menus, check their is_active
                (m.location_id = p_location_id AND m.is_active = true)
                OR
                -- For global menus, check global is_active OR location override is_active
                (m.location_id IS NULL AND (m.is_active = true OR lm.is_active = true))
            )
        )
    ) INTO result;

    RETURN result;
END;
$function$
;

-- CREATE OR REPLACE FUNCTION public.get_pos_inventory_sync(p_location_id uuid)
--  RETURNS json
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--     v_merchant_id UUID;
--     v_result      JSON;
-- BEGIN
--     SELECT merchant_id INTO v_merchant_id
--     FROM locations
--     WHERE id = p_location_id;

--     IF v_merchant_id IS NULL THEN
--         RETURN json_build_object('error', 'Location not found');
--     END IF;

--     SELECT json_agg(row_to_json(t)) INTO v_result
--     FROM (
--         SELECT
--             ii.id,
--             ii.name,
--             ii.sku,
--             ii.unit_type,
--             ii.stock_mode,
--             ii.reorder_point,
--             ii.reorder_quantity,
--             ii.is_active,
--             ii.updated_at,
--             COALESCE(lis.stock_quantity, 0)              AS stock_quantity,
--             -- Effective cost: location override → global (no per-row scalar function)
--             COALESCE(lio.cost_per_unit, ii.cost_per_unit, 0) AS effective_cost,
--             -- Effective reorder point: location override → global
--             COALESCE(lio.reorder_point, ii.reorder_point)    AS effective_reorder_point
--         FROM inventory_items ii
--         LEFT JOIN location_inventory_stock lis
--                ON lis.inventory_item_id = ii.id
--               AND lis.location_id       = p_location_id
--         LEFT JOIN location_inventory_overrides lio
--                ON lio.inventory_item_id = ii.id
--               AND lio.location_id       = p_location_id
--         WHERE ii.merchant_id = v_merchant_id
--           AND ii.is_active   = true
--         ORDER BY ii.name
--     ) t;

--     RETURN COALESCE(v_result, '[]'::json);
-- END;
-- $function$
-- ;

CREATE OR REPLACE FUNCTION public.initialize_location_stock(p_location_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- Authorization check (#7)
    PERFORM public.authorize_location_access(p_location_id);

    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity)
    SELECT p_location_id, ii.id, 0
    FROM inventory_items ii
    JOIN locations l ON l.merchant_id = ii.merchant_id
    WHERE l.id         = p_location_id
      AND ii.location_id IS NULL
      AND ii.is_active   = true
      AND NOT EXISTS (
          SELECT 1 FROM location_inventory_stock lis
          WHERE lis.location_id       = p_location_id
            AND lis.inventory_item_id = ii.id
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_purchase_order_delivery(p_purchase_order_id uuid, p_delivered_by text, p_delivery_notes text, p_logged_by_user_id text, p_logged_by_name text, p_received_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_location_id       UUID;
    v_merchant_id       UUID;
    v_item              JSONB;
    v_inventory_item_id UUID;
    v_qty_received      NUMERIC;
    v_qty_ordered       NUMERIC;
    v_prev_stock        NUMERIC;
    v_new_stock         NUMERIC;
    v_items_processed   INTEGER := 0;
    v_discrepancies     JSONB   := '[]'::jsonb;
BEGIN
    SELECT po.location_id, po.merchant_id
    INTO   v_location_id, v_merchant_id
    FROM   purchase_orders po
    WHERE  po.id = p_purchase_order_id;

    -- Authorization check (#7)
    PERFORM public.authorize_location_access(v_location_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
    LOOP
        v_inventory_item_id := (v_item->>'inventory_item_id')::UUID;
        v_qty_received      := (v_item->>'quantity_received')::NUMERIC;

        -- Capture pre-receive stock WITH row lock (#5)
        -- FOR UPDATE locks the row so no concurrent transaction can modify it
        -- between this read and the increment below.
        SELECT COALESCE(stock_quantity, 0)
        INTO   v_prev_stock
        FROM   location_inventory_stock
        WHERE  location_id      = v_location_id
          AND  inventory_item_id = v_inventory_item_id
        FOR UPDATE;

        -- If no row exists yet, prev_stock is 0 (FOR UPDATE returns nothing → NULL → COALESCE 0)
        v_prev_stock := COALESCE(v_prev_stock, 0);

        -- Get ordered quantity for discrepancy detection
        SELECT quantity_ordered
        INTO   v_qty_ordered
        FROM   purchase_order_items
        WHERE  purchase_order_id = p_purchase_order_id
          AND  inventory_item_id = v_inventory_item_id;

        -- Update received qty on PO line
        UPDATE purchase_order_items
        SET    quantity_received = v_qty_received
        WHERE  purchase_order_id = p_purchase_order_id
          AND  inventory_item_id = v_inventory_item_id;

        -- Increment stock (internal helper — auth already done above)
        PERFORM public.increment_location_stock(v_inventory_item_id, v_location_id, v_qty_received);

        -- Capture post-receive stock for audit log
        SELECT COALESCE(stock_quantity, 0)
        INTO   v_new_stock
        FROM   location_inventory_stock
        WHERE  location_id      = v_location_id
          AND  inventory_item_id = v_inventory_item_id;

        -- Audit log entry
        INSERT INTO stock_update_log (
            merchant_id, location_id, inventory_item_id,
            previous_stock, new_stock, change_amount,
            update_reason, update_source,
            updated_by_user_id, updated_by_name,
            purchase_order_id
        ) VALUES (
            v_merchant_id, v_location_id, v_inventory_item_id,
            v_prev_stock, v_new_stock, v_qty_received,
            'received_delivery', 'delivery',
            p_logged_by_user_id, p_logged_by_name,
            p_purchase_order_id
        );

        IF v_qty_ordered IS NOT NULL AND v_qty_received <> v_qty_ordered THEN
            v_discrepancies := v_discrepancies || jsonb_build_object(
                'inventory_item_id', v_inventory_item_id,
                'quantity_ordered',  v_qty_ordered,
                'quantity_received', v_qty_received,
                'difference',        v_qty_received - v_qty_ordered
            );
        END IF;

        v_items_processed := v_items_processed + 1;
    END LOOP;

    UPDATE purchase_orders
    SET
        status                     = 'received',
        received_at                = now(),
        delivered_by               = p_delivered_by,
        delivered_at               = now(),
        delivery_notes             = p_delivery_notes,
        delivery_logged_by_user_id = p_logged_by_user_id,
        delivery_logged_by_name    = p_logged_by_name,
        updated_at                 = now()
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
        'success',         true,
        'items_processed', v_items_processed,
        'discrepancies',   v_discrepancies
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_purchase_order_payment(p_purchase_order_id uuid, p_payment_method text, p_amount numeric, p_paid_by_user_id text, p_paid_by_name text, p_paid_to text, p_card_last_four text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_payment_id  UUID;
    v_vendor_id   UUID;
    v_vendor_name TEXT;
    v_location_id UUID;
    v_merchant_id UUID;
BEGIN
    SELECT po.vendor_id, v.name, po.location_id, po.merchant_id
    INTO   v_vendor_id, v_vendor_name, v_location_id, v_merchant_id
    FROM   purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE  po.id = p_purchase_order_id;

    -- Authorization check (#7): use location if available, otherwise merchant
    IF v_location_id IS NOT NULL THEN
        PERFORM public.authorize_location_access(v_location_id);
    ELSE
        PERFORM public.authorize_merchant_access(v_merchant_id);
    END IF;

    INSERT INTO purchase_order_payments (
        purchase_order_id, payment_method, card_last_four, amount,
        vendor_id, vendor_name, paid_to,
        paid_by_user_id, paid_by_name, notes
    ) VALUES (
        p_purchase_order_id, p_payment_method, p_card_last_four, p_amount,
        v_vendor_id, v_vendor_name, p_paid_to,
        p_paid_by_user_id, p_paid_by_name, p_notes
    )
    RETURNING id INTO v_payment_id;

    UPDATE purchase_orders
    SET
        status         = 'paid',
        paid_at        = now(),
        payment_method = p_payment_method,
        card_last_four = p_card_last_four,
        updated_at     = now()
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_order_inventory_deduction(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_location_id      UUID;
    v_already_deducted BOOLEAN;
    v_order_item       RECORD;
    v_recipe_item      RECORD;
    v_modifier         RECORD;
BEGIN
    SELECT location_id, COALESCE(inventory_deducted, FALSE)
    INTO   v_location_id, v_already_deducted
    FROM   orders
    WHERE  id = p_order_id;

    IF v_location_id IS NULL THEN
        RETURN;
    END IF;

    -- Idempotency guard (#4): skip if already processed
    IF v_already_deducted = TRUE THEN
        RETURN;
    END IF;

    -- Authorization check (#7)
    PERFORM public.authorize_location_access(v_location_id);

    -- Path 1: Direct inventory_item_id link, stock_mode = 'stock_tracking' only (#8)
    FOR v_order_item IN
        SELECT
            oi.quantity,
            mir.inventory_item_id,
            mir.quantity_used,
            mir.quantity_multiplier
        FROM order_items oi
        JOIN menu_item_recipes mir ON mir.menu_item_id = oi.menu_item_id
        JOIN inventory_items ii   ON ii.id = mir.inventory_item_id
        WHERE oi.order_id           = p_order_id
          AND oi.is_voided          = false
          AND mir.inventory_item_id IS NOT NULL
          AND ii.stock_mode         = 'stock_tracking'
    LOOP
        PERFORM public.decrement_location_stock(
            v_order_item.inventory_item_id,
            v_location_id,
            v_order_item.quantity_used * v_order_item.quantity_multiplier * v_order_item.quantity
        );
    END LOOP;

    -- Path 2: Recipe-based — recipe_id → recipe_items → inventory_item_id
    FOR v_order_item IN
        SELECT
            oi.quantity,
            mir.recipe_id,
            mir.quantity_multiplier
        FROM order_items oi
        JOIN menu_item_recipes mir ON mir.menu_item_id = oi.menu_item_id
        WHERE oi.order_id           = p_order_id
          AND oi.is_voided          = false
          AND mir.recipe_id         IS NOT NULL
          AND mir.inventory_item_id IS NULL
    LOOP
        FOR v_recipe_item IN
            SELECT ri.inventory_item_id, ri.quantity
            FROM recipe_items ri
            JOIN inventory_items ii ON ii.id = ri.inventory_item_id
            WHERE ri.recipe_id          = v_order_item.recipe_id
              AND ri.inventory_item_id  IS NOT NULL
              AND ii.stock_mode         = 'stock_tracking'
        LOOP
            PERFORM public.decrement_location_stock(
                v_recipe_item.inventory_item_id,
                v_location_id,
                v_recipe_item.quantity * v_order_item.quantity_multiplier * v_order_item.quantity
            );
        END LOOP;
    END LOOP;

    -- Path 3: Modifier deductions
    FOR v_modifier IN
        SELECT
            oim.quantity,
            mgir.inventory_item_id,
            mgir.quantity_used
        FROM order_item_modifiers oim
        JOIN order_items oi ON oi.id = oim.order_item_id
        JOIN modifier_group_item_recipes mgir ON mgir.modifier_group_item_id = oim.modifier_item_id
        JOIN inventory_items ii ON ii.id = mgir.inventory_item_id
        WHERE oi.order_id   = p_order_id
          AND oi.is_voided  = false
          AND ii.stock_mode = 'stock_tracking'
    LOOP
        PERFORM public.decrement_location_stock(
            v_modifier.inventory_item_id,
            v_location_id,
            v_modifier.quantity_used * v_modifier.quantity
        );
    END LOOP;

    -- Mark as processed to prevent double-deduction (#4)
    UPDATE orders SET inventory_deducted = TRUE WHERE id = p_order_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_location_stock(p_inventory_item_id uuid, p_location_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Authorization check (#7)
    PERFORM public.authorize_location_access(p_location_id);

    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity, updated_at)
    VALUES (p_location_id, p_inventory_item_id, GREATEST(0, p_quantity), now())
    ON CONFLICT (location_id, inventory_item_id)
    DO UPDATE SET
        stock_quantity = GREATEST(0, p_quantity),
        updated_at     = now();

    -- Sync legacy aggregate on inventory_items
    UPDATE inventory_items
    SET
        current_stock = (
            SELECT COALESCE(SUM(stock_quantity), 0)
            FROM location_inventory_stock
            WHERE inventory_item_id = p_inventory_item_id
        ),
        updated_at = now()
    WHERE id = p_inventory_item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_init_stock_for_new_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.location_id IS NULL THEN
        INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity)
        SELECT l.id, NEW.id, 0
        FROM locations l
        WHERE l.merchant_id = NEW.merchant_id
          AND l.is_active   = true
        ON CONFLICT (location_id, inventory_item_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_menu_item_with_recipe(p_menu_item_id uuid, p_ingredients jsonb DEFAULT NULL::jsonb, p_recipe_items jsonb DEFAULT NULL::jsonb, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_merchant_id UUID;
    v_items       JSONB;
    v_item        JSONB;
BEGIN
    SELECT merchant_id INTO v_merchant_id
    FROM menu_items
    WHERE id = p_menu_item_id;

    IF v_merchant_id IS NULL THEN
        RAISE EXCEPTION 'Menu item % not found', p_menu_item_id;
    END IF;

    -- Authorization: verify the caller owns this merchant
    PERFORM public.authorize_merchant_access(v_merchant_id);

    -- p_recipe_items takes precedence over p_ingredients
    v_items := COALESCE(p_recipe_items, p_ingredients);

    IF v_items IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM menu_item_recipes
    WHERE menu_item_id = p_menu_item_id
      AND merchant_id  = v_merchant_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        INSERT INTO menu_item_recipes (
            menu_item_id,
            merchant_id,
            inventory_item_id,
            recipe_id,
            quantity_used,
            quantity_multiplier
        ) VALUES (
            p_menu_item_id,
            v_merchant_id,
            NULLIF((v_item->>'inventory_item_id'), '')::UUID,
            NULLIF((v_item->>'recipe_id'), '')::UUID,
            COALESCE(
                (v_item->>'quantity_used')::NUMERIC,
                (v_item->>'quantity')::NUMERIC,
                1
            ),
            COALESCE((v_item->>'quantity_multiplier')::NUMERIC, 1)
        );
    END LOOP;
END;
$function$
;


  create policy "modifier_group_item_recipes_delete"
  on "public"."modifier_group_item_recipes"
  as permissive
  for delete
  to public
using (public.is_merchant_owner(merchant_id));



  create policy "modifier_group_item_recipes_insert"
  on "public"."modifier_group_item_recipes"
  as permissive
  for insert
  to public
with check (public.is_merchant_admin(merchant_id));



  create policy "modifier_group_item_recipes_select"
  on "public"."modifier_group_item_recipes"
  as permissive
  for select
  to public
using ((public.is_merchant_admin(merchant_id) OR (EXISTS ( SELECT 1
   FROM (public.location_members lm
     JOIN public.locations l ON ((l.id = lm.location_id)))
  WHERE ((lm.user_id = public.current_user_id()) AND (lm.is_active = true) AND (l.merchant_id = modifier_group_item_recipes.merchant_id))))));



  create policy "modifier_group_item_recipes_update"
  on "public"."modifier_group_item_recipes"
  as permissive
  for update
  to public
using (public.is_merchant_admin(merchant_id));



  create policy "recipes_delete"
  on "public"."recipes"
  as permissive
  for delete
  to public
using (public.is_merchant_owner(merchant_id));



  create policy "recipes_insert"
  on "public"."recipes"
  as permissive
  for insert
  to public
with check (public.is_merchant_admin(merchant_id));



  create policy "recipes_select"
  on "public"."recipes"
  as permissive
  for select
  to public
using ((public.is_merchant_admin(merchant_id) OR (EXISTS ( SELECT 1
   FROM (public.location_members lm
     JOIN public.locations l ON ((l.id = lm.location_id)))
  WHERE ((lm.user_id = public.current_user_id()) AND (lm.is_active = true) AND (l.merchant_id = recipes.merchant_id))))));



  create policy "recipes_update"
  on "public"."recipes"
  as permissive
  for update
  to public
using (public.is_merchant_admin(merchant_id));


CREATE TRIGGER init_stock_for_new_item AFTER INSERT ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.trigger_init_stock_for_new_item();


