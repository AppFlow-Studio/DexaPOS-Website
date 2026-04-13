alter table "public"."cash_drawer_operations" drop constraint "chk_operation_type";

alter table "public"."cash_drawer_operations" drop constraint "valid_operation_type";

alter table "public"."cash_drawer_sessions" drop constraint "chk_session_status";

alter table "public"."cash_drawer_sessions" drop constraint "valid_session_status";

alter table "public"."chargebacks" drop constraint "valid_chargeback_status";

alter table "public"."order_payments" drop constraint "valid_card_exp";

alter table "public"."payment_events" drop constraint "valid_event_type";

alter table "public"."reversals" drop constraint "valid_reversal_status";

alter table "public"."settlement_batches" drop constraint "valid_batch_status";

drop function if exists "public"."calculate_tip_distribution_v2"(p_merchant_id uuid, p_location_id uuid, p_session_date date, p_shift_period text, p_calculated_by uuid);

drop function if exists "public"."cancel_reservation_for_voided_order"(p_order_id uuid, p_reason text);

drop function if exists "public"."mark_dlq_replay_success"(p_id uuid);

drop function if exists "public"."merge_orderout_connected_channels"(p_restaurant_id uuid, p_updates jsonb);

drop function if exists "public"."merge_orderout_platform_statuses"(p_link_id uuid, p_updates jsonb);

drop function if exists "public"."touch_dlq_replay_failure"(p_id uuid, p_error_message text);

drop function if exists "public"."void_order_and_cancel_reservation"(p_order_id uuid, p_void_reason text);

drop index if exists "public"."idx_discounts_end_date";

drop index if exists "public"."idx_discounts_merchant_location";

drop index if exists "public"."idx_tip_distribution_details_staff_name";

alter table "public"."orderout_restaurants" alter column "connected_channels" set default '[]'::jsonb;

alter table "public"."tip_distribution_details" drop column "staff_name";

alter table "public"."cash_drawer_operations" add constraint "chk_operation_type" CHECK (((operation_type)::text = ANY ((ARRAY['cash_sale'::character varying, 'cash_refund'::character varying, 'pay_in'::character varying, 'pay_out'::character varying, 'no_sale'::character varying, 'cash_drop'::character varying, 'opening_count'::character varying, 'closing_count'::character varying, 'tip_out'::character varying])::text[]))) not valid;

alter table "public"."cash_drawer_operations" validate constraint "chk_operation_type";

alter table "public"."cash_drawer_operations" add constraint "valid_operation_type" CHECK (((operation_type)::text = ANY ((ARRAY['cash_sale'::character varying, 'cash_refund'::character varying, 'pay_in'::character varying, 'pay_out'::character varying, 'no_sale'::character varying, 'cash_drop'::character varying, 'tip_out'::character varying, 'opening_count'::character varying, 'closing_count'::character varying])::text[]))) not valid;

alter table "public"."cash_drawer_operations" validate constraint "valid_operation_type";

alter table "public"."cash_drawer_sessions" add constraint "chk_session_status" CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'counting'::character varying, 'closed'::character varying, 'reconciled'::character varying])::text[]))) not valid;

alter table "public"."cash_drawer_sessions" validate constraint "chk_session_status";

alter table "public"."cash_drawer_sessions" add constraint "valid_session_status" CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'reconciled'::character varying])::text[]))) not valid;

alter table "public"."cash_drawer_sessions" validate constraint "valid_session_status";

alter table "public"."chargebacks" add constraint "valid_chargeback_status" CHECK (((status)::text = ANY ((ARRAY['notified'::character varying, 'under_review'::character varying, 'defended'::character varying, 'won'::character varying, 'lost'::character varying, 'expired'::character varying])::text[]))) not valid;

alter table "public"."chargebacks" validate constraint "valid_chargeback_status";

alter table "public"."order_payments" add constraint "valid_card_exp" CHECK ((((card_exp_month IS NULL) AND (card_exp_year IS NULL)) OR (((card_exp_month >= 1) AND (card_exp_month <= 12)) AND ((card_exp_year)::numeric >= EXTRACT(year FROM CURRENT_DATE))))) not valid;

