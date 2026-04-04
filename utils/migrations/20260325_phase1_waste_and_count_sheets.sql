-- ============================================================================
-- DEXA POS - Phase 1: Waste Tracking & Inventory Count Sheets
-- ============================================================================
-- Builds on Phase 0 (RLS + stock RPCs). Adds:
--   1. waste_logs table + log_waste() RPC
--   2. inventory_counts + inventory_count_items tables
--   3. create_inventory_count() and submit_inventory_count() RPCs
--   4. RLS policies on all three new tables
--   5. Performance indexes
--
-- Depends on: is_merchant_admin, is_merchant_owner, is_location_member,
--             current_user_id, decrement_location_stock, set_location_stock
--             (all defined in earlier migrations)
-- ============================================================================

-- ============================================================================
-- PART 1: waste_logs
-- Records every unit of inventory lost to spoilage, spills, theft, etc.
-- Feeds Actual vs Theoretical food cost reporting.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waste_logs (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id         UUID        NOT NULL REFERENCES public.merchants(id)          ON DELETE CASCADE,
    location_id         UUID        NOT NULL REFERENCES public.locations(id)          ON DELETE CASCADE,
    inventory_item_id   UUID        NOT NULL REFERENCES public.inventory_items(id)    ON DELETE RESTRICT,
    quantity            NUMERIC     NOT NULL CHECK (quantity > 0),
    reason              TEXT        NOT NULL CHECK (
                            reason = ANY(ARRAY[
                                'spoilage',
                                'overproduction',
                                'spill',
                                'theft',
                                'damaged',
                                'expired',
                                'other'
                            ])
                        ),
    notes               TEXT,
    waste_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    estimated_cost      NUMERIC     DEFAULT 0,    -- quantity × cost_per_unit at log time
    logged_by_user_id   TEXT,
    logged_by_name      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT waste_logs_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.waste_logs IS
    'Records inventory waste events (spoilage, spill, theft, etc.). '
    'Drives Actual vs Theoretical food cost and shrinkage reports.';

-- ============================================================================
-- PART 2: inventory_counts + inventory_count_items
-- Enables scheduled physical inventory counts with snapshot → count → variance
-- workflow. Supports full-catalog and category-filtered count sheets.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_counts (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id             UUID        NOT NULL REFERENCES public.merchants(id)   ON DELETE CASCADE,
    location_id             UUID        NOT NULL REFERENCES public.locations(id)   ON DELETE CASCADE,
    count_name              TEXT        NOT NULL,
    status                  TEXT        NOT NULL DEFAULT 'draft' CHECK (
                                status = ANY(ARRAY[
                                    'draft',
                                    'in_progress',
                                    'completed',
                                    'approved'
                                ])
                            ),
    assigned_to_user_id     TEXT,
    assigned_to_name        TEXT,
    approved_by_user_id     TEXT,
    approved_by_name        TEXT,
    notes                   TEXT,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    approved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT inventory_counts_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.inventory_counts IS
    'Physical inventory count sessions. Each count snapshots expected stock, '
    'collects actual counted quantities, and optionally applies stock adjustments.';

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    count_id            UUID        NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
    inventory_item_id   UUID        NOT NULL REFERENCES public.inventory_items(id)  ON DELETE RESTRICT,
    expected_quantity   NUMERIC     NOT NULL DEFAULT 0,  -- system stock at count start
    counted_quantity    NUMERIC,                          -- filled in by staff; NULL = not yet counted
    variance            NUMERIC     GENERATED ALWAYS AS (
                            CASE
                                WHEN counted_quantity IS NOT NULL
                                THEN counted_quantity - expected_quantity
                                ELSE NULL
                            END
                        ) STORED,
    variance_cost       NUMERIC,    -- populated by submit_inventory_count: variance × cost_per_unit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT inventory_count_items_pkey        PRIMARY KEY (id),
    CONSTRAINT inventory_count_items_unique_item UNIQUE (count_id, inventory_item_id)
);

COMMENT ON TABLE public.inventory_count_items IS
    'Line items for an inventory count session. variance is auto-computed '
    '(counted - expected). variance_cost is set by submit_inventory_count().';

-- ============================================================================
-- PART 3: Performance Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_waste_logs_merchant
    ON public.waste_logs(merchant_id);

CREATE INDEX IF NOT EXISTS idx_waste_logs_location
    ON public.waste_logs(location_id);

CREATE INDEX IF NOT EXISTS idx_waste_logs_inventory_item
    ON public.waste_logs(inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_waste_logs_waste_date
    ON public.waste_logs(waste_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant
    ON public.inventory_counts(merchant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_location
    ON public.inventory_counts(location_id);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_status
    ON public.inventory_counts(status)
    WHERE status IN ('draft', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count
    ON public.inventory_count_items(count_id);

CREATE INDEX IF NOT EXISTS idx_inventory_count_items_item
    ON public.inventory_count_items(inventory_item_id);

-- ============================================================================
-- PART 4: updated_at trigger for inventory_counts
-- ============================================================================

CREATE TRIGGER set_inventory_counts_updated_at
    BEFORE UPDATE ON public.inventory_counts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 5: RPC Definitions
-- ============================================================================

-- Drop existing versions to allow re-creation (idempotent deploys)
DROP FUNCTION IF EXISTS public.log_waste(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.create_inventory_count(UUID, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.submit_inventory_count(UUID, JSONB, TEXT, TEXT, BOOLEAN);

-- ----------------------------------------------------------------------------
-- 5a. log_waste()
-- Records a waste event, decrements stock at the location, and appends an
-- audit row to stock_update_log.
--
-- Returns JSONB: { success, waste_log_id, estimated_cost, new_stock }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_waste(
    p_merchant_id           UUID,
    p_location_id           UUID,
    p_inventory_item_id     UUID,
    p_quantity              NUMERIC,
    p_reason                TEXT,
    p_notes                 TEXT,
    p_logged_by_user_id     TEXT,
    p_logged_by_name        TEXT,
    p_waste_date            DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_waste_log_id      UUID;
    v_cost_per_unit     NUMERIC;
    v_estimated_cost    NUMERIC;
    v_prev_stock        NUMERIC;
    v_new_stock         NUMERIC;
BEGIN
    -- Validate quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'quantity must be greater than zero');
    END IF;

    -- Fetch cost_per_unit for estimated_cost calculation
    SELECT COALESCE(cost_per_unit, 0)
    INTO   v_cost_per_unit
    FROM   inventory_items
    WHERE  id = p_inventory_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'inventory item not found');
    END IF;

    v_estimated_cost := ROUND(v_cost_per_unit * p_quantity, 4);

    -- Capture pre-waste stock
    SELECT COALESCE(stock_quantity, 0)
    INTO   v_prev_stock
    FROM   location_inventory_stock
    WHERE  location_id       = p_location_id
      AND  inventory_item_id = p_inventory_item_id;

    -- Insert waste record
    INSERT INTO waste_logs (
        merchant_id, location_id, inventory_item_id,
        quantity, reason, notes,
        waste_date, estimated_cost,
        logged_by_user_id, logged_by_name
    ) VALUES (
        p_merchant_id, p_location_id, p_inventory_item_id,
        p_quantity, p_reason, p_notes,
        p_waste_date, v_estimated_cost,
        p_logged_by_user_id, p_logged_by_name
    )
    RETURNING id INTO v_waste_log_id;

    -- Decrement stock (floored at 0)
    PERFORM public.decrement_location_stock(p_inventory_item_id, p_location_id, p_quantity);

    -- Capture post-waste stock
    SELECT COALESCE(stock_quantity, 0)
    INTO   v_new_stock
    FROM   location_inventory_stock
    WHERE  location_id       = p_location_id
      AND  inventory_item_id = p_inventory_item_id;

    -- Audit log
    INSERT INTO stock_update_log (
        merchant_id, location_id, inventory_item_id,
        previous_stock, new_stock, change_amount,
        update_reason, update_source,
        updated_by_user_id, updated_by_name
    ) VALUES (
        p_merchant_id, p_location_id, p_inventory_item_id,
        v_prev_stock, v_new_stock, -p_quantity,
        'waste_spoilage', 'waste',
        p_logged_by_user_id, p_logged_by_name
    );

    RETURN jsonb_build_object(
        'success',        true,
        'waste_log_id',   v_waste_log_id,
        'estimated_cost', v_estimated_cost,
        'new_stock',      v_new_stock
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5b. create_inventory_count()
-- Creates a count session and snapshots current stock as expected_quantity
-- for every active inventory item at the location.
--
-- p_item_ids: optional JSONB array of UUIDs to limit scope; NULL = all active
--             items at the location (global + location-specific).
--
-- Returns JSONB: { success, count_id, items_count }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_inventory_count(
    p_merchant_id           UUID,
    p_location_id           UUID,
    p_count_name            TEXT,
    p_assigned_to_user_id   TEXT  DEFAULT NULL,
    p_assigned_to_name      TEXT  DEFAULT NULL,
    p_item_ids              JSONB DEFAULT NULL   -- e.g. '["uuid1","uuid2"]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count_id      UUID;
    v_items_count   INTEGER;
BEGIN
    -- Create count session
    INSERT INTO inventory_counts (
        merchant_id, location_id,
        count_name, status,
        assigned_to_user_id, assigned_to_name
    ) VALUES (
        p_merchant_id, p_location_id,
        p_count_name, 'draft',
        p_assigned_to_user_id, p_assigned_to_name
    )
    RETURNING id INTO v_count_id;

    -- Snapshot current stock for each item in scope
    -- Scope: active items belonging to this merchant (global OR location-specific)
    -- Stock snapshot: use location_inventory_stock if a row exists, else 0
    INSERT INTO inventory_count_items (count_id, inventory_item_id, expected_quantity)
    SELECT
        v_count_id,
        ii.id,
        COALESCE(lis.stock_quantity, 0)
    FROM inventory_items ii
    LEFT JOIN location_inventory_stock lis
        ON  lis.inventory_item_id = ii.id
        AND lis.location_id       = p_location_id
    WHERE ii.merchant_id  = p_merchant_id
      AND ii.is_active    = true
      AND (
            -- global items (shared across all locations)
            ii.location_id IS NULL
            OR
            -- items specific to this location
            ii.location_id = p_location_id
          )
      AND (
            -- no filter → include all in-scope items
            p_item_ids IS NULL
            OR
            -- filter to requested item UUIDs
            ii.id = ANY(
                SELECT elem::UUID
                FROM jsonb_array_elements_text(p_item_ids) AS elem
            )
          );

    GET DIAGNOSTICS v_items_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success',      true,
        'count_id',     v_count_id,
        'items_count',  v_items_count
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5c. submit_inventory_count()
-- Receives staff-entered counts, calculates variances and variance_cost,
-- marks the count as completed, and optionally reconciles stock.
--
-- p_counted_items: JSONB array of { inventory_item_id, counted_quantity }
-- p_apply_adjustments: when true, calls set_location_stock for every item
--                      that has a non-zero variance and logs to stock_update_log.
--
-- Returns JSONB: { success, items_counted, total_variance_cost, adjustments_applied }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_inventory_count(
    p_count_id              UUID,
    p_counted_items         JSONB,   -- [{inventory_item_id, counted_quantity}]
    p_user_id               TEXT,
    p_user_name             TEXT,
    p_apply_adjustments     BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_location_id           UUID;
    v_merchant_id           UUID;
    v_count_status          TEXT;
    v_item                  JSONB;
    v_inventory_item_id     UUID;
    v_counted_qty           NUMERIC;
    v_expected_qty          NUMERIC;
    v_variance              NUMERIC;
    v_cost_per_unit         NUMERIC;
    v_variance_cost         NUMERIC;
    v_total_variance_cost   NUMERIC  := 0;
    v_items_counted         INTEGER  := 0;
    v_adjustments_applied   INTEGER  := 0;
BEGIN
    -- Fetch count session metadata and validate status
    SELECT ic.location_id, ic.merchant_id, ic.status
    INTO   v_location_id, v_merchant_id, v_count_status
    FROM   inventory_counts ic
    WHERE  ic.id = p_count_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'count session not found');
    END IF;

    IF v_count_status IN ('completed', 'approved') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'count is already ' || v_count_status || ' and cannot be modified'
        );
    END IF;

    -- Mark as in_progress when first items are submitted
    IF v_count_status = 'draft' THEN
        UPDATE inventory_counts
        SET status     = 'in_progress',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
        WHERE id = p_count_id;
    END IF;

    -- Process each submitted count item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_counted_items)
    LOOP
        v_inventory_item_id := (v_item->>'inventory_item_id')::UUID;
        v_counted_qty       := (v_item->>'counted_quantity')::NUMERIC;

        IF v_counted_qty IS NULL OR v_counted_qty < 0 THEN
            CONTINUE;
        END IF;

        -- Fetch expected_quantity from the count snapshot and item cost
        SELECT ici.expected_quantity, ii.cost_per_unit
        INTO   v_expected_qty, v_cost_per_unit
        FROM   inventory_count_items ici
        JOIN   inventory_items ii ON ii.id = ici.inventory_item_id
        WHERE  ici.count_id          = p_count_id
          AND  ici.inventory_item_id = v_inventory_item_id;

        IF NOT FOUND THEN
            -- Item wasn't part of this count's scope; skip silently
            CONTINUE;
        END IF;

        v_variance      := v_counted_qty - v_expected_qty;
        v_variance_cost := ROUND(v_variance * COALESCE(v_cost_per_unit, 0), 4);

        -- Write counted_quantity and variance_cost back to count item
        UPDATE inventory_count_items
        SET counted_quantity = v_counted_qty,
            variance_cost    = v_variance_cost
        WHERE count_id          = p_count_id
          AND inventory_item_id = v_inventory_item_id;

        v_total_variance_cost := v_total_variance_cost + v_variance_cost;
        v_items_counted := v_items_counted + 1;

        -- Optionally reconcile stock for items with a variance
        IF p_apply_adjustments AND v_variance <> 0 THEN
            PERFORM public.set_location_stock(v_inventory_item_id, v_location_id, v_counted_qty);

            INSERT INTO stock_update_log (
                merchant_id, location_id, inventory_item_id,
                previous_stock, new_stock, change_amount,
                update_reason, update_source,
                updated_by_user_id, updated_by_name
            ) VALUES (
                v_merchant_id, v_location_id, v_inventory_item_id,
                v_expected_qty, v_counted_qty, v_variance,
                'physical_count', 'adjustment',
                p_user_id, p_user_name
            );

            v_adjustments_applied := v_adjustments_applied + 1;
        END IF;
    END LOOP;

    -- Mark count as completed
    UPDATE inventory_counts
    SET status       = 'completed',
        completed_at = now(),
        updated_at   = now()
    WHERE id = p_count_id;

    RETURN jsonb_build_object(
        'success',              true,
        'items_counted',        v_items_counted,
        'total_variance_cost',  v_total_variance_cost,
        'adjustments_applied',  v_adjustments_applied
    );
END;
$$;

-- ============================================================================
-- PART 6: Row-Level Security
-- Same pattern as Phase 0: admin for writes, location member for reads,
-- owner for deletes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.1 waste_logs (direct merchant_id + location_id)
-- ----------------------------------------------------------------------------
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY waste_logs_select ON public.waste_logs
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR is_location_member(location_id)
    );

CREATE POLICY waste_logs_insert ON public.waste_logs
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

-- Waste logs are append-only; no UPDATE policy intentionally
CREATE POLICY waste_logs_delete ON public.waste_logs
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ----------------------------------------------------------------------------
-- 6.2 inventory_counts (direct merchant_id + location_id)
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_counts_select ON public.inventory_counts
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR is_location_member(location_id)
    );

CREATE POLICY inventory_counts_insert ON public.inventory_counts
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));

CREATE POLICY inventory_counts_update ON public.inventory_counts
    FOR UPDATE USING (is_merchant_admin(merchant_id));

CREATE POLICY inventory_counts_delete ON public.inventory_counts
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ----------------------------------------------------------------------------
-- 6.3 inventory_count_items (count_id → inventory_counts.merchant_id)
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_count_items_select ON public.inventory_count_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM inventory_counts ic
            WHERE ic.id = inventory_count_items.count_id
              AND (
                    is_merchant_admin(ic.merchant_id)
                    OR is_location_member(ic.location_id)
                  )
        )
    );

CREATE POLICY inventory_count_items_insert ON public.inventory_count_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM inventory_counts ic
            WHERE ic.id = inventory_count_items.count_id
              AND is_merchant_admin(ic.merchant_id)
        )
    );

CREATE POLICY inventory_count_items_update ON public.inventory_count_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM inventory_counts ic
            WHERE ic.id = inventory_count_items.count_id
              AND is_merchant_admin(ic.merchant_id)
        )
    );

CREATE POLICY inventory_count_items_delete ON public.inventory_count_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM inventory_counts ic
            WHERE ic.id = inventory_count_items.count_id
              AND is_merchant_owner(ic.merchant_id)
        )
    );
