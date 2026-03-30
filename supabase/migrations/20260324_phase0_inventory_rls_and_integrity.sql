-- ============================================================================
-- DEXA POS - Phase 0: Inventory Security & Core Integrity
-- ============================================================================
-- CRITICAL: Zero RLS policies existed on all inventory tables before this
-- migration. This migration makes the system multi-tenant safe and defines
-- all inventory RPCs that were referenced in code but had no SQL definitions.
--
-- Execution order:
-- 1. Performance indexes
-- 2. UNIQUE constraint on location_inventory_stock
-- 3. Inventory RPC definitions
-- 4. RLS enable + policies on all 11 inventory tables
-- 5. recipe_items.inventory_item_id FK column
-- 6. stock_update_log.update_reason CHECK constraint
-- ============================================================================

-- ============================================================================
-- PART 1: Performance Indexes (required before RLS for acceptable query speed)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_items_merchant
    ON inventory_items(merchant_id);

CREATE INDEX IF NOT EXISTS idx_vendors_merchant
    ON vendors(merchant_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_merchant
    ON purchase_orders(merchant_id);

CREATE INDEX IF NOT EXISTS idx_stock_update_log_merchant
    ON stock_update_log(merchant_id);

CREATE INDEX IF NOT EXISTS idx_vendor_items_vendor
    ON vendor_items(vendor_id);

CREATE INDEX IF NOT EXISTS idx_location_vendors_location
    ON location_vendors(location_id);

CREATE INDEX IF NOT EXISTS idx_location_vendor_pricing_location
    ON location_vendor_pricing(location_id);

CREATE INDEX IF NOT EXISTS idx_location_inventory_stock_location
    ON location_inventory_stock(location_id);

CREATE INDEX IF NOT EXISTS idx_location_inventory_overrides_location
    ON location_inventory_overrides(location_id);

CREATE INDEX IF NOT EXISTS idx_po_items_po
    ON purchase_order_items(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_po_payments_po
    ON purchase_order_payments(purchase_order_id);

-- ============================================================================
-- PART 2: UNIQUE Constraint for location_inventory_stock
-- Required for ON CONFLICT in set_location_stock / increment / decrement RPCs.
-- If duplicates exist in existing data, the constraint will fail — run the
-- dedup check first:
--   SELECT location_id, inventory_item_id, COUNT(*) FROM location_inventory_stock
--   GROUP BY 1,2 HAVING COUNT(*) > 1;
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'location_inventory_stock_location_item_unique'
    ) THEN
        ALTER TABLE location_inventory_stock
            ADD CONSTRAINT location_inventory_stock_location_item_unique
            UNIQUE (location_id, inventory_item_id);
    END IF;
END;
$$;

-- ============================================================================
-- PART 3: Inventory RPC Definitions
-- These are referenced in server actions and database.types.ts but had no SQL.
-- All use SECURITY DEFINER so they can write across tables when called from
-- authenticated server actions (which have already verified authorization).
-- ============================================================================

-- Drop existing functions first to allow parameter name changes
DROP FUNCTION IF EXISTS public.set_location_stock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.increment_location_stock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.decrement_location_stock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.app_set_location_stock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.initialize_location_stock(uuid);
DROP FUNCTION IF EXISTS public.process_order_inventory_deduction(uuid);
DROP FUNCTION IF EXISTS public.log_purchase_order_delivery(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.log_purchase_order_payment(uuid, text, numeric, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_adhoc_expense(uuid, uuid, text, text, text, text, text, numeric, text, text, jsonb);

-- ----------------------------------------------------------------------------
-- 3a. set_location_stock — UPSERT stock to a precise quantity
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

-- ----------------------------------------------------------------------------
-- 3b. increment_location_stock — add quantity to existing stock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_location_stock(
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
    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity, updated_at)
    VALUES (p_location_id, p_inventory_item_id, GREATEST(0, p_quantity), now())
    ON CONFLICT (location_id, inventory_item_id)
    DO UPDATE SET
        stock_quantity = location_inventory_stock.stock_quantity + p_quantity,
        updated_at     = now();

    -- Sync legacy aggregate
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

-- ----------------------------------------------------------------------------
-- 3c. decrement_location_stock — subtract quantity, floor at 0
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrement_location_stock(
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
    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity, updated_at)
    VALUES (p_location_id, p_inventory_item_id, 0, now())
    ON CONFLICT (location_id, inventory_item_id)
    DO UPDATE SET
        stock_quantity = GREATEST(0, location_inventory_stock.stock_quantity - p_quantity),
        updated_at     = now();

    -- Sync legacy aggregate
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

-- ----------------------------------------------------------------------------
-- 3d. app_set_location_stock — alias for set_location_stock (used in some actions)
-- ----------------------------------------------------------------------------
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
-- 3e. initialize_location_stock — seed rows for all global items at a new location
-- Returns: number of rows inserted
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
    INSERT INTO location_inventory_stock (location_id, inventory_item_id, stock_quantity)
    SELECT p_location_id, ii.id, 0
    FROM inventory_items ii
    JOIN locations l ON l.merchant_id = ii.merchant_id
    WHERE l.id      = p_location_id
      AND ii.location_id IS NULL   -- global items only
      AND ii.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM location_inventory_stock lis
          WHERE lis.location_id      = p_location_id
            AND lis.inventory_item_id = ii.id
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3f. process_order_inventory_deduction
-- Deducts inventory stock when an order is completed.
-- Handles three deduction paths:
--   1. Direct: menu_item_recipes.inventory_item_id
--   2. Recipe: menu_item_recipes.recipe_id → recipe_items.inventory_item_id
--   3. Modifiers: order_item_modifiers.modifier_item_id → modifier_group_item_recipes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_order_inventory_deduction(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_location_id UUID;
    v_order_item  RECORD;
    v_recipe_item RECORD;
    v_modifier    RECORD;
BEGIN
    SELECT location_id INTO v_location_id FROM orders WHERE id = p_order_id;
    IF v_location_id IS NULL THEN
        RETURN;
    END IF;

    -- Path 1: Direct menu_item_recipes → inventory_item_id
    FOR v_order_item IN
        SELECT
            oi.quantity,
            mir.inventory_item_id,
            mir.quantity_used,
            mir.quantity_multiplier
        FROM order_items oi
        JOIN menu_item_recipes mir ON mir.menu_item_id = oi.menu_item_id
        WHERE oi.order_id           = p_order_id
          AND oi.is_voided          = false
          AND mir.inventory_item_id IS NOT NULL
    LOOP
        PERFORM public.decrement_location_stock(
            v_order_item.inventory_item_id,
            v_location_id,
            v_order_item.quantity_used * v_order_item.quantity_multiplier * v_order_item.quantity
        );
    END LOOP;

    -- Path 2: Recipe-based — menu_item_recipes.recipe_id → recipe_items.inventory_item_id
    FOR v_order_item IN
        SELECT
            oi.quantity,
            mir.recipe_id,
            mir.quantity_multiplier
        FROM order_items oi
        JOIN menu_item_recipes mir ON mir.menu_item_id = oi.menu_item_id
        WHERE oi.order_id          = p_order_id
          AND oi.is_voided         = false
          AND mir.recipe_id        IS NOT NULL
          AND mir.inventory_item_id IS NULL
    LOOP
        FOR v_recipe_item IN
            SELECT ri.inventory_item_id, ri.quantity
            FROM recipe_items ri
            WHERE ri.recipe_id          = v_order_item.recipe_id
              AND ri.inventory_item_id  IS NOT NULL
        LOOP
            PERFORM public.decrement_location_stock(
                v_recipe_item.inventory_item_id,
                v_location_id,
                v_recipe_item.quantity * v_order_item.quantity_multiplier * v_order_item.quantity
            );
        END LOOP;
    END LOOP;

    -- Path 3: Modifier deductions
    -- order_item_modifiers.modifier_item_id = modifier_group_items.id = modifier_group_item_recipes.modifier_group_item_id
    FOR v_modifier IN
        SELECT
            oim.quantity,
            mgir.inventory_item_id,
            mgir.quantity_used
        FROM order_item_modifiers oim
        JOIN order_items oi ON oi.id = oim.order_item_id
        JOIN modifier_group_item_recipes mgir ON mgir.modifier_group_item_id = oim.modifier_item_id
        WHERE oi.order_id    = p_order_id
          AND oi.is_voided   = false
    LOOP
        PERFORM public.decrement_location_stock(
            v_modifier.inventory_item_id,
            v_location_id,
            v_modifier.quantity_used * v_modifier.quantity
        );
    END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3g. log_purchase_order_delivery
-- Receives a PO: updates line items, increments stock, writes audit log,
-- marks PO as received.
-- p_received_items: [{inventory_item_id, quantity_received}]
-- Returns: {success, items_processed, discrepancies}
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
    v_items_processed   INTEGER  := 0;
    v_discrepancies     JSONB    := '[]'::jsonb;
BEGIN
    SELECT po.location_id, po.merchant_id
    INTO   v_location_id, v_merchant_id
    FROM   purchase_orders po
    WHERE  po.id = p_purchase_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
    LOOP
        v_inventory_item_id := (v_item->>'inventory_item_id')::UUID;
        v_qty_received      := (v_item->>'quantity_received')::NUMERIC;

        -- Capture pre-receive stock for audit log
        SELECT COALESCE(stock_quantity, 0)
        INTO   v_prev_stock
        FROM   location_inventory_stock
        WHERE  location_id       = v_location_id
        AND  inventory_item_id = v_inventory_item_id;

        -- Get ordered quantity to detect discrepancy
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

        -- Increment stock
        PERFORM public.increment_location_stock(v_inventory_item_id, v_location_id, v_qty_received);

        -- Capture post-receive stock
        SELECT COALESCE(stock_quantity, 0)
        INTO   v_new_stock
        FROM   location_inventory_stock
        WHERE  location_id       = v_location_id
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

        -- Record discrepancy if received != ordered
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

    -- Mark PO as received
    UPDATE purchase_orders
    SET
        status                    = 'received',
        received_at               = now(),
        delivered_by              = p_delivered_by,
        delivered_at              = now(),
        delivery_notes            = p_delivery_notes,
        delivery_logged_by_user_id = p_logged_by_user_id,
        delivery_logged_by_name   = p_logged_by_name,
        updated_at                = now()
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
        'success',         true,
        'items_processed', v_items_processed,
        'discrepancies',   v_discrepancies
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3h. log_purchase_order_payment
-- Records payment, marks PO as paid.
-- Returns: {success, payment_id}
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
BEGIN
    SELECT po.vendor_id, v.name
    INTO   v_vendor_id, v_vendor_name
    FROM   purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE  po.id = p_purchase_order_id;

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
        status        = 'paid',
        paid_at       = now(),
        payment_method = p_payment_method,
        card_last_four = p_card_last_four,
        updated_at    = now()
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3i. create_adhoc_expense
-- Creates a PO-like record for non-inventory expenses (cash payments, etc.)
-- Returns: {success, purchase_order_id, po_number}
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
-- PART 4: Row-Level Security — Enable + Policies on all 11 inventory tables
-- ============================================================================
-- Pattern:
--   SELECT: merchant admin OR location member (for location-scoped tables)
--   INSERT/UPDATE: merchant admin
--   DELETE: merchant owner (stricter)
-- RLS helper functions (is_merchant_admin, is_merchant_owner, is_location_member,
-- current_user_id) are defined in migration 003_1_merchant_locations_optimized_rls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 inventory_items (direct merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_items_select ON inventory_items
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR EXISTS (
            SELECT 1 FROM location_members lm
            JOIN locations l ON l.id = lm.location_id
            WHERE lm.user_id     = current_user_id()
              AND lm.is_active   = true
              AND l.merchant_id  = inventory_items.merchant_id
        )
    );

CREATE POLICY inventory_items_insert ON inventory_items
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY inventory_items_update ON inventory_items
    FOR UPDATE USING (is_merchant_admin(merchant_id));

CREATE POLICY inventory_items_delete ON inventory_items
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ----------------------------------------------------------------------------
-- 4.2 vendors (direct merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_select ON vendors
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR EXISTS (
            SELECT 1 FROM location_members lm
            JOIN locations l ON l.id = lm.location_id
            WHERE lm.user_id    = current_user_id()
              AND lm.is_active  = true
              AND l.merchant_id = vendors.merchant_id
        )
    );

CREATE POLICY vendors_insert ON vendors
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY vendors_update ON vendors
    FOR UPDATE USING (is_merchant_admin(merchant_id));

CREATE POLICY vendors_delete ON vendors
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ----------------------------------------------------------------------------
-- 4.3 purchase_orders (direct merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_orders_select ON purchase_orders
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR EXISTS (
            SELECT 1 FROM location_members lm
            JOIN locations l ON l.id = lm.location_id
            WHERE lm.user_id    = current_user_id()
              AND lm.is_active  = true
              AND l.merchant_id = purchase_orders.merchant_id
        )
    );

CREATE POLICY purchase_orders_insert ON purchase_orders
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY purchase_orders_update ON purchase_orders
    FOR UPDATE USING (is_merchant_admin(merchant_id));

CREATE POLICY purchase_orders_delete ON purchase_orders
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ----------------------------------------------------------------------------
-- 4.4 stock_update_log (direct merchant_id — insert-only for normal users)
-- ----------------------------------------------------------------------------
ALTER TABLE stock_update_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_update_log_select ON stock_update_log
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR EXISTS (
            SELECT 1 FROM location_members lm
            JOIN locations l ON l.id = lm.location_id
            WHERE lm.user_id    = current_user_id()
              AND lm.is_active  = true
              AND l.merchant_id = stock_update_log.merchant_id
        )
    );

CREATE POLICY stock_update_log_insert ON stock_update_log
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

-- No UPDATE policy — audit logs are append-only
-- DELETE restricted to owners only
CREATE POLICY stock_update_log_delete ON stock_update_log
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ----------------------------------------------------------------------------
-- 4.5 location_inventory_stock (location_id → locations.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE location_inventory_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_inventory_stock_select ON location_inventory_stock
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_stock.location_id
              AND (
                    is_merchant_admin(l.merchant_id)
                    OR is_location_member(location_inventory_stock.location_id)
                  )
        )
    );

CREATE POLICY location_inventory_stock_insert ON location_inventory_stock
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_stock.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_inventory_stock_update ON location_inventory_stock
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_stock.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_inventory_stock_delete ON location_inventory_stock
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_stock.location_id
              AND is_merchant_owner(l.merchant_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 4.6 location_inventory_overrides (location_id → locations.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE location_inventory_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_inventory_overrides_select ON location_inventory_overrides
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_overrides.location_id
              AND (
                    is_merchant_admin(l.merchant_id)
                    OR is_location_member(location_inventory_overrides.location_id)
                  )
        )
    );

CREATE POLICY location_inventory_overrides_insert ON location_inventory_overrides
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_overrides.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_inventory_overrides_update ON location_inventory_overrides
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_overrides.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_inventory_overrides_delete ON location_inventory_overrides
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_inventory_overrides.location_id
              AND is_merchant_owner(l.merchant_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 4.7 location_vendors (location_id → locations.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE location_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_vendors_select ON location_vendors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendors.location_id
              AND (
                    is_merchant_admin(l.merchant_id)
                    OR is_location_member(location_vendors.location_id)
                  )
        )
    );

CREATE POLICY location_vendors_insert ON location_vendors
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendors.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_vendors_update ON location_vendors
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendors.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_vendors_delete ON location_vendors
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendors.location_id
              AND is_merchant_owner(l.merchant_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 4.8 location_vendor_pricing (location_id → locations.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE location_vendor_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_vendor_pricing_select ON location_vendor_pricing
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendor_pricing.location_id
              AND (
                    is_merchant_admin(l.merchant_id)
                    OR is_location_member(location_vendor_pricing.location_id)
                  )
        )
    );

CREATE POLICY location_vendor_pricing_insert ON location_vendor_pricing
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendor_pricing.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_vendor_pricing_update ON location_vendor_pricing
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendor_pricing.location_id
              AND is_merchant_admin(l.merchant_id)
        )
    );