alter table "public"."order_payments" validate constraint "valid_card_exp";

alter table "public"."payment_events" add constraint "valid_event_type" CHECK (((event_type)::text = ANY ((ARRAY['created'::character varying, 'authorized'::character varying, 'auth_adjusted'::character varying, 'tip_adjusted'::character varying, 'captured'::character varying, 'settled'::character varying, 'voided'::character varying, 'declined'::character varying, 'error'::character varying, 'expired'::character varying, 'refund_initiated'::character varying, 'refund_completed'::character varying, 'chargeback_received'::character varying, 'chargeback_defended'::character varying, 'chargeback_resolved'::character varying])::text[]))) not valid;

alter table "public"."payment_events" validate constraint "valid_event_type";

alter table "public"."reversals" add constraint "valid_reversal_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]))) not valid;

alter table "public"."reversals" validate constraint "valid_reversal_status";

alter table "public"."settlement_batches" add constraint "valid_batch_status" CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'submitted'::character varying, 'settled'::character varying, 'funded'::character varying])::text[]))) not valid;

alter table "public"."settlement_batches" validate constraint "valid_batch_status";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_order_totals_fast(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$DECLARE
v_card_subtotal numeric;
v_cash_subtotal numeric;
v_card_tax numeric;
v_cash_tax numeric;
v_discount numeric;
v_service_charge numeric;
v_amount_paid numeric;
v_original_card_subtotal numeric;
v_original_cash_subtotal numeric;
v_unpaid_card_total numeric;
v_unpaid_cash_total numeric;
v_effective_paid numeric;
v_payment_refunded numeric;
v_card_total_calc numeric;
v_payment_voided numeric;
v_payment_based_due numeric;
v_custom_refund_balance numeric;
v_order record;
BEGIN
-- Get original (pre-discount) subtotals and discount amount
SELECT 
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
    COALESCE(SUM(discount_amount), 0)
INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get post-discount values (subtotal and tax_amount are already discounted per item)
SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

-- Get full order record (need payment_status for fully-paid guard)
SELECT *
INTO v_order
FROM public.orders WHERE id = p_order_id;

v_service_charge := COALESCE(v_order.service_charge, 0);
v_amount_paid := COALESCE(v_order.amount_paid, 0);

-- Calculate amount_due from UNPAID items (item-level calculation)
-- Account for refunded_quantity: refunded items need to be paid again
-- Formula: unpaid_qty = quantity - paid_quantity + refunded_quantity
SELECT
    COALESCE(SUM(
        ROUND(subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(tax_amount * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0),
    COALESCE(SUM(
        ROUND(cash_subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(cash_tax_amount * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0)
INTO v_unpaid_card_total, v_unpaid_cash_total
FROM public.order_items
WHERE order_id = p_order_id
    AND is_voided = false
    AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;

-- Calculate effective amount paid from payments (payment-level calculation)
-- This handles custom amount refunds that aren't tied to specific items
-- Use original_amount (card-equivalent) to avoid phantom balance when cash payments
-- are made at lower prices than card prices
SELECT
    COALESCE(SUM(
        COALESCE(original_amount, amount)
        - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)
    ), 0),
    COALESCE(SUM(COALESCE(refunded_amount, 0)), 0)
INTO v_effective_paid, v_payment_refunded
FROM public.order_payments
WHERE order_id = p_order_id
    AND status IN ('captured', 'partially_refunded', 'refunded')
    AND is_voided = false;

-- Check for voided payments to prevent the guard from misfiring
SELECT COALESCE(SUM(COALESCE(original_amount, amount)), 0)
INTO v_payment_voided
FROM public.order_payments
WHERE order_id = p_order_id
  AND (status = 'void' OR is_voided = true);


-- Calculate card total for payment-based due calculation
v_card_total_calc := v_card_subtotal + v_card_tax + v_service_charge;

-- Payment-based amount due = total - effective_paid (handles custom refunds)
v_payment_based_due := GREATEST(v_card_total_calc - v_effective_paid, 0);

-- Custom refund balance = payment-based due NOT covered by item-level unpaid amounts
-- This is a flat monetary amount from custom refunds — same regardless of card/cash pricing
v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

-- Guard: If order is marked as paid, has no refunds, and all items are paid,
-- the residual is a false positive from cash/card price difference.
-- Don't inflate amount_due — keep it at 0.
-- CRITICAL: Skip this guard when refunds exist to allow correct recalculation.
-- Guard: If order is marked as paid, has no refunds, and all items are paid,
-- the residual is a false positive from cash/card price difference.
-- Don't inflate amount_due — keep it at 0.
-- CRITICAL: Skip this guard when refunds exist to allow correct recalculation.
IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
    v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
    v_unpaid_cash_total := v_unpaid_cash_total + v_custom_refund_balance;
END IF;

-- Update order with totals
UPDATE public.orders SET
    -- Original subtotals (pre-discount) for reference
    card_subtotal = v_original_card_subtotal,
    cash_subtotal = v_original_cash_subtotal,
    
    -- Discount amount
    discount_amount = v_discount,
    
    -- Effective values (after discount)
    effective_subtotal = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total = v_card_subtotal + v_card_tax + v_service_charge,
    
    -- Tax amounts (on discounted subtotals)
    card_tax_amount = v_card_tax,
    cash_tax_amount = v_cash_tax,
    
    -- Totals (discounted subtotal + tax + service)
    card_total = v_card_subtotal + v_card_tax + v_service_charge,
    cash_total = v_cash_subtotal + v_cash_tax + v_service_charge,
    
    -- Legacy fields
    subtotal = v_card_subtotal,
    tax_amount = v_card_tax,
    total_amount = v_card_subtotal + v_card_tax + v_service_charge,
    
    -- Amount due (calculated from UNPAID items, not total - paid)
    amount_due = v_unpaid_card_total,
    cash_amount_due = v_unpaid_cash_total,
    
    updated_at = now()
WHERE id = p_order_id;

RETURN jsonb_build_object(
    'success', true,
    'card_subtotal', v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount', v_discount,
    'card_tax', v_card_tax,
    'card_total', v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total', v_cash_subtotal + v_cash_tax + v_service_charge,
    'amount_due', v_unpaid_card_total,
    'cash_amount_due', v_unpaid_cash_total
);
END;$function$
;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_cancel_reason text DEFAULT 'Customer cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_status TEXT;
  v_result JSON;
BEGIN
  -- Get order status
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- For draft/pending orders, we can cancel with lower permission
  IF v_order_status IN ('draft', 'pending') THEN
    -- Just need regular order manage permission
    -- IF NOT has_permission('location.orders.manage') THEN
    --   RAISE EXCEPTION 'Permission denied';
    -- END IF;

    -- Delete items (hard delete for draft)
    DELETE FROM public.order_item_modifiers oim
    USING public.order_items oi
    WHERE oim.order_item_id = oi.id AND oi.order_id = p_order_id;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    -- Update order to cancelled
    UPDATE public.orders
    SET 
      status = 'cancelled',
      void_reason = p_cancel_reason,
      updated_at = NOW()
    WHERE id = p_order_id;

    -- Close table session if linked
    UPDATE public.table_sessions
    SET 
      is_active = FALSE,
      status = 'available',
      closed_at = NOW()
    WHERE order_id = p_order_id AND is_active = TRUE;

    SELECT json_build_object(
      'success', true,
      'order_id', p_order_id,
      'action', 'cancelled',
      'reason', p_cancel_reason
    ) INTO v_result;

    RETURN v_result;
  ELSE
    -- For confirmed orders, use void_order
    RETURN public.void_order(p_order_id, p_cancel_reason);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_order_items(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_status TEXT;
  v_removed_count INTEGER;
  v_result JSON;
BEGIN
  -- Verify order and status
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot clear items from % orders', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied';
  -- END IF;

  -- Delete all modifiers
  DELETE FROM public.order_item_modifiers oim
  USING public.order_items oi
  WHERE oim.order_item_id = oi.id AND oi.order_id = p_order_id;

  -- Delete all items
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  -- Reset order totals
  UPDATE public.orders
  SET 
    subtotal = 0,
    tax_amount = 0,
    total_amount = 0,
    updated_at = NOW()
  WHERE id = p_order_id;

  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'removed_count', v_removed_count
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_items_for_location(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
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
                'meal_types', mi.meal_types,
                'allergens', mi.allergens,
                'card_bg_color', mi.card_bg_color,
                'stock_tracking_mode', mi.stock_tracking_mode,
                
                -- Base prices (Level 1)
                'base_price', mi.price,
                'base_cash_price', mi.cash_price,
                'base_delivery_price', mi.delivery_price,
                'base_availability', mi.availability,

                -- Location override (Level 2)
                'location_override', CASE
                    WHEN lio.id IS NOT NULL THEN json_build_object(
                        'id', lio.id,
                        'custom_price', lio.custom_price,
                        'custom_cash_price', lio.custom_cash_price,
                        'custom_delivery_price', lio.custom_delivery_price,
                        'price_modifier', lio.price_modifier,
                        'price_modifier_type', lio.price_modifier_type,
                        'is_available', lio.is_available,
                        'stock_tracking_mode', lio.stock_tracking_mode,
                        'current_stock', lio.current_stock,
                        'low_stock_threshold', lio.low_stock_threshold
                    )
                    ELSE NULL
                END,

                -- Effective values
                'effective_price', COALESCE(lio.custom_price, mi.price),
                'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
                'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
                'effective_availability', COALESCE(lio.is_available, mi.availability),
                
                -- UI flags
                'has_location_override', (lio.id IS NOT NULL),
                'price_source', CASE
                    WHEN lio.custom_price IS NOT NULL THEN 'location_override'
                    ELSE 'base'
                END,
--   NEW: Modifier Groups with Location Overrides
                'modifier_groups', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', mg.id,
                            'name', mg.name,
                            'description', mg.description,
                            'min_selections', mg.min_selections,
                            'max_selections', mg.max_selections,
                            'is_required', mg.is_required,
                            
                            -- Group Availability: Location Override > Global Default
                            'is_active', COALESCE(lmgo.is_active, true),
                            
                            'items', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', mgi.id,
                                        'name', mgi.name,
                                        'description', mgi.description,
                                        
                                        -- Price: Location Override > Global Base
                                        'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                        
                                        -- Availability: Location Override > Global Base
                                        'is_active', (
                                            mgi.is_active = true 
                                            AND COALESCE(lmio_mod.is_active, true) = true
                                        ),
                                        
                                        -- Stock: Location Specific
                                        'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                        'current_stock', lmio_mod.current_stock
                                    ) ORDER BY mgi.name ASC
                                ), '[]'::json)
                                FROM modifier_group_items mgi
                                -- JOIN: Location Item Overrides
                                LEFT JOIN location_modifier_item_overrides lmio_mod
                                    ON lmio_mod.modifier_group_item_id = mgi.id 
                                    AND lmio_mod.location_id = p_location_id
                                WHERE mgi.modifier_group_id = mg.id
                                -- We usually show even inactive items in the "Library" view so managers can enable them
                                -- But for simplicity, let's filter out globally deleted ones
                            )
                        ) ORDER BY mg.name ASC
                    ), '[]'::json)
                    FROM menu_item_modifier_groups mimg
                    JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                    -- JOIN: Location Group Overrides
                    LEFT JOIN location_modifier_group_overrides lmgo
                        ON lmgo.modifier_group_id = mg.id 
                        AND lmgo.location_id = p_location_id
                    WHERE mimg.menu_item_id = mi.id
                ),
                
                -- Categories
                'categories', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', c.id,
                            'name', c.name
                        )
                    ), '[]'::json)
                    FROM menu_item_categories mic
                    JOIN categories c ON c.id = mic.category_id
                    WHERE mic.menu_item_id = mi.id
                ),
                
                -- Menu Count
                'menu_count', (
                    SELECT COUNT(*) 
                    FROM menu_item_menus mim 
                    WHERE mim.menu_item_id = mi.id
                ),
                
                'created_at', mi.created_at,
                'updated_at', mi.updated_at
            )
            -- FIX: ORDER BY moved inside the aggregation
            ORDER BY mi.name ASC
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

