-- ============================================================================
-- Phase 3 — Multi-Location Operations
-- T3.1 inventory_transfers + inventory_transfer_items
-- T3.2 initiate_transfer() / receive_transfer() / cancel_transfer()
-- T3.3 unit_conversions
-- T3.4 par_level column on inventory_items
--
-- Inter-location stock movement, par levels, and unit conversions on top of
-- the existing inventory + Phase 1/2 layer.
--
-- Depends on: merchants, locations, inventory_items, location_inventory_stock,
--             stock_update_log, decrement_location_stock, increment_location_stock,
--             update_updated_at_column, is_merchant_admin, is_merchant_owner,
--             is_location_member (all defined in earlier migrations).
-- ============================================================================

-- ============================================================================
-- PART 1 — T3.4: par_level on inventory_items
-- Distinct from reorder_point: reorder_point is the low-stock *alert* threshold;
-- par_level is the target stock level used to size reorder / transfer quantities.
-- ============================================================================

ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS par_level NUMERIC;

COMMENT ON COLUMN public.inventory_items.par_level IS
    'Target on-hand quantity. Auto-PO generation orders up to this level. '
    'Distinct from reorder_point (the low-stock alert threshold).';

-- ============================================================================
-- PART 2 — T3.3: unit_conversions
-- Conversion rules between units (e.g. 1 case = 24 each). A NULL
-- inventory_item_id makes the rule a merchant-wide default for the unit pair.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.unit_conversions (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id         UUID        NOT NULL REFERENCES public.merchants(id)       ON DELETE CASCADE,
    inventory_item_id   UUID                 REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    from_unit           TEXT        NOT NULL,
    to_unit             TEXT        NOT NULL,
    conversion_factor   NUMERIC     NOT NULL CHECK (conversion_factor > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unit_conversions_pkey      PRIMARY KEY (id),
    CONSTRAINT unit_conversions_no_self   CHECK (from_unit <> to_unit),
    CONSTRAINT unit_conversions_unique    UNIQUE (merchant_id, inventory_item_id, from_unit, to_unit)
);

COMMENT ON TABLE public.unit_conversions IS
    'Unit conversion factors. inventory_item_id NULL = merchant-wide default '
    'rule for the from_unit→to_unit pair.';

CREATE INDEX IF NOT EXISTS idx_unit_conversions_merchant
    ON public.unit_conversions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_unit_conversions_item
    ON public.unit_conversions(inventory_item_id);

DROP TRIGGER IF EXISTS set_unit_conversions_updated_at ON public.unit_conversions;
CREATE TRIGGER set_unit_conversions_updated_at
    BEFORE UPDATE ON public.unit_conversions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 3 — T3.1: inventory_transfers + inventory_transfer_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_transfers (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id             UUID        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    from_location_id        UUID        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    to_location_id          UUID        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    transfer_number         TEXT        NOT NULL,
    status                  TEXT        NOT NULL DEFAULT 'in_transit' CHECK (
                                status = ANY(ARRAY[
                                    'draft',
                                    'in_transit',
                                    'received',
                                    'cancelled'
                                ])
                            ),
    notes                   TEXT,
    initiated_by_user_id    TEXT,
    initiated_by_name       TEXT,
    received_by_user_id     TEXT,
    received_by_name        TEXT,
    received_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT inventory_transfers_pkey            PRIMARY KEY (id),
    CONSTRAINT inventory_transfers_distinct_locs   CHECK (from_location_id <> to_location_id),
    CONSTRAINT inventory_transfers_number_unique   UNIQUE (merchant_id, transfer_number)
);

COMMENT ON TABLE public.inventory_transfers IS
    'Inter-location stock transfers. Source stock is decremented on initiate, '
    'destination stock incremented on receive (supports partial receives).';

CREATE TABLE IF NOT EXISTS public.inventory_transfer_items (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    transfer_id         UUID        NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
    inventory_item_id   UUID        NOT NULL REFERENCES public.inventory_items(id)     ON DELETE RESTRICT,
    quantity_sent       NUMERIC     NOT NULL CHECK (quantity_sent > 0),
    quantity_received   NUMERIC,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT inventory_transfer_items_pkey         PRIMARY KEY (id),
    CONSTRAINT inventory_transfer_items_unique_item  UNIQUE (transfer_id, inventory_item_id)
);

COMMENT ON TABLE public.inventory_transfer_items IS
    'Line items for an inventory transfer. quantity_received is NULL until the '
    'transfer is received; a value <> quantity_sent is a receiving discrepancy.';

CREATE INDEX IF NOT EXISTS idx_inventory_transfers_merchant
    ON public.inventory_transfers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from
    ON public.inventory_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to
    ON public.inventory_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status
    ON public.inventory_transfers(status)
    WHERE status IN ('draft', 'in_transit');
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_transfer
    ON public.inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_item
    ON public.inventory_transfer_items(inventory_item_id);

DROP TRIGGER IF EXISTS set_inventory_transfers_updated_at ON public.inventory_transfers;
CREATE TRIGGER set_inventory_transfers_updated_at
    BEFORE UPDATE ON public.inventory_transfers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_inventory_transfer_items_updated_at ON public.inventory_transfer_items;
CREATE TRIGGER set_inventory_transfer_items_updated_at
    BEFORE UPDATE ON public.inventory_transfer_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 4 — T3.2: Transfer RPCs
-- ============================================================================

DROP FUNCTION IF EXISTS public.initiate_transfer(UUID, UUID, UUID, JSONB, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.receive_transfer(UUID, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cancel_transfer(UUID, TEXT, TEXT);

-- ----------------------------------------------------------------------------
-- 4a. initiate_transfer()
-- Creates an in_transit transfer and decrements source-location stock for each
-- line. decrement_location_stock raises P0002 on insufficient stock — the whole
-- transaction (transfer header + every line) then rolls back atomically.
--
-- p_items: JSONB array of { inventory_item_id, quantity }.
-- Returns JSONB: { success, transfer_id, transfer_number, items_count }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initiate_transfer(
    p_merchant_id           UUID,
    p_from_location_id      UUID,
    p_to_location_id        UUID,
    p_items                 JSONB,
    p_notes                 TEXT,
    p_user_id               TEXT,
    p_user_name             TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer_id       UUID;
    v_transfer_number   TEXT;
    v_seq               INTEGER;
    v_item              JSONB;
    v_inv               UUID;
    v_qty               NUMERIC;
    v_prev              NUMERIC;
    v_new               NUMERIC;
    v_count             INTEGER := 0;
BEGIN
    IF p_from_location_id = p_to_location_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'source and destination must differ');
    END IF;
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'no items to transfer');
    END IF;

    -- Sequential per-merchant transfer number (TRF-0001).
    SELECT COUNT(*) + 1 INTO v_seq
    FROM inventory_transfers
    WHERE merchant_id = p_merchant_id;
    v_transfer_number := 'TRF-' || LPAD(v_seq::TEXT, 4, '0');

    INSERT INTO inventory_transfers (
        merchant_id, from_location_id, to_location_id,
        transfer_number, status, notes,
        initiated_by_user_id, initiated_by_name
    ) VALUES (
        p_merchant_id, p_from_location_id, p_to_location_id,
        v_transfer_number, 'in_transit', p_notes,
        p_user_id, p_user_name
    )
    RETURNING id INTO v_transfer_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_inv := (v_item->>'inventory_item_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        SELECT COALESCE(stock_quantity, 0)
        INTO   v_prev
        FROM   location_inventory_stock
        WHERE  location_id       = p_from_location_id
          AND  inventory_item_id = v_inv;

        -- Raises P0002 (insufficient_stock) if source can't cover the quantity.
        PERFORM public.decrement_location_stock(v_inv, p_from_location_id, v_qty);

        SELECT COALESCE(stock_quantity, 0)
        INTO   v_new
        FROM   location_inventory_stock
        WHERE  location_id       = p_from_location_id
          AND  inventory_item_id = v_inv;

        INSERT INTO inventory_transfer_items (transfer_id, inventory_item_id, quantity_sent)
        VALUES (v_transfer_id, v_inv, v_qty);

        INSERT INTO stock_update_log (
            merchant_id, location_id, inventory_item_id,
            previous_stock, new_stock, change_amount,
            update_reason, update_source,
            updated_by_user_id, updated_by_name
        ) VALUES (
            p_merchant_id, p_from_location_id, v_inv,
            v_prev, v_new, -v_qty,
            'transfer_out', 'transfer',
            p_user_id, p_user_name
        );

        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'transfer has no valid line items';
    END IF;

    RETURN jsonb_build_object(
        'success',         true,
        'transfer_id',     v_transfer_id,
        'transfer_number', v_transfer_number,
        'items_count',     v_count
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4b. receive_transfer()
-- Records received quantities, increments destination stock, marks the
-- transfer 'received'. Supports partial receives (quantity_received may differ
-- from quantity_sent) and returns any discrepancies.
--
-- p_received_items: JSONB array of { inventory_item_id, quantity_received }.
-- Returns JSONB: { success, transfer_number, discrepancies: [...] }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_transfer(
    p_transfer_id           UUID,
    p_received_items        JSONB,
    p_user_id               TEXT,
    p_user_name             TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant          UUID;
    v_to                UUID;
    v_status            TEXT;
    v_number            TEXT;
    v_item              JSONB;
    v_inv               UUID;
    v_qty               NUMERIC;
    v_sent              NUMERIC;
    v_prev              NUMERIC;
    v_new               NUMERIC;
    v_discrepancies     JSONB := '[]'::JSONB;
BEGIN
    SELECT merchant_id, to_location_id, status, transfer_number
    INTO   v_merchant, v_to, v_status, v_number
    FROM   inventory_transfers
    WHERE  id = p_transfer_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'transfer not found');
    END IF;
    IF v_status <> 'in_transit' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'transfer is ' || v_status || ' and cannot be received'
        );
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
    LOOP
        v_inv := (v_item->>'inventory_item_id')::UUID;
        v_qty := (v_item->>'quantity_received')::NUMERIC;

        IF v_qty IS NULL OR v_qty < 0 THEN
            CONTINUE;
        END IF;

        SELECT quantity_sent
        INTO   v_sent
        FROM   inventory_transfer_items
        WHERE  transfer_id = p_transfer_id
          AND  inventory_item_id = v_inv;

        IF NOT FOUND THEN
            CONTINUE;  -- item not part of this transfer
        END IF;

        UPDATE inventory_transfer_items
        SET    quantity_received = v_qty
        WHERE  transfer_id = p_transfer_id
          AND  inventory_item_id = v_inv;

        IF v_qty > 0 THEN
            SELECT COALESCE(stock_quantity, 0)
            INTO   v_prev
            FROM   location_inventory_stock
            WHERE  location_id       = v_to
              AND  inventory_item_id = v_inv;

            PERFORM public.increment_location_stock(v_inv, v_to, v_qty);

            SELECT COALESCE(stock_quantity, 0)
            INTO   v_new
            FROM   location_inventory_stock
            WHERE  location_id       = v_to
              AND  inventory_item_id = v_inv;

            INSERT INTO stock_update_log (
                merchant_id, location_id, inventory_item_id,
                previous_stock, new_stock, change_amount,
                update_reason, update_source,
                updated_by_user_id, updated_by_name
            ) VALUES (
                v_merchant, v_to, v_inv,
                v_prev, v_new, v_qty,
                'transfer_in', 'transfer',
                p_user_id, p_user_name
            );
        END IF;

        IF v_qty <> v_sent THEN
            v_discrepancies := v_discrepancies || jsonb_build_object(
                'inventory_item_id', v_inv,
                'sent',     v_sent,
                'received', v_qty
            );
        END IF;
    END LOOP;

    UPDATE inventory_transfers
    SET    status              = 'received',
           received_by_user_id = p_user_id,
           received_by_name    = p_user_name,
           received_at         = now(),
           updated_at          = now()
    WHERE  id = p_transfer_id;

    RETURN jsonb_build_object(
        'success',         true,
        'transfer_number', v_number,
        'discrepancies',   v_discrepancies
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4c. cancel_transfer()
-- Cancels an in_transit transfer and returns every sent quantity to the source
-- location. Already-received transfers cannot be cancelled.
--
-- Returns JSONB: { success, transfer_number }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_transfer(
    p_transfer_id           UUID,
    p_user_id               TEXT,
    p_user_name             TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant          UUID;
    v_from              UUID;
    v_status            TEXT;
    v_number            TEXT;
    v_line              RECORD;
    v_prev              NUMERIC;
    v_new               NUMERIC;
BEGIN
    SELECT merchant_id, from_location_id, status, transfer_number
    INTO   v_merchant, v_from, v_status, v_number
    FROM   inventory_transfers
    WHERE  id = p_transfer_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'transfer not found');
    END IF;
    IF v_status <> 'in_transit' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'only in-transit transfers can be cancelled'
        );
    END IF;

    -- Return sent stock to the source location.
    FOR v_line IN
        SELECT inventory_item_id, quantity_sent
        FROM   inventory_transfer_items
        WHERE  transfer_id = p_transfer_id
    LOOP
        SELECT COALESCE(stock_quantity, 0)
        INTO   v_prev
        FROM   location_inventory_stock
        WHERE  location_id       = v_from
          AND  inventory_item_id = v_line.inventory_item_id;

        PERFORM public.increment_location_stock(
            v_line.inventory_item_id, v_from, v_line.quantity_sent
        );

        SELECT COALESCE(stock_quantity, 0)
        INTO   v_new
        FROM   location_inventory_stock
        WHERE  location_id       = v_from
          AND  inventory_item_id = v_line.inventory_item_id;

        INSERT INTO stock_update_log (
            merchant_id, location_id, inventory_item_id,
            previous_stock, new_stock, change_amount,
            update_reason, update_source,
            updated_by_user_id, updated_by_name
        ) VALUES (
            v_merchant, v_from, v_line.inventory_item_id,
            -- 'transfer_in': stock returns into the source location.
            v_prev, v_new, v_line.quantity_sent,
            'transfer_in', 'transfer',
            p_user_id, p_user_name
        );
    END LOOP;

    UPDATE inventory_transfers
    SET    status     = 'cancelled',
           updated_at = now()
    WHERE  id = p_transfer_id;

    RETURN jsonb_build_object(
        'success',         true,
        'transfer_number', v_number
    );
END;
$$;

-- ============================================================================
-- PART 5 — Row-Level Security
-- Mirrors the Phase 1 inventory pattern: admin for writes, location member for
-- reads, owner for deletes.
-- ============================================================================

-- ---- unit_conversions -------------------------------------------------------
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_conversions_select ON public.unit_conversions;
DROP POLICY IF EXISTS unit_conversions_insert ON public.unit_conversions;
DROP POLICY IF EXISTS unit_conversions_update ON public.unit_conversions;
DROP POLICY IF EXISTS unit_conversions_delete ON public.unit_conversions;

CREATE POLICY unit_conversions_select ON public.unit_conversions
    FOR SELECT USING (is_merchant_admin(merchant_id));
CREATE POLICY unit_conversions_insert ON public.unit_conversions
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));
CREATE POLICY unit_conversions_update ON public.unit_conversions
    FOR UPDATE USING (is_merchant_admin(merchant_id));
CREATE POLICY unit_conversions_delete ON public.unit_conversions
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ---- inventory_transfers ----------------------------------------------------
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_transfers_select ON public.inventory_transfers;
DROP POLICY IF EXISTS inventory_transfers_insert ON public.inventory_transfers;
DROP POLICY IF EXISTS inventory_transfers_update ON public.inventory_transfers;
DROP POLICY IF EXISTS inventory_transfers_delete ON public.inventory_transfers;

CREATE POLICY inventory_transfers_select ON public.inventory_transfers
    FOR SELECT USING (
        is_merchant_admin(merchant_id)
        OR is_location_member(from_location_id)
        OR is_location_member(to_location_id)
    );
CREATE POLICY inventory_transfers_insert ON public.inventory_transfers
    FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));