CREATE POLICY location_vendor_pricing_delete ON location_vendor_pricing
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM locations l
            WHERE l.id = location_vendor_pricing.location_id
              AND is_merchant_owner(l.merchant_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 4.9 vendor_items (vendor_id → vendors.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE vendor_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_items_select ON vendor_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = vendor_items.vendor_id
              AND is_merchant_admin(v.merchant_id)
        )
    );

CREATE POLICY vendor_items_insert ON vendor_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = vendor_items.vendor_id
              AND is_merchant_admin(v.merchant_id)
        )
    );

CREATE POLICY vendor_items_update ON vendor_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = vendor_items.vendor_id
              AND is_merchant_admin(v.merchant_id)
        )
    );

CREATE POLICY vendor_items_delete ON vendor_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM vendors v
            WHERE v.id = vendor_items.vendor_id
              AND is_merchant_owner(v.merchant_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 4.10 purchase_order_items (purchase_order_id → purchase_orders.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_order_items_select ON purchase_order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND is_merchant_admin(po.merchant_id)
        )
    );

CREATE POLICY purchase_order_items_insert ON purchase_order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND is_merchant_admin(po.merchant_id)
        )
    );

CREATE POLICY purchase_order_items_update ON purchase_order_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND is_merchant_admin(po.merchant_id)
        )
    );