CREATE OR REPLACE FUNCTION public.get_menu_for_location(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
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
        
        'menu_categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id,
                    'category', json_build_object(
                        'id', c.id,
                        'name', c.name,
                        'description', c.description,
                        'image', c.image,
                        'is_active', COALESCE(lco.is_active, c.is_active),
                        'has_override', (lco.id IS NOT NULL)
                    )
                ) 
            ), '[]'::json)
            FROM menu_categories mc
            JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco 
                ON lco.category_id = c.id AND lco.location_id = p_location_id
            WHERE mc.menu_id = m.id
        ),
        
        'menu_item_menus', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mim.id,
                    
                    -- Level 3: Menu-level pricing
                    'custom_price', mim.custom_price,
                    'custom_cash_price', mim.custom_cash_price,
                    'custom_delivery_price', mim.custom_delivery_price,
                    'is_available', mim.is_available,

                    -- Level 4: Location + Menu override
                    'location_menu_override', CASE
                        WHEN lmio.id IS NOT NULL THEN json_build_object(
                            'id', lmio.id,
                            'custom_price', lmio.custom_price,
                            'custom_cash_price', lmio.custom_cash_price,
                            'custom_delivery_price', lmio.custom_delivery_price,
                            'is_available', lmio.is_available
                        )
                        ELSE NULL
                    END,

                    'menu_item', json_build_object(
                        'id', mi.id,
                        'name', mi.name,
                        'description', mi.description,
                        'image', mi.image,
                        'meal_types', mi.meal_types,
                        'allergens', mi.allergens,
                        'card_bg_color', mi.card_bg_color,

                        -- Level 1: Global base
                        'price', mi.price,
                        'cash_price', mi.cash_price,
                        'delivery_price', mi.delivery_price,
                        'availability', mi.availability,

                        -- Level 2: Location item base override
                        'location_item_override', CASE
                            WHEN lio.id IS NOT NULL THEN json_build_object(
                                'id', lio.id,
                                'custom_price', lio.custom_price,
                                'custom_cash_price', lio.custom_cash_price,
                                'custom_delivery_price', lio.custom_delivery_price,
                                'price_modifier', lio.price_modifier,
                                'price_modifier_type', lio.price_modifier_type,
                                'is_available', lio.is_available,
                                'current_stock', lio.current_stock
                            )
                            ELSE NULL
                        END,
                        
                        -- ================================================
                        -- EFFECTIVE PRICE CALCULATION
                        -- Full cascade: Level 4 > Level 2 > Level 3 > Level 1
                        -- ================================================
                        'effective_price', CASE
                            -- Location-owned menu: just use menu price
                            WHEN m.location_id IS NOT NULL THEN 
                                COALESCE(mim.custom_price, mi.price)
                            -- Global menu with location context
                            ELSE COALESCE(
                                lmio.custom_price,                              -- Level 4
                                -- Level 2 with modifier logic
                                CASE 
                                    WHEN lio.price_modifier_type = 'add' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_price, mi.price) + lio.price_modifier
                                    WHEN lio.price_modifier_type = 'percent' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_price, mi.price) * (1 + lio.price_modifier / 100)
                                    WHEN lio.custom_price IS NOT NULL THEN
                                        lio.custom_price
                                    ELSE NULL
                                END,
                                mim.custom_price,                               -- Level 3
                                mi.price                                        -- Level 1
                            )
                        END,
                        
                        'effective_cash_price', CASE
                            WHEN m.location_id IS NOT NULL THEN 
                                COALESCE(mim.custom_cash_price, mi.cash_price)
                            ELSE COALESCE(
                                lmio.custom_cash_price,
                                CASE 
                                    WHEN lio.price_modifier_type = 'add' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_cash_price, mi.cash_price) + lio.price_modifier
                                    WHEN lio.price_modifier_type = 'percent' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_cash_price, mi.cash_price) * (1 + lio.price_modifier / 100)
                                    WHEN lio.custom_cash_price IS NOT NULL THEN
                                        lio.custom_cash_price
                                    ELSE NULL
                                END,
                                mim.custom_cash_price,
                                mi.cash_price
                            )
                        END,
                        
                        'effective_delivery_price', CASE
                            WHEN m.location_id IS NOT NULL THEN
                                COALESCE(mim.custom_delivery_price, mi.delivery_price)
                            ELSE COALESCE(
                                lmio.custom_delivery_price,
                                lio.custom_delivery_price,
                                mim.custom_delivery_price,
                                mi.delivery_price
                            )
                        END,

                        -- Availability: AND logic
                        'effective_availability', (
                            mi.availability = true
                            AND COALESCE(lio.is_available, true) = true
                            AND mim.is_available = true
                            AND COALESCE(lmio.is_available, true) = true
                        ),

                        -- UI helper flags
                        'has_location_item_override', (lio.id IS NOT NULL),
                        'has_menu_override', (mim.custom_price IS NOT NULL),
                        'has_location_menu_override', (lmio.id IS NOT NULL),
                        
                        'price_source', CASE
                            WHEN m.location_id IS NOT NULL AND mim.custom_price IS NOT NULL 
                                THEN 'location_menu'
                            WHEN lmio.custom_price IS NOT NULL 
                                THEN 'location_menu_override'
                            WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL 
                                THEN 'location_item_override'
                            WHEN mim.custom_price IS NOT NULL 
                                THEN 'menu_override'
                            ELSE 'base'
                        END,
                        
                        -- Price breakdown for admin UI
                        'price_breakdown', json_build_object(
                            'level_1_base', mi.price,
                            'level_1_delivery', mi.delivery_price,
                            'level_2_location_item', lio.custom_price,
                            'level_2_location_item_delivery', lio.custom_delivery_price,
                            'level_2_modifier', lio.price_modifier,
                            'level_2_modifier_type', lio.price_modifier_type,
                            'level_3_menu', mim.custom_price,
                            'level_3_menu_delivery', mim.custom_delivery_price,
                            'level_4_location_menu', lmio.custom_price,
                            'level_4_location_menu_delivery', lmio.custom_delivery_price
                        ),
                        
                        'stock_tracking_mode', COALESCE(
                            NULLIF(lio.stock_tracking_mode, 'use_default'),
                            mi.stock_tracking_mode
                        ),
                        'current_stock', lio.current_stock,
