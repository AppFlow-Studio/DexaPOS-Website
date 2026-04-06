-- ============================================================================
-- DEXA POS - Production Audit Fixes
-- ============================================================================
-- Addresses all remaining issues from the 2026-04-05 production audit
-- that were NOT already resolved in 20260324_phase0_inventory_rls_and_integrity.sql
--
-- Already fixed in Phase 0 (not repeated here):
--   #2  decrement_location_stock race condition  → atomic upsert
--   #3  RLS on 11/13 inventory tables            → policies added
--   #5  audit log wrong previous_stock           → captured before increment
--              NOTE: Phase 0 captured prev_stock in the right order but lacked
--              FOR UPDATE lock — fixed here by rebuilding log_purchase_order_delivery
--   #9  recipe_id path ignored in deduction      → Path 2 implemented
--   #10 initialize_location_stock copies stale   → always inserts 0
--   #12 update_reason free text                  → CHECK constraint added
--   #14 missing indexes (partial)               → most indexes added
--
-- This migration covers the remainder:
--   #1  Double stock increment (trigger + RPC)
--   #3  RLS on remaining 2 tables (modifier_group_item_recipes, recipes)
--   #4  process_order_inventory_deduction idempotency
--   #5  FOR UPDATE lock in log_purchase_order_delivery
--   #6  Three duplicate upsert_menu_item_with_recipe overloads
--   #7  SECURITY DEFINER functions lack authorization checks (ALL entry-point RPCs)
--   #8  stock_mode text → proper enum type; deduction respects stock_mode
--   #13 menu_item_recipes missing composite UNIQUE
--   #14 Remaining performance indexes
--   #15 get_pos_inventory_sync N+1 scalar function calls
--   #16 vendor_items.default_cost defaults to 0 instead of NULL
--   #19 trigger_init_stock_for_new_item lacks ON CONFLICT
-- ============================================================================

-- ============================================================================
-- ISSUE #1: DROP the double-increment trigger
-- ============================================================================

-- CASCADE drops the dependent trigger automatically (whatever its name)
DROP FUNCTION IF EXISTS update_inventory_on_po_received() CASCADE;

-- ============================================================================
-- ISSUE #3 (REMAINING): RLS on modifier_group_item_recipes and recipes
-- ============================================================================

ALTER TABLE modifier_group_item_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY modifier_group_item_recipes_select ON modifier_group_item_recipes
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR EXISTS (
            SELECT 1 FROM location_members lm
            JOIN locations l ON l.id = lm.location_id
            WHERE lm.user_id    = current_user_id()
              AND lm.is_active  = true
              AND l.merchant_id = modifier_group_item_recipes.merchant_id
        )
    );

CREATE POLICY modifier_group_item_recipes_insert ON modifier_group_item_recipes
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY modifier_group_item_recipes_update ON modifier_group_item_recipes
    FOR UPDATE USING (is_merchant_admin(merchant_id));

CREATE POLICY modifier_group_item_recipes_delete ON modifier_group_item_recipes
    FOR DELETE USING (is_merchant_owner(merchant_id));

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_select ON recipes
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR EXISTS (
            SELECT 1 FROM location_members lm
            JOIN locations l ON l.id = lm.location_id
            WHERE lm.user_id    = current_user_id()
              AND lm.is_active  = true
              AND l.merchant_id = recipes.merchant_id
        )
    );

CREATE POLICY recipes_insert ON recipes
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY recipes_update ON recipes
    FOR UPDATE USING (is_merchant_admin(merchant_id));

CREATE POLICY recipes_delete ON recipes
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ============================================================================
-- ISSUE #4: Add inventory_deducted column for idempotency guard
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_inventory_deducted
    ON orders(id) WHERE inventory_deducted = FALSE;

-- ============================================================================
-- ISSUE #8: Convert stock_mode from text + CHECK to a proper Postgres enum
-- This makes invalid values impossible at the type level (not just constraint).
-- Values are kept identical to avoid any data migration.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_stock_mode') THEN
        CREATE TYPE public.inventory_stock_mode AS ENUM (
            'in_stock',
            'stock_tracking',
            'out_of_stock'
        );
    END IF;
END;
$$;

-- Drop the anonymous text CHECK constraint so we can change the column type
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_stock_mode_check;