CREATE POLICY purchase_order_items_delete ON purchase_order_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND is_merchant_owner(po.merchant_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 4.11 purchase_order_payments (purchase_order_id → purchase_orders.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE purchase_order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_order_payments_select ON purchase_order_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_payments.purchase_order_id
              AND is_merchant_admin(po.merchant_id)
        )
    );

CREATE POLICY purchase_order_payments_insert ON purchase_order_payments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_payments.purchase_order_id
              AND is_merchant_admin(po.merchant_id)
        )
    );

CREATE POLICY purchase_order_payments_update ON purchase_order_payments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_payments.purchase_order_id
              AND is_merchant_admin(po.merchant_id)
        )
    );

CREATE POLICY purchase_order_payments_delete ON purchase_order_payments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM purchase_orders po
            WHERE po.id = purchase_order_payments.purchase_order_id
              AND is_merchant_owner(po.merchant_id)
        )
    );

-- ============================================================================
-- PART 5: Add inventory_item_id FK to recipe_items
-- Fixes the broken stock deduction chain: recipes had text ingredient_name
-- instead of a proper FK, so recipe-based deductions never worked.
-- Nullable so existing rows are unaffected.
-- ============================================================================

ALTER TABLE recipe_items
    ADD COLUMN IF NOT EXISTS inventory_item_id UUID
        REFERENCES inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_items_inventory_item
    ON recipe_items(inventory_item_id)
    WHERE inventory_item_id IS NOT NULL;