--  3. NESTED MODIFIERS (The New Logic)
                        'modifier_groups', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', mg.id,
                                    'name', mg.name,
                                    'min_selections', mg.min_selections,
                                    'max_selections', mg.max_selections,
                                    'is_required', mg.is_required,
                                    
                                    -- Group Availability Override
                                    'is_active', COALESCE(lmgo.is_active, true),
                                    
                                    'items', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mgi.id,
                                                'name', mgi.name,
                                                
                                                -- Modifier Price: Location Override > Global Base
                                                'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                                
                                                -- Modifier Availability: Location Override > Global Base
                                                'is_active', (
                                                    mgi.is_active = true 
                                                    AND COALESCE(lmio_mod.is_active, true) = true
                                                ),

                                                -- Stock Status (Location Specific)
                                                'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                                'current_stock', lmio_mod.current_stock
                                            ) ORDER BY mgi.name
                                        ), '[]'::json)
                                        FROM modifier_group_items mgi
                                        -- LEFT JOIN: Check for Item Override
                                        LEFT JOIN location_modifier_item_overrides lmio_mod
                                            ON lmio_mod.modifier_group_item_id = mgi.id 
                                            AND lmio_mod.location_id = p_location_id
                                        WHERE mgi.modifier_group_id = mg.id
                                    )
                                ) ORDER BY mg.name
                            ), '[]'::json)
                            FROM menu_item_modifier_groups mimg
                            JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                            -- LEFT JOIN: Check for Group Override
                            LEFT JOIN location_modifier_group_overrides lmgo
                                ON lmgo.modifier_group_id = mg.id 
                                AND lmgo.location_id = p_location_id
                            WHERE mimg.menu_item_id = mi.id
                        )
                    )
                )
            ), '[]'::json)
            FROM menu_item_menus mim
            JOIN menu_items mi ON mi.id = mim.menu_item_id
            -- Level 2: Location item base
            LEFT JOIN location_item_overrides lio 
                ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
            -- Level 4: Location + Menu override
            LEFT JOIN location_menu_item_overrides lmio 
                ON lmio.menu_item_id = mi.id 
                AND lmio.menu_id = p_menu_id 
                AND lmio.location_id = p_location_id
            WHERE mim.menu_id = m.id
        ),
        
        'menu_schedules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', ms.id,
                    'schedule', json_build_object(
                        'id', s.id,
                        'name', s.name,
                        'description', s.description,
                        'is_active', s.is_active,
                        'schedule_time_slots', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', sts.id,
                                    'day_of_week', sts.day_of_week,
                                    'start_time', sts.start_time,
                                    'end_time', sts.end_time
                                )
                            ), '[]'::json)
                            FROM schedule_time_slots sts
                            WHERE sts.schedule_id = s.id
                        )
                    )
                )
            ), '[]'::json)
            FROM menu_schedules ms
            JOIN schedules s ON s.id = ms.schedule_id
            WHERE ms.menu_id = m.id
        )
    ) INTO result
    FROM menus m
    WHERE m.id = p_menu_id;
    
    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hq_has_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$DECLARE
  v_user_id text;
  v_has_permission boolean;