CREATE POLICY inventory_transfers_update ON public.inventory_transfers
    FOR UPDATE USING (is_merchant_admin(merchant_id));
CREATE POLICY inventory_transfers_delete ON public.inventory_transfers
    FOR DELETE USING (is_merchant_owner(merchant_id));

-- ---- inventory_transfer_items ----------------------------------------------
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_transfer_items_select ON public.inventory_transfer_items;
DROP POLICY IF EXISTS inventory_transfer_items_insert ON public.inventory_transfer_items;
DROP POLICY IF EXISTS inventory_transfer_items_update ON public.inventory_transfer_items;
DROP POLICY IF EXISTS inventory_transfer_items_delete ON public.inventory_transfer_items;

CREATE POLICY inventory_transfer_items_select ON public.inventory_transfer_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM inventory_transfers it
            WHERE it.id = inventory_transfer_items.transfer_id
              AND (
                    is_merchant_admin(it.merchant_id)
                    OR is_location_member(it.from_location_id)
                    OR is_location_member(it.to_location_id)
                  )
        )
    );
CREATE POLICY inventory_transfer_items_insert ON public.inventory_transfer_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM inventory_transfers it
            WHERE it.id = inventory_transfer_items.transfer_id
              AND is_merchant_admin(it.merchant_id)
        )
    );
CREATE POLICY inventory_transfer_items_update ON public.inventory_transfer_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM inventory_transfers it
            WHERE it.id = inventory_transfer_items.transfer_id
              AND is_merchant_admin(it.merchant_id)
        )
    );
CREATE POLICY inventory_transfer_items_delete ON public.inventory_transfer_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM inventory_transfers it
            WHERE it.id = inventory_transfer_items.transfer_id
              AND is_merchant_owner(it.merchant_id)
        )
    );

-- ============================================================================
-- PART 6 — Grants (match Phase 1/2 inventory RPC exposure)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.initiate_transfer(UUID, UUID, UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_transfer(UUID, JSONB, TEXT, TEXT)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(UUID, TEXT, TEXT)                            TO authenticated, service_role;