-- ============================================================================
-- PART 6: Standardize stock_update_log.update_reason with CHECK constraint
-- First: normalize existing free-text values to the new enum set.
-- Then: add the CHECK constraint (NULL-safe for any remaining NULLs).
-- ============================================================================

-- Normalize existing non-conforming values found in production
UPDATE stock_update_log SET update_reason = 'physical_count'
WHERE update_reason IN ('counting', 'counted again', 'count again');

UPDATE stock_update_log SET update_reason = 'received_delivery'
WHERE update_reason = 'Delivery from PO';

-- Catch-all: any other unexpected free-text → 'other'
UPDATE stock_update_log
SET update_reason = 'other'
WHERE update_reason IS NOT NULL
  AND update_reason NOT IN (
    'received_delivery', 'manual_adjustment', 'sale_deduction',
    'waste_spoilage', 'physical_count', 'transfer_in', 'transfer_out',
    'initial_stock', 'other'
  );

ALTER TABLE stock_update_log
    ADD CONSTRAINT stock_update_log_update_reason_check CHECK (
        update_reason IS NULL
        OR update_reason = ANY(ARRAY[
            'received_delivery',
            'manual_adjustment',
            'sale_deduction',
            'waste_spoilage',
            'physical_count',
            'transfer_in',
            'transfer_out',
            'initial_stock',
            'other'
        ])
    );

-- ============================================================================
-- PART 7: item_stock deprecation note
-- item_stock tracks menu item stock (not inventory item stock — distinct concept).
-- Still actively used by app/dashboard/actions/stock.ts.
-- Scheduled for full deprecation analysis in Phase 1.
-- ============================================================================
COMMENT ON TABLE item_stock IS 'DEPRECATED: Legacy menu item stock tracker. Scheduled for removal in Phase 1. Use location_inventory_stock + inventory_items instead.';