BEGIN
  RAISE LOG 'Current User ID %', current_user_id();
  RAISE LOG 'Current DEXA IS ADMIN %', is_dexapos_admin();
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT is_dexapos_admin() THEN
    RETURN false;
  END IF;
 
  SELECT EXISTS (
    SELECT 1
    FROM members m
    JOIN roles r ON r.code = m.role
    JOIN role_permissions rp ON rp.role_code = m.role
    WHERE m.user_id = v_user_id
      AND r.organization_type = 'hq'
      AND rp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  RETURN COALESCE(v_has_permission, false);
END;$function$
;

CREATE OR REPLACE FUNCTION public.is_dexapos_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$-- Check if DexaPOS HQ Clerk Org ID
  SELECT get_my_claim('org_id') = 'org_3Bu8LTB01a5vXfYnOc9ZUznm8lL';$function$
;

CREATE OR REPLACE FUNCTION public.link_order_to_session(p_session_id uuid, p_order_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  -- =========================================
  -- Validation
  -- =========================================
  IF p_order_id IS NULL OR p_session_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Both order_id and session_id are required'
    );
  END IF;

-- BEGIN
  -- Verify session
  IF NOT EXISTS (
    SELECT 1 FROM public.table_sessions
    WHERE id = p_session_id AND is_active = TRUE
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
  ) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Verify order
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
  ) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- -- Check if session exists
  -- SELECT EXISTS(SELECT 1 FROM table_sessions WHERE id = p_session_id)
  -- INTO v_session_exists;

  -- IF NOT v_session_exists THEN
  --   RETURN json_build_object(
  --     'success', false,
  --     'error', 'Session not found'
  --   );
  -- END IF;

  -- =========================================
  -- Bidirectional Update (Atomic)
  -- =========================================

  -- Update order to point to session
  UPDATE orders
  SET
    session_id = p_session_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Update session to point to order
  UPDATE table_sessions
  SET
    order_id = p_order_id,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- Record event if first order
  INSERT INTO public.table_session_events (
    session_id, event_type, event_data,
    triggered_by_staff_id, triggered_by_user_id
  ) VALUES (
    p_session_id, 'order_placed', 
    jsonb_build_object('order_id', p_order_id),
    COALESCE(p_staff_id, user_staff_profile_id()), get_my_claim('sub')
  );

  return json_build_object(
    'success', true,
    'order_id', p_order_id,
    'session_id', p_session_id,
    'linked_at', NOW(),
    'message', 'Order and session linked successfully'
  );