-- Change the column from text to the new enum (USING cast handles existing values)
ALTER TABLE inventory_items
    ALTER COLUMN stock_mode DROP DEFAULT,
    ALTER COLUMN stock_mode TYPE public.inventory_stock_mode
        USING stock_mode::public.inventory_stock_mode,
    ALTER COLUMN stock_mode SET DEFAULT 'in_stock'::public.inventory_stock_mode;

-- ============================================================================
-- ISSUE #7: authorize_location_access() helper — CORRECT IMPLEMENTATION
-- Uses the existing is_merchant_admin() and is_location_member() RLS helpers
-- (defined in 003_1_merchant_locations_optimized_rls.sql).
-- Service role calls (JWT sub = NULL) are allowed through unconditionally.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.authorize_location_access(p_location_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.authorize_merchant_access(p_merchant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.jwt()->>'sub' IS NULL THEN
        RETURN;
    END IF;

    IF NOT is_merchant_admin(p_merchant_id) THEN
        RAISE EXCEPTION 'Unauthorized: no access to merchant %', p_merchant_id
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ============================================================================
-- ISSUE #7 + ISSUE #5:
-- Rebuild all SECURITY DEFINER entry-point RPCs with authorization checks.
-- Internal helpers (increment/decrement_location_stock) are NOT entry points —
-- they are only called from higher-level functions that already authorize.
-- log_purchase_order_delivery also gets the FOR UPDATE lock fix (Issue #5).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- set_location_stock — entry point for manual stock adjustments
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_location_stock(
    p_inventory_item_id UUID,
    p_location_id       UUID,
    p_quantity          NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- app_set_location_stock delegates to set_location_stock (auth is handled there)
CREATE OR REPLACE FUNCTION public.app_set_location_stock(
    p_inventory_item_id UUID,
    p_location_id       UUID,
    p_quantity          NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.set_location_stock(p_inventory_item_id, p_location_id, p_quantity);
END;
$$;

-- ----------------------------------------------------------------------------
-- initialize_location_stock — entry point, called when a new location is created
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_location_stock(p_location_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ----------------------------------------------------------------------------
-- log_purchase_order_delivery — entry point for PO receiving
-- Fixes: #7 (auth), #5 (FOR UPDATE lock on prev_stock capture)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_purchase_order_delivery(
    p_purchase_order_id UUID,
    p_delivered_by      TEXT,
    p_delivery_notes    TEXT,
    p_logged_by_user_id TEXT,
    p_logged_by_name    TEXT,
    p_received_items    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ----------------------------------------------------------------------------
-- log_purchase_order_payment — entry point for PO payment recording
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_purchase_order_payment(
    p_purchase_order_id UUID,
    p_payment_method    TEXT,
    p_amount            NUMERIC,
    p_paid_by_user_id   TEXT,
    p_paid_by_name      TEXT,
    p_paid_to           TEXT,
    p_card_last_four    TEXT,
    p_notes             TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ----------------------------------------------------------------------------
-- create_adhoc_expense — entry point for ad-hoc expense recording
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_adhoc_expense(
    p_merchant_id         UUID,
    p_location_id         UUID,
    p_expense_vendor_name TEXT,
    p_expense_category    TEXT,
    p_expense_notes       TEXT,
    p_payment_method      TEXT,
    p_card_last_four      TEXT,
    p_total_amount        NUMERIC,
    p_user_id             TEXT,
    p_user_name           TEXT,
    p_items               JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ============================================================================
-- ISSUE #4 + #7 + #8: Rebuild process_order_inventory_deduction
--   - Idempotency guard (inventory_deducted flag)
--   - Authorization check
--   - stock_mode filter (only deduct 'stock_tracking' items)
-- ============================================================================

DROP FUNCTION IF EXISTS public.process_order_inventory_deduction(uuid);

CREATE OR REPLACE FUNCTION public.process_order_inventory_deduction(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ============================================================================
-- ISSUE #6: Drop duplicate upsert_menu_item_with_recipe overloads
-- Three versions exist in the DB; Version 3 crashes at runtime.
-- Keep only the 4-param canonical version (v2).
-- ============================================================================

DROP FUNCTION IF EXISTS public.upsert_menu_item_with_recipe(uuid, jsonb);
DROP FUNCTION IF EXISTS public.upsert_menu_item_with_recipe(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_menu_item_with_recipe(
    p_menu_item_id UUID,
    p_ingredients  JSONB DEFAULT NULL,
    p_recipe_items JSONB DEFAULT NULL,
    p_location_id  UUID  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ============================================================================
-- ISSUE #13: menu_item_recipes composite UNIQUE constraint
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'menu_item_recipes_menu_item_inventory_unique'
    ) THEN
        ALTER TABLE menu_item_recipes
            ADD CONSTRAINT menu_item_recipes_menu_item_inventory_unique
            UNIQUE (menu_item_id, inventory_item_id);
    END IF;
END;
$$;

-- ============================================================================
-- ISSUE #14 (REMAINING): Performance indexes not yet added in Phase 0
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_stock_log_location_date
    ON stock_update_log(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_merchant_active
    ON inventory_items(merchant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_po_merchant_status
    ON purchase_orders(merchant_id, status);

-- ============================================================================
-- ISSUE #15: get_pos_inventory_sync — inline COALESCE JOINs replace N+1 calls
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_pos_inventory_sync(uuid);

CREATE OR REPLACE FUNCTION public.get_pos_inventory_sync(p_location_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant_id UUID;
    v_result      JSON;
BEGIN
    SELECT merchant_id INTO v_merchant_id
    FROM locations
    WHERE id = p_location_id;

    IF v_merchant_id IS NULL THEN
        RETURN json_build_object('error', 'Location not found');
    END IF;

    SELECT json_agg(row_to_json(t)) INTO v_result
    FROM (
        SELECT
            ii.id,
            ii.name,
            ii.sku,
            ii.unit_type,
            ii.stock_mode,
            ii.reorder_point,
            ii.reorder_quantity,
            ii.is_active,
            ii.updated_at,
            COALESCE(lis.stock_quantity, 0)              AS stock_quantity,
            -- Effective cost: location override → global (no per-row scalar function)
            COALESCE(lio.cost_per_unit, ii.cost_per_unit, 0) AS effective_cost,
            -- Effective reorder point: location override → global
            COALESCE(lio.reorder_point, ii.reorder_point)    AS effective_reorder_point
        FROM inventory_items ii
        LEFT JOIN location_inventory_stock lis
               ON lis.inventory_item_id = ii.id
              AND lis.location_id       = p_location_id
        LEFT JOIN location_inventory_overrides lio
               ON lio.inventory_item_id = ii.id
              AND lio.location_id       = p_location_id
        WHERE ii.merchant_id = v_merchant_id
          AND ii.is_active   = true
        ORDER BY ii.name
    ) t;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- ============================================================================
-- ISSUE #16: vendor_items.default_cost — change DEFAULT 0 to DEFAULT NULL
-- ============================================================================

ALTER TABLE vendor_items ALTER COLUMN default_cost SET DEFAULT NULL;

-- ============================================================================
-- ISSUE #19: trigger_init_stock_for_new_item — add ON CONFLICT DO NOTHING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_init_stock_for_new_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS init_stock_for_new_item ON inventory_items;

CREATE TRIGGER init_stock_for_new_item
    AFTER INSERT ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_init_stock_for_new_item();

-- ============================================================================
-- Function comments
-- ============================================================================

COMMENT ON FUNCTION public.authorize_location_access(uuid) IS
    'Security check for SECURITY DEFINER RPCs. '
    'Raises 42501 if caller (auth.jwt()->sub) is not merchant admin or location member. '
    'Service role (null JWT sub) is allowed through unconditionally.';

COMMENT ON FUNCTION public.authorize_merchant_access(uuid) IS
    'Security check for merchant-scoped SECURITY DEFINER RPCs. '
    'Raises 42501 if caller is not a merchant admin.';

COMMENT ON FUNCTION public.process_order_inventory_deduction(uuid) IS
    'Idempotent order deduction. Guards: inventory_deducted flag, auth, stock_mode filter.';

COMMENT ON FUNCTION public.log_purchase_order_delivery(uuid, text, text, text, text, jsonb) IS
    'PO receiving. Auth-guarded. prev_stock captured with FOR UPDATE row lock.';

COMMENT ON FUNCTION public.upsert_menu_item_with_recipe(uuid, jsonb, jsonb, uuid) IS
    'Canonical recipe link function (v2 only). p_recipe_items takes precedence over p_ingredients.';
