-- ============================================================================
-- process_online_order: store total columns TIP-EXCLUSIVE to match POS
-- ----------------------------------------------------------------------------
-- BUG (2026-07-16): online orders stored `total_amount` (and card_total /
-- cash_total / effective_total / amount_paid, plus order_payments.total_amount)
-- as p_total, which INCLUDES gratuity. POS orders store these TIP-EXCLUSIVE
-- (subtotal + tax + surcharge + delivery - discount; tip tracked separately in
-- tip_amount). Consumers that add tip back (receipt template `lane.total + tip`)
-- therefore double-counted the tip on online orders only.
--
--   Verified POS convention (staging): dine_in ORD-...S10-0007
--     subtotal 999 + tax 88.66 = total_amount 1087.66 = amount_paid = card_total
--     = effective_total; tip 217.53 held ONLY in tip_amount (tip-EXCLUSIVE).
--   Verified online bug: ORD-20260716-0003
--     subtotal 15 + tax 1.33 + tip 2.70 -> orders.total_amount 19.03 (tip-incl)
--     -> receipt email showed 21.73 (19.03 + tip 2.70 AGAIN).
--
-- FIX: define v_total_ex_tip := p_total - COALESCE(p_gratuity,0) and write the
-- TOTAL/AMOUNT_PAID/card_total/cash_total/effective_total columns with it, and
-- set order_payments.total_amount = order_payments.amount (both = v_total_ex_tip,
-- the actually-charged, tip-exclusive figure; gratuity stays in tip_amount).
-- tip_amount columns are UNCHANGED. p_total elsewhere (JSON return, metadata,
-- warnings) is left as-is.
--
-- IMPACT: all online orders (website/QR/OrderOut/delivery). Aligns online with
-- POS. Revenue rollups that summed online orders.total_amount will DROP by the
-- tip portion (previously over-counted) — this is the corrected number.
-- Consumer to double-check after deploy: the INLINE placed-email
-- (lib/messaging/order-notifications.ts loadOrderContext) shows orders.total_amount
-- AS the final total; with total_amount now tip-exclusive it must display
-- subtotal+tax+tip = total_amount + tip_amount for the grand total. (Receipt
-- template already adds tip correctly and will now foot.)
--
-- Byte-for-byte identical to 20260712121000_process_online_order_2step_preparing.sql
-- except: one added DECLARE line, and the total-column writes noted above.
-- Per project convention: apply to staging (dfwqakoyittmrwbqvxgw); user deploys
-- prod manually.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_online_order(p_location_id uuid, p_provider text, p_provider_order_id text, p_provider_restaurant_id text DEFAULT NULL::text, p_external_reference text DEFAULT NULL::text, p_delivery_company text DEFAULT NULL::text, p_provider_metadata jsonb DEFAULT '{}'::jsonb, p_order_type_raw text DEFAULT 'DELIVERY'::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_subtotal numeric DEFAULT 0, p_tax numeric DEFAULT 0, p_total numeric DEFAULT 0, p_gratuity numeric DEFAULT 0, p_surcharge numeric DEFAULT 0, p_delivery_charge numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_placed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ready_by timestamp with time zone DEFAULT NULL::timestamp with time zone, p_estimated_delivery timestamp with time zone DEFAULT NULL::timestamp with time zone, p_items jsonb DEFAULT '[]'::jsonb, p_delivery_address jsonb DEFAULT NULL::jsonb, p_order_notes text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT NULL::jsonb, p_auto_accept boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE
  v_merchant_id      UUID;
  v_order_id         UUID;
  v_order_number     TEXT;
  v_display_number   TEXT;
  v_payment_id       UUID;
  v_order_type       public.order_type;
  v_status           public.order_status;
  v_kitchen_status   TEXT;
  v_provider_enum    public.online_order_provider;
  v_order_source     TEXT;        -- canonical orders.order_source derived from p_provider
  v_workflow_mode    TEXT;        -- locations.kds_workflow_mode ('2-step' | '3-step')
  v_two_step_fire    BOOLEAN;     -- auto-accept at a 2-step location → born 'preparing'

  v_item             JSONB;
  v_item_index       INTEGER := 0;
  v_item_count       INTEGER := 0;
  v_order_item_id    UUID;

  v_menu_item        RECORD;
  v_menu_item_found  BOOLEAN;
  v_external_uuid    TEXT;        -- UUID extracted from external_id (e.g. "ITEM<uuid>")
  v_name_match_count INTEGER;     -- distinct menu_items matching the line name
  v_match_method     TEXT;        -- 'external_uuid' | 'name' | NULL (observability)

  v_item_tax_raw     NUMERIC;
  v_item_tax_floor   NUMERIC;
  v_tax_distributed  NUMERIC := 0;
  v_tax_remainders   NUMERIC[];
  v_tax_item_ids     UUID[];
  v_tax_floors       NUMERIC[];

  v_modifier         JSONB;
  v_default_tax_rate NUMERIC;
  v_warnings         JSONB := '[]'::JSONB;
  v_total_ex_tip     NUMERIC;      -- FIX: tip-EXCLUSIVE grand total (matches POS total_amount)
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
  -- STEP 1: RESOLVE MERCHANT + KDS WORKFLOW MODE
  -- ========================================================================
  SELECT merchant_id, COALESCE(kds_workflow_mode, '3-step')
  INTO v_merchant_id, v_workflow_mode
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  -- ========================================================================
  -- STEP 2: CAST PROVIDER ENUM + DERIVE order_source
  -- ========================================================================
  BEGIN
    v_provider_enum := p_provider::public.online_order_provider;
  EXCEPTION WHEN invalid_text_representation THEN
    v_provider_enum := 'other'::public.online_order_provider;
    p_provider_metadata := p_provider_metadata || jsonb_build_object('original_provider', p_provider);
  END;

  -- Canonical order-source taxonomy: {pos, orderout, online_store, phone}.
  -- OrderOut aggregator orders → 'orderout' (the marketplace name lives in
  -- delivery_platform). First-party storefront/app → 'online_store'. Never the
  -- legacy invalid value 'online'.
  v_order_source := CASE lower(p_provider)
    WHEN 'orderout' THEN 'orderout'
    WHEN 'website'  THEN 'online_store'
    WHEN 'app'      THEN 'online_store'
    ELSE 'online_store'
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

  -- 2-step KDS has no "sent" stage — auto-accepted orders are born cooking.
  -- Same CASE as accept_online_order (manual accepts) — keep in sync.
  v_two_step_fire := p_auto_accept AND v_workflow_mode = '2-step';
  IF p_auto_accept THEN
    IF v_two_step_fire THEN
      v_status := 'preparing'::public.order_status;
      v_kitchen_status := 'preparing';
    ELSE
      v_status := 'sent_to_kitchen'::public.order_status;
      v_kitchen_status := 'sent';
    END IF;
  ELSE
    v_status := 'pending'::public.order_status;
    v_kitchen_status := NULL;
  END IF;

  -- ========================================================================
  -- STEP 4: GET DEFAULT TAX RATE
  -- FIX: removed tax_category = 'default' filter — picks the first active rate
  --      for the location regardless of category name (handles 'standard',
  --      'default', 'food', or any custom name set in the dashboard).
  -- ========================================================================
  SELECT percentage INTO v_default_tax_rate
  FROM public.tax_rates
  WHERE location_id = p_location_id
    AND is_active = true
  ORDER BY
    CASE tax_category WHEN 'standard' THEN 0 WHEN 'default' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 1;

  -- Self-healing tax: if the caller passed p_tax = 0 but we found a rate,
  -- recalculate tax and total so the stored record is always correct.
  IF v_default_tax_rate IS NOT NULL AND p_tax = 0 AND p_subtotal > 0 THEN
    p_tax   := ROUND(p_subtotal * (v_default_tax_rate / 100), 2);
    p_total := p_subtotal + p_tax + COALESCE(p_gratuity, 0)
                           + COALESCE(p_surcharge, 0)
                           + COALESCE(p_delivery_charge, 0)
                           - COALESCE(p_discount, 0);
  END IF;

  -- Infer rate from p_tax if still unknown (e.g. third-party providers)
  IF v_default_tax_rate IS NULL AND p_subtotal > 0 AND p_tax > 0 THEN
    v_default_tax_rate := ROUND((p_tax / p_subtotal) * 100, 4);
  END IF;

  -- FIX: tip-exclusive total to match POS convention (tip stays in tip_amount).
  v_total_ex_tip := p_total - COALESCE(p_gratuity, 0);

  -- ========================================================================
  -- STEP 5: GENERATE ORDER NUMBER
  -- ========================================================================
  -- Generate order number (per-station when station_id provided)
  v_order_number := public.generate_order_number(p_location_id);

  -- Generate display number (handles both 3-segment and 4-segment formats)
  v_display_number := CASE
    WHEN SPLIT_PART(v_order_number, '-', 4) <> ''
    THEN '#' || SPLIT_PART(v_order_number, '-', 3) || '-' || SPLIT_PART(v_order_number, '-', 4)
    ELSE '#' || SPLIT_PART(v_order_number, '-', 3)
  END;

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
    sent_to_kitchen_at, started_preparing_at, metadata, created_at, updated_at,
    order_source, delivery_platform, platform_order_number
  ) VALUES (
    v_merchant_id, p_location_id, v_order_number, v_display_number,
    v_order_type, v_status, 'paid'::public.payment_status,
    p_customer_name, p_customer_phone, p_customer_email, p_delivery_address,
    p_subtotal, p_tax, v_total_ex_tip, COALESCE(p_gratuity, 0), COALESCE(p_surcharge, 0), COALESCE(p_discount, 0),
    0, v_total_ex_tip,
    p_subtotal, p_tax, v_total_ex_tip,
    p_subtotal, p_tax, v_total_ex_tip,
    p_subtotal, p_tax, v_total_ex_tip,
    p_provider || ':' || p_provider_order_id,
    COALESCE(p_estimated_delivery, p_ready_by),
    p_order_notes,
    CASE WHEN p_auto_accept THEN NOW() ELSE NULL END,
    CASE WHEN v_two_step_fire THEN NOW() ELSE NULL END,
    jsonb_build_object(
      'source', 'online_order', 'provider', p_provider,
      'delivery_company', p_delivery_company, 'provider_order_id', p_provider_order_id,
      'external_reference', p_external_reference, 'placed_at', p_placed_at,
      'ready_by', p_ready_by, 'auto_accepted', p_auto_accept
    ),
    NOW(), NOW(),
    v_order_source, p_delivery_company, p_provider_order_id
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
    v_match_method    := NULL;
    v_name_match_count := 0;

    -- (1) PRIMARY: extract an embedded UUID from external_id and match it.
    --     Handles bare UUIDs and wrapped forms like "ITEM<uuid>" that OrderOut
    --     echoes back; the previous bare ::uuid cast threw on the prefix and the
    --     line silently became an open item with no menu_item_id/category_id.
    v_external_uuid := substring(
      COALESCE(v_item->>'external_id', '')
      FROM '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    );

    IF v_external_uuid IS NOT NULL THEN
      SELECT mi.id, mi.name, mi.price, mi.is_tax_exempt,
             ci.category_id AS cat_id, c.name AS cat_name
      INTO v_menu_item
      FROM public.menu_items mi
      LEFT JOIN public.category_items ci ON ci.menu_item_id = mi.id
      LEFT JOIN public.categories c ON c.id = ci.category_id
      WHERE mi.id = v_external_uuid::UUID
        AND mi.merchant_id = v_merchant_id
      LIMIT 1;

      IF FOUND THEN
        v_menu_item_found := TRUE;
        v_match_method    := 'external_uuid';
      END IF;
    END IF;

    -- (2) FALLBACK: unique normalized name match (for non-UUID provider ids).
    --     Only auto-link when EXACTLY one menu item matches the name; ambiguous
    --     or absent matches stay open items (with a typed warning below).
    IF NOT v_menu_item_found
       AND v_item->>'name' IS NOT NULL
       AND btrim(v_item->>'name') <> '' THEN
      SELECT count(*) INTO v_name_match_count
      FROM public.menu_items mi
      WHERE mi.merchant_id = v_merchant_id
        AND lower(btrim(mi.name)) = lower(btrim(v_item->>'name'));

      IF v_name_match_count = 1 THEN
        SELECT mi.id, mi.name, mi.price, mi.is_tax_exempt,
               ci.category_id AS cat_id, c.name AS cat_name
        INTO v_menu_item
        FROM public.menu_items mi
        LEFT JOIN public.category_items ci ON ci.menu_item_id = mi.id
        LEFT JOIN public.categories c ON c.id = ci.category_id
        WHERE mi.merchant_id = v_merchant_id
          AND lower(btrim(mi.name)) = lower(btrim(v_item->>'name'))
        LIMIT 1;

        IF FOUND THEN
          v_menu_item_found := TRUE;
          v_match_method    := 'name';
        END IF;
      END IF;
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
          'type', CASE WHEN v_name_match_count > 1 THEN 'menu_item_ambiguous'
                       ELSE 'menu_item_not_found' END,
          'external_id', v_item->>'external_id',
          'item_name', v_item_name,
          'message', CASE WHEN v_name_match_count > 1
                          THEN 'Multiple menu items share this name — inserted as open item'
                          ELSE 'Menu item not found in POS — inserted as open item' END
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
        item_status, kitchen_status, sent_to_kitchen_at, fire_time,
        started_preparing_at, display_order,
        special_instructions, is_open_item, is_tax_exempt,
        open_item_name, open_item_price,
        base_card_price, base_cash_price, cash_price, cash_unit_price,
        cash_subtotal, cash_tax_amount, metadata, created_at, updated_at
      ) VALUES (
        v_order_id, v_item_menu_id, v_item_name, v_item_qty, v_item_unit_price, v_item_subtotal,
        v_item_tax_floor, v_default_tax_rate, v_item_cat_id, v_item_cat_name,
        CASE WHEN v_two_step_fire THEN 'preparing'
             WHEN p_auto_accept THEN 'sent'
             ELSE 'pending' END,
        v_kitchen_status,
        CASE WHEN p_auto_accept THEN NOW() ELSE NULL END,
        CASE WHEN v_two_step_fire THEN NOW() ELSE NULL END,
        CASE WHEN v_two_step_fire THEN NOW() ELSE NULL END,
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
          'menu_item_matched', v_menu_item_found,
          'match_method', v_match_method
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
  -- STEP 7.5: KDS ITEM STATUS SYNC (2-step auto-accept only)
  -- trg_route_items_to_kds created kds_item_status rows on the item INSERTs
  -- above (AFTER-ROW triggers complete per statement) as status='pending',
  -- started_at=NULL. Items born 'preparing' should carry started_at for
  -- prep-time metric parity with bulk_update_order_item_status.
  -- ========================================================================
  IF v_two_step_fire THEN
    UPDATE public.kds_item_status kis
       SET started_at = COALESCE(kis.started_at, NOW())
      FROM public.order_items oi
     WHERE oi.id = kis.order_item_id
       AND oi.order_id = v_order_id
       AND kis.status = 'pending';
  END IF;

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
    v_total_ex_tip, v_total_ex_tip + COALESCE(p_gratuity, 0),  -- FIX: amount tip-excl (POS convention); total_amount = charged (excl+tip)
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
  -- ========================================================================
  INSERT INTO public.audit_logs (
    actor_user_id, actor_name, organization_id,
    action, action_category, resource_type, resource_name,
    metadata, status
  ) VALUES (
    NULL, 'system',
    (SELECT clerk_org_id FROM public.merchants WHERE id = v_merchant_id),
    'online_order_created', 'order_management', 'order', v_order_number,
    jsonb_build_object(
      'order_id', v_order_id, 'order_type', v_order_type,
      'provider', p_provider, 'delivery_company', p_delivery_company,
      'provider_order_id', p_provider_order_id, 'auto_accepted', p_auto_accept,
      'item_count', v_item_count, 'total', p_total, 'tax', p_tax,
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
    'tax', p_tax,
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
END;$function$;