EXCEPTION WHEN OTHERS THEN
  -- Handle any unexpected errors
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;$function$
;

CREATE OR REPLACE FUNCTION public.remove_order_item(p_order_item_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
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
  
  PERFORM recalculate_order_discount(v_order_id);

  -- Return result
  SELECT json_build_object(
    'success', true,
    'removed_item_id', p_order_item_id,
    'order_id', v_order_id,
    'removed_subtotal', v_item_subtotal
  ) INTO v_result;

  RETURN v_result;
END;$function$
;

CREATE OR REPLACE FUNCTION public.remove_order_items_batch(p_order_item_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_removed_count INTEGER := 0;
  v_item_id UUID;
  v_result JSON;
BEGIN
  -- Verify all items belong to same order and order is draft/pending
  SELECT DISTINCT o.id, o.status
  INTO v_order_id, v_order_status
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = ANY(p_order_item_ids)
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order items not found or access denied';
  END IF;

  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot remove items from % orders', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied';
  -- END IF;

  -- Delete modifiers for all items
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = ANY(p_order_item_ids);

  -- Delete items
  DELETE FROM public.order_items
  WHERE id = ANY(p_order_item_ids)
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  SELECT json_build_object(
    'success', true,
    'order_id', v_order_id,
    'removed_count', v_removed_count,
    'removed_item_ids', p_order_item_ids
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid, p_void_reason text DEFAULT 'Order cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
  v_order RECORD;
  v_voided_items_count INTEGER;
  v_voided_payments_count INTEGER;
  v_refund_amount NUMERIC(10, 2) := 0;
  v_result JSON;
  v_new_sync_version integer;
BEGIN
  -- 1. Get order details
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 2. Business Logic Checks
  -- We allow voiding 'pending', 'preparing', 'ready', 'served'.
  -- We only block if it's already 'void'.
  IF v_order.status = 'void' THEN
    RAISE EXCEPTION 'Order is already voided';
  END IF;

  -- Optional: Prevent voiding 'completed' (historical) orders if you prefer strict accounting
  -- IF v_order.status = 'completed' AND v_order.closed_at < (NOW() - INTERVAL '1 day') THEN
  --   RAISE EXCEPTION 'Cannot void orders closed more than 24 hours ago.';
  -- END IF;

  -- 3. Void all items
  -- This is critical for KDS: The kitchen needs to see 'is_voided' flip to TRUE
  UPDATE public.order_items
  SET 
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_items_count = ROW_COUNT;

  -- 4. Handle Payments (Paid vs Unpaid Logic)
  -- If the order was "Preparing" and "Paid", this calculates the refund due.
  -- If "Preparing" and "Unpaid", this returns 0.
  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
  FROM public.order_payments
  WHERE order_id = p_order_id 
    AND status = 'captured'
    AND is_voided = FALSE;

  -- Void the payment records so they don't count towards daily sales
  UPDATE public.order_payments
  SET 
    is_voided = TRUE,
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    voided_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_payments_count = ROW_COUNT;

  -- 5. Update Order Status
  -- Whether it was 'preparing' or 'pending', it is now 'void'.
  UPDATE public.orders
  SET 
    status = 'void',
    amount_paid = 0,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW(),
    check_status = 'Closed',
    payment_status = 'void'
  WHERE id = p_order_id;

  -- 6. Release the Table
  -- If the order was 'preparing', the table was likely 'seated'. We must free it.
  UPDATE public.table_sessions
  SET 
    is_active = FALSE,
    status = 'available',
    closed_at = NOW(),
    closed_by = user_staff_profile_id()
  WHERE order_id = p_order_id AND is_active = TRUE;

  -- 7. Record History
  INSERT INTO public.order_status_history (
    order_id, 
    from_status, 
    to_status, 
    changed_by_staff_id,
    notes
  ) VALUES (
    p_order_id,
    v_order.status,
    'void',
    user_staff_profile_id(),
    p_void_reason
  );

   v_new_sync_version := increment_order_sync_version(p_order_id);

  -- 8. Return Result
  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_order.status, -- Helps frontend know if it was 'preparing'
    'refund_amount', v_refund_amount,  -- Frontend can prompt "Refund $X to customer?"
    'void_reason', p_void_reason,
    'sync_version', v_new_sync_version
  ) INTO v_result;

  RETURN v_result;
END;$function$
;


