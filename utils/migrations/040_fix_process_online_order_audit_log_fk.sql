-- ============================================================================
-- Migration 040: Fix process_online_order audit_logs FK violation
-- ============================================================================
-- The RPC was inserting actor_user_id = 'system' into audit_logs, but that
-- column has a FK to public.users(id) and no 'system' user exists.
-- Fix: set actor_user_id = NULL and actor_name = 'system' instead.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_online_order(
  p_location_id UUID,
  p_provider TEXT,
  p_provider_order_id TEXT,
  p_provider_restaurant_id TEXT DEFAULT NULL,
  p_external_reference TEXT DEFAULT NULL,
  p_delivery_company TEXT DEFAULT NULL,
  p_provider_metadata JSONB DEFAULT '{}'::JSONB,
  p_order_type_raw TEXT DEFAULT 'DELIVERY',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_subtotal NUMERIC DEFAULT 0,
  p_tax NUMERIC DEFAULT 0,
  p_total NUMERIC DEFAULT 0,
  p_gratuity NUMERIC DEFAULT 0,
  p_surcharge NUMERIC DEFAULT 0,
  p_delivery_charge NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0,
  p_placed_at TIMESTAMPTZ DEFAULT NULL,
  p_ready_by TIMESTAMPTZ DEFAULT NULL,
  p_estimated_delivery TIMESTAMPTZ DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_delivery_address JSONB DEFAULT NULL,
  p_order_notes TEXT DEFAULT NULL,
  p_raw_payload JSONB DEFAULT NULL,
  p_auto_accept BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id      UUID;
  v_order_id         UUID;
  v_order_number     TEXT;
  v_display_number   TEXT;
  v_payment_id       UUID;
  v_order_type       public.order_type;
  v_status           public.order_status;
  v_kitchen_status   TEXT;
  v_provider_enum    public.online_order_provider;

  v_item             JSONB;
  v_item_index       INTEGER := 0;
  v_item_count       INTEGER := 0;
  v_order_item_id    UUID;

  v_menu_item        RECORD;
  v_menu_item_found  BOOLEAN;

  v_item_tax_raw     NUMERIC;
  v_item_tax_floor   NUMERIC;
  v_tax_distributed  NUMERIC := 0;
  v_tax_remainders   NUMERIC[];
  v_tax_item_ids     UUID[];
  v_tax_floors       NUMERIC[];

  v_modifier         JSONB;
  v_default_tax_rate NUMERIC;
  v_warnings         JSONB := '[]'::JSONB;
BEGIN
  -- ========================================================================
  -- STEP 0: IDEMPOTENCY
  -- ========================================================================
  DECLARE
    v_existing_order_id UUID;
    v_existing_online_id UUID;
  BEGIN
    SELECT oo.order_id, oo.id
    INTO v_existing_order_id, v_existing_online_id
    FROM public.online_orders oo
    WHERE oo.provider = p_provider::public.online_order_provider
      AND oo.provider_order_id = p_provider_order_id;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order_id,
        'online_order_id', v_existing_online_id,
        'duplicate', true,
        'message', 'Order already processed'
      );
    END IF;

    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE external_id = p_provider || ':' || p_provider_order_id;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order_id,
        'duplicate', true,
        'message', 'Order already processed (external_id match)'
      );
    END IF;
  END;

  -- ========================================================================
  -- STEP 1: RESOLVE MERCHANT
  -- ========================================================================
  SELECT merchant_id INTO v_merchant_id
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  -- ========================================================================
  -- STEP 2: CAST PROVIDER ENUM
  -- ========================================================================
  BEGIN
    v_provider_enum := p_provider::public.online_order_provider;
  EXCEPTION WHEN invalid_text_representation THEN
    v_provider_enum := 'other'::public.online_order_provider;
    p_provider_metadata := p_provider_metadata || jsonb_build_object('original_provider', p_provider);
  END;

  -- ========================================================================
  -- STEP 3: MAP ORDER TYPE & STATUS
  -- ========================================================================
  v_order_type := CASE UPPER(p_order_type_raw)
    WHEN 'DELIVERY' THEN 'delivery'::public.order_type
    WHEN 'PICKUP'   THEN 'takeout'::public.order_type
    WHEN 'TAKEOUT'  THEN 'takeout'::public.order_type
    ELSE 'online'::public.order_type
  END;

  IF p_auto_accept THEN
    v_status := 'sent_to_kitchen'::public.order_status;
    v_kitchen_status := 'sent';
  ELSE
    v_status := 'pending'::public.order_status;
    v_kitchen_status := NULL;
  END IF;

  -- ========================================================================
  -- STEP 4: GET DEFAULT TAX RATE
  -- ========================================================================
  SELECT percentage INTO v_default_tax_rate
  FROM public.tax_rates
  WHERE location_id = p_location_id
    AND is_active = true
    AND tax_category = 'default'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_tax_rate IS NULL AND p_subtotal > 0 THEN
    v_default_tax_rate := ROUND((p_tax / p_subtotal) * 100, 4);
  END IF;

  -- ========================================================================
  -- STEP 5: GENERATE ORDER NUMBER
  -- ========================================================================
  v_order_number := public.generate_order_number_internal(p_location_id, v_merchant_id);
  v_display_number := '#' || SPLIT_PART(v_order_number, '-', 3);

  -- ========================================================================
  -- STEP 6: INSERT ORDER
  -- ========================================================================
  INSERT INTO public.orders (
    merchant_id, location_id, order_number, display_number,
    order_type, status, payment_status,
    customer_name, customer_phone, customer_email, delivery_address,
    subtotal, tax_amount, total_amount, tip_amount, service_charge, discount_amount,
    amount_due, amount_paid,
    card_subtotal, card_tax_amount, card_total,
    cash_subtotal, cash_tax_amount, cash_total,
    effective_subtotal, effective_tax_amount, effective_total,
    external_id, estimated_delivery_time, special_instructions,
    sent_to_kitchen_at, metadata, created_at, updated_at
  ) VALUES (
    v_merchant_id, p_location_id, v_order_number, v_display_number,
    v_order_type, v_status, 'paid'::public.payment_status,
    p_customer_name, p_customer_phone, p_customer_email, p_delivery_address,
    p_subtotal, p_tax, p_total, COALESCE(p_gratuity, 0), COALESCE(p_surcharge, 0), COALESCE(p_discount, 0),
    0, p_total,
    p_subtotal, p_tax, p_total,
    p_subtotal, p_tax, p_total,
    p_subtotal, p_tax, p_total,
    p_provider || ':' || p_provider_order_id,
    COALESCE(p_estimated_delivery, p_ready_by),
    p_order_notes,
    CASE WHEN p_auto_accept THEN NOW() ELSE NULL END,
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company, 'provider_order_id', p_provider_order_id,
      'external_reference', p_external_reference, 'placed_at', p_placed_at,
      'ready_by', p_ready_by, 'auto_accepted', p_auto_accept
    ),
    NOW(), NOW()
  )
  RETURNING id INTO v_order_id;

  -- ========================================================================
  -- STEP 7: INSERT ORDER ITEMS
  -- ========================================================================
  v_tax_remainders := ARRAY[]::NUMERIC[];
  v_tax_item_ids   := ARRAY[]::UUID[];
  v_tax_floors     := ARRAY[]::NUMERIC[];

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_index := v_item_index + 1;
    v_menu_item_found := FALSE;

    IF v_item->>'external_id' IS NOT NULL AND v_item->>'external_id' != '' THEN
      BEGIN
        SELECT mi.id, mi.name, mi.price, mi.is_tax_exempt,
               ci.category_id AS cat_id, c.name AS cat_name
        INTO v_menu_item
        FROM public.menu_items mi
        LEFT JOIN public.category_items ci ON ci.menu_item_id = mi.id
        LEFT JOIN public.categories c ON c.id = ci.category_id
        WHERE mi.id = (v_item->>'external_id')::UUID
          AND mi.merchant_id = v_merchant_id
        LIMIT 1;

        IF FOUND THEN v_menu_item_found := TRUE; END IF;
      EXCEPTION WHEN invalid_text_representation THEN NULL;
      END;
    END IF;

    DECLARE
      v_item_unit_price    NUMERIC;
      v_item_qty           INTEGER;
      v_item_subtotal      NUMERIC;
      v_item_name          TEXT;
      v_item_menu_id       UUID;
      v_item_cat_id        UUID;
      v_item_cat_name      TEXT;
      v_item_is_open       BOOLEAN;
      v_item_is_tax_exempt BOOLEAN;
    BEGIN
      v_item_qty        := COALESCE((v_item->>'quantity')::INTEGER, 1);
      v_item_unit_price := COALESCE((v_item->>'price')::NUMERIC, 0);
      v_item_subtotal   := COALESCE((v_item->>'total')::NUMERIC, 0);
      v_item_name       := v_item->>'name';

      IF v_menu_item_found THEN
        v_item_menu_id       := v_menu_item.id;
        v_item_cat_id        := v_menu_item.cat_id;
        v_item_cat_name      := v_menu_item.cat_name;
        v_item_is_open       := FALSE;
        v_item_is_tax_exempt := COALESCE(v_menu_item.is_tax_exempt, FALSE);
      ELSE
        v_item_menu_id       := NULL;
        v_item_cat_id        := NULL;
        v_item_cat_name      := NULL;
        v_item_is_open       := TRUE;
        v_item_is_tax_exempt := FALSE;
        v_warnings := v_warnings || jsonb_build_object(
          'type', 'menu_item_not_found',
          'external_id', v_item->>'external_id',
          'item_name', v_item_name,
          'message', 'Menu item not found in POS — inserted as open item'
        );
      END IF;

      IF p_subtotal > 0 AND NOT v_item_is_tax_exempt THEN
        v_item_tax_raw   := p_tax * (v_item_subtotal / p_subtotal);
        v_item_tax_floor := TRUNC(v_item_tax_raw, 2);
      ELSE
        v_item_tax_raw   := 0;
        v_item_tax_floor := 0;
      END IF;

      INSERT INTO public.order_items (
        order_id, menu_item_id, item_name, quantity, unit_price, subtotal,
        tax_amount, tax_rate, category_id, category_name,
        item_status, kitchen_status, sent_to_kitchen_at, display_order,
        special_instructions, is_open_item, is_tax_exempt,
        open_item_name, open_item_price,
        base_card_price, base_cash_price, cash_price, cash_unit_price,
        cash_subtotal, cash_tax_amount, metadata, created_at, updated_at
      ) VALUES (
        v_order_id, v_item_menu_id, v_item_name, v_item_qty, v_item_unit_price, v_item_subtotal,
        v_item_tax_floor, v_default_tax_rate, v_item_cat_id, v_item_cat_name,
        CASE WHEN p_auto_accept THEN 'sent' ELSE 'pending' END,
        v_kitchen_status,
        CASE WHEN p_auto_accept THEN NOW() ELSE NULL END,
        v_item_index,
        v_item->>'note', v_item_is_open, v_item_is_tax_exempt,
        CASE WHEN v_item_is_open THEN v_item_name ELSE NULL END,
        CASE WHEN v_item_is_open THEN v_item_unit_price ELSE NULL END,
        v_item_unit_price, v_item_unit_price, v_item_unit_price, v_item_unit_price,
        v_item_subtotal, v_item_tax_floor,
        jsonb_build_object(
          'source', 'online_order', 'provider', p_provider,
          'provider_item_id', v_item->>'id',
          'provider_external_id', v_item->>'external_id',
          'menu_item_matched', v_menu_item_found
        ),
        NOW(), NOW()
      )
      RETURNING id INTO v_order_item_id;

      v_tax_distributed := v_tax_distributed + v_item_tax_floor;
      v_tax_remainders  := array_append(v_tax_remainders, v_item_tax_raw - v_item_tax_floor);
      v_tax_item_ids    := array_append(v_tax_item_ids, v_order_item_id);
      v_tax_floors      := array_append(v_tax_floors, v_item_tax_floor);
      v_item_count      := v_item_count + 1;

      IF v_item->'modifiers' IS NOT NULL AND jsonb_array_length(v_item->'modifiers') > 0 THEN
        FOR v_modifier IN SELECT * FROM jsonb_array_elements(v_item->'modifiers')
        LOOP
          DECLARE
            v_mod_price NUMERIC;
            v_mod_qty   INTEGER;
          BEGIN
            v_mod_price := COALESCE((v_modifier->>'price')::NUMERIC, 0);
            v_mod_qty   := COALESCE((v_modifier->>'quantity')::INTEGER, 1);
            INSERT INTO public.order_item_modifiers (
              order_item_id, modifier_group_name, modifier_name,
              price_modifier, quantity, total_price, metadata
            ) VALUES (
              v_order_item_id,
              COALESCE(v_modifier->>'group_name', 'Modifier'),
              COALESCE(v_modifier->>'name', 'Unknown Modifier'),
              v_mod_price, v_mod_qty, v_mod_price * v_mod_qty,
              jsonb_build_object(
                'source', 'online_order', 'provider', p_provider,
                'provider_modifier_id', v_modifier->>'id'
              )
            );
          END;
        END LOOP;
      END IF;
    END;
  END LOOP;

  -- ========================================================================
  -- STEP 8: TAX REMAINDER DISTRIBUTION (Largest Remainder Method)
  -- ========================================================================
  DECLARE
    v_tax_deficit NUMERIC;
    v_penny_count INTEGER;
    v_num_items   INTEGER;
    i             INTEGER;
    j             INTEGER;
    v_max_rem     NUMERIC;
    v_max_idx     INTEGER;
    v_tmp_rem     NUMERIC;
    v_tmp_id      UUID;
    v_tmp_floor   NUMERIC;
  BEGIN
    v_tax_deficit := ROUND(p_tax - v_tax_distributed, 2);
    v_penny_count := ROUND(v_tax_deficit * 100)::INTEGER;
    v_num_items   := COALESCE(array_length(v_tax_remainders, 1), 0);

    IF v_penny_count > 0 AND v_num_items > 0 THEN
      FOR i IN 1..v_num_items LOOP
        v_max_rem := v_tax_remainders[i];
        v_max_idx := i;
        FOR j IN (i+1)..v_num_items LOOP
          IF v_tax_remainders[j] > v_max_rem THEN
            v_max_rem := v_tax_remainders[j];
            v_max_idx := j;
          END IF;
        END LOOP;
        IF v_max_idx != i THEN
          v_tmp_rem := v_tax_remainders[i];
          v_tax_remainders[i] := v_tax_remainders[v_max_idx];
          v_tax_remainders[v_max_idx] := v_tmp_rem;
          v_tmp_id := v_tax_item_ids[i];
          v_tax_item_ids[i] := v_tax_item_ids[v_max_idx];
          v_tax_item_ids[v_max_idx] := v_tmp_id;
          v_tmp_floor := v_tax_floors[i];
          v_tax_floors[i] := v_tax_floors[v_max_idx];
          v_tax_floors[v_max_idx] := v_tmp_floor;
        END IF;
      END LOOP;

      FOR i IN 1..LEAST(v_penny_count, v_num_items) LOOP
        UPDATE public.order_items
        SET tax_amount      = v_tax_floors[i] + 0.01,
            cash_tax_amount = v_tax_floors[i] + 0.01
        WHERE id = v_tax_item_ids[i];
      END LOOP;
    END IF;
  END;

  -- ========================================================================
  -- STEP 9: INSERT ORDER PAYMENT
  -- ========================================================================
  INSERT INTO public.order_payments (
    order_id, payment_method, status, amount, total_amount,
    subtotal_portion, tax_portion, tip_amount, terminal_type,
    is_cash_priced, cash_discount_applied, captured_at,
    location_id, merchant_id, metadata
  ) VALUES (
    v_order_id, 'external'::public.payment_method, 'paid'::public.payment_status,
    p_total, p_total + COALESCE(p_gratuity, 0),
    p_subtotal, p_tax, COALESCE(p_gratuity, 0),
    'none'::public.terminal_type, FALSE, FALSE, NOW(),
    p_location_id, v_merchant_id,
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company,
      'provider_order_id', p_provider_order_id,
      'external_reference', p_external_reference,
      'payment_status_from_source', 'PAID'
    )
  )
  RETURNING id INTO v_payment_id;

  -- ========================================================================
  -- STEP 10: INSERT ORDER PAYMENT ITEMS
  -- ========================================================================
  INSERT INTO public.order_payment_items (
    order_payment_id, order_item_id, quantity_paid,
    unit_price_paid, subtotal_paid, tax_paid
  )
  SELECT v_payment_id, oi.id, oi.quantity, oi.unit_price, oi.subtotal, oi.tax_amount
  FROM public.order_items oi
  WHERE oi.order_id = v_order_id;

  -- ========================================================================
  -- STEP 11: ORDER STATUS HISTORY
  -- ========================================================================
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, notes, metadata
  ) VALUES (
    v_order_id, NULL, v_status,
    'Online order — ' || COALESCE(p_delivery_company, p_provider),
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company,
      'auto_accepted', p_auto_accept,
      'provider_order_id', p_provider_order_id
    )
  );

  -- ========================================================================
  -- STEP 12: INSERT ONLINE_ORDERS LINK RECORD
  -- ========================================================================
  INSERT INTO public.online_orders (
    order_id, location_id, merchant_id, provider, provider_order_id,
    provider_restaurant_id, external_reference, delivery_company,
    placed_at, ready_by, estimated_delivery,
    provider_metadata, raw_payload, provider_status
  ) VALUES (
    v_order_id, p_location_id, v_merchant_id, v_provider_enum, p_provider_order_id,
    p_provider_restaurant_id, p_external_reference, p_delivery_company,
    p_placed_at, p_ready_by, p_estimated_delivery,
    p_provider_metadata, p_raw_payload,
    CASE WHEN p_auto_accept THEN 'confirmed' ELSE 'received' END
  );

  -- ========================================================================
  -- STEP 13: AUDIT LOG
  -- FIX: Use NULL for actor_user_id (no real user for webhook/system actions)
  --      and set actor_name = 'system' for UI labeling.
  -- ========================================================================
  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_name,
    organization_id,
    action,
    action_category,
    resource_type,
    resource_name,
    metadata,
    status
  ) VALUES (
    NULL,
    'system',
    (SELECT clerk_org_id FROM public.merchants WHERE id = v_merchant_id),
    'online_order_created',
    'order_management',
    'order',
    v_order_number,
    jsonb_build_object(
      'order_id', v_order_id,
      'order_type', v_order_type,
      'provider', p_provider,
      'delivery_company', p_delivery_company,
      'provider_order_id', p_provider_order_id,
      'auto_accepted', p_auto_accept,
      'item_count', v_item_count,
      'total', p_total,
      'warnings', v_warnings
    ),
    'success'
  );

  -- ========================================================================
  -- RETURN
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'display_number', v_display_number,
    'status', v_status,
    'payment_status', 'paid',
    'item_count', v_item_count,
    'total', p_total,
    'auto_accepted', p_auto_accept,
    'provider', p_provider,
    'warnings', v_warnings
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_detail', SQLSTATE,
    'provider', p_provider,
    'provider_order_id', p_provider_order_id
  );
END;
$$;

COMMENT ON FUNCTION public.process_online_order IS 'Universal online order processor. Called by all provider webhooks via service role. v2: fixed audit_logs FK violation by using NULL actor_user_id for system actions.';
