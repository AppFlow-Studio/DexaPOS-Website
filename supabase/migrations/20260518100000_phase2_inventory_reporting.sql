-- ============================================================================
-- Phase 2 — Inventory Reporting & Analytics
-- T2.1 get_cogs_report()  •  T2.2 get_food_cost_analysis()
--
-- Adds COGS visibility and theoretical-vs-actual food-cost analysis on top of
-- the existing inventory + Phase 1 waste/count layer. No schema changes — these
-- are read-only reporting RPCs.
--
-- "Sold" orders = every order EXCEPT status draft / cancelled / refunded / void.
--
-- Inventory value at an arbitrary point in time is reconstructed by reversing
-- stock_update_log deltas back from current stock. This assumes the stock log
-- is complete back to the requested start date; locations that predate the log
-- may report an understated beginning value.
-- ============================================================================

DROP FUNCTION IF EXISTS public._inventory_value_at(UUID, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_cogs_report(UUID, UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.get_food_cost_analysis(UUID, UUID, DATE, DATE);
-- ----------------------------------------------------------------------------
-- Helper: inventory value (at cost) as of a timestamp.
-- value = Σ (current_stock − Σ change_amount on/after p_at) × effective cost
-- p_location_id NULL ⇒ aggregate across all merchant locations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._inventory_value_at(
    p_merchant_id   UUID,
    p_location_id   UUID,
    p_at            TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(
        (cur.current_qty - COALESCE(d.delta_after, 0)) *
        COALESCE(
            CASE WHEN p_location_id IS NOT NULL THEN ovr.cost END,
            ii.cost_per_unit,
            0
        )
    ), 0)
    FROM inventory_items ii
    JOIN (
        SELECT inventory_item_id, SUM(COALESCE(stock_quantity, 0)) AS current_qty
        FROM location_inventory_stock
        WHERE (p_location_id IS NULL OR location_id = p_location_id)
        GROUP BY inventory_item_id
    ) cur ON cur.inventory_item_id = ii.id
    LEFT JOIN (
        SELECT inventory_item_id, SUM(COALESCE(change_amount, 0)) AS delta_after
        FROM stock_update_log
        WHERE merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
          AND created_at >= p_at
        GROUP BY inventory_item_id
    ) d ON d.inventory_item_id = ii.id
    LEFT JOIN LATERAL (
        SELECT COALESCE(lio.custom_cost, lio.cost_per_unit) AS cost
        FROM location_inventory_overrides lio
        WHERE lio.inventory_item_id = ii.id
          AND lio.location_id = p_location_id
        LIMIT 1
    ) ovr ON TRUE
    WHERE ii.merchant_id = p_merchant_id;
$$;
-- ----------------------------------------------------------------------------
-- T2.1 — get_cogs_report()
-- COGS = beginning inventory + purchases (received POs) − ending inventory.
--
-- Returns JSONB:
-- {
--   start_date, end_date,
--   beginning_value, purchases, ending_value,
--   total_cogs, revenue, cogs_percent, gross_profit,
--   by_category: [{ category, cogs, purchases, beginning_value, ending_value }],
--   by_item:     [{ inventory_item_id, name, category, unit_type,
--                   cogs, purchases, beginning_value, ending_value }]
-- }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cogs_report(
    p_merchant_id   UUID,
    p_location_id   UUID,
    p_start_date    DATE,
    p_end_date      DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start_ts      TIMESTAMPTZ := p_start_date::TIMESTAMPTZ;
    v_end_ts        TIMESTAMPTZ := (p_end_date + 1)::TIMESTAMPTZ;  -- exclusive upper bound
    v_revenue       NUMERIC;
    v_result        JSONB;
BEGIN
    -- Revenue: sold orders within the period (location-scoped).
    SELECT COALESCE(SUM(
        COALESCE(NULLIF(o.effective_total, 0), o.total_amount, 0)
    ), 0)
    INTO v_revenue
    FROM orders o
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.status NOT IN ('draft', 'cancelled', 'refunded', 'void')
      AND COALESCE(o.completed_at, o.created_at) >= v_start_ts
      AND COALESCE(o.completed_at, o.created_at) <  v_end_ts;

    WITH
    -- effective cost per item (location override wins when location-scoped)
    costs AS (
        SELECT ii.id AS inventory_item_id,
               COALESCE(
                   CASE WHEN p_location_id IS NOT NULL THEN ovr.cost END,
                   ii.cost_per_unit, 0
               ) AS cost
        FROM inventory_items ii
        LEFT JOIN LATERAL (
            SELECT COALESCE(lio.custom_cost, lio.cost_per_unit) AS cost
            FROM location_inventory_overrides lio
            WHERE lio.inventory_item_id = ii.id
              AND lio.location_id = p_location_id
            LIMIT 1
        ) ovr ON TRUE
        WHERE ii.merchant_id = p_merchant_id
    ),
    -- current stock per item, scoped
    stock AS (
        SELECT inventory_item_id, SUM(COALESCE(stock_quantity, 0)) AS current_qty
        FROM location_inventory_stock
        WHERE (p_location_id IS NULL OR location_id = p_location_id)
        GROUP BY inventory_item_id
    ),
    -- stock-log deltas: since start (for beginning), after end (for ending)
    deltas AS (
        SELECT inventory_item_id,
               SUM(COALESCE(change_amount, 0))
                   FILTER (WHERE created_at >= v_start_ts) AS delta_since_start,
               SUM(COALESCE(change_amount, 0))
                   FILTER (WHERE created_at >= v_end_ts)   AS delta_after_end
        FROM stock_update_log
        WHERE merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
        GROUP BY inventory_item_id
    ),
    -- purchases: received PO line items within the period
    purchases AS (
        SELECT poi.inventory_item_id,
               SUM(COALESCE(poi.quantity_received, 0) * COALESCE(poi.unit_cost, 0)) AS purchase_cost
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.purchase_order_id
        WHERE po.merchant_id = p_merchant_id
          AND COALESCE(po.is_adhoc_expense, FALSE) = FALSE
          AND po.status IN ('received', 'paid')
          AND po.received_at >= v_start_ts
          AND po.received_at <  v_end_ts
          AND (p_location_id IS NULL OR po.location_id = p_location_id)
          AND poi.inventory_item_id IS NOT NULL
        GROUP BY poi.inventory_item_id
    ),
    per_item AS (
        SELECT ii.id,
               ii.name,
               COALESCE(NULLIF(TRIM(ii.category), ''), 'Uncategorized') AS category,
               ii.unit_type,
               COALESCE(c.cost, 0)                                    AS cost,
               (COALESCE(s.current_qty, 0) - COALESCE(d.delta_since_start, 0)) AS beginning_qty,
               (COALESCE(s.current_qty, 0) - COALESCE(d.delta_after_end, 0))   AS ending_qty,
               COALESCE(p.purchase_cost, 0)                           AS purchases
        FROM inventory_items ii
        LEFT JOIN costs     c ON c.inventory_item_id = ii.id
        LEFT JOIN stock     s ON s.inventory_item_id = ii.id
        LEFT JOIN deltas    d ON d.inventory_item_id = ii.id
        LEFT JOIN purchases p ON p.inventory_item_id = ii.id
        WHERE ii.merchant_id = p_merchant_id
    ),
    item_calc AS (
        SELECT id, name, category, unit_type,
               ROUND(beginning_qty * cost, 2) AS beginning_value,
               ROUND(ending_qty    * cost, 2) AS ending_value,
               ROUND(purchases, 2)            AS purchases,
               ROUND(beginning_qty * cost + purchases - ending_qty * cost, 2) AS cogs
        FROM per_item
    ),
    totals AS (
        SELECT COALESCE(SUM(beginning_value), 0) AS beginning_value,
               COALESCE(SUM(ending_value), 0)    AS ending_value,
               COALESCE(SUM(purchases), 0)       AS purchases,
               COALESCE(SUM(cogs), 0)            AS total_cogs
        FROM item_calc
    ),
    by_category AS (
        SELECT jsonb_agg(jsonb_build_object(
                   'category',        category,
                   'cogs',            cogs,
                   'purchases',       purchases,
                   'beginning_value', beginning_value,
                   'ending_value',    ending_value
               ) ORDER BY cogs DESC) AS arr
        FROM (
            SELECT category,
                   ROUND(SUM(cogs), 2)            AS cogs,
                   ROUND(SUM(purchases), 2)       AS purchases,
                   ROUND(SUM(beginning_value), 2) AS beginning_value,
                   ROUND(SUM(ending_value), 2)    AS ending_value
            FROM item_calc
            GROUP BY category
        ) g
    ),
    by_item AS (
        SELECT jsonb_agg(jsonb_build_object(
                   'inventory_item_id', id,
                   'name',              name,
                   'category',          category,
                   'unit_type',         unit_type,
                   'cogs',              cogs,
                   'purchases',         purchases,
                   'beginning_value',   beginning_value,
                   'ending_value',      ending_value
               ) ORDER BY cogs DESC) AS arr
        FROM item_calc
        WHERE cogs <> 0 OR purchases <> 0
    )
    SELECT jsonb_build_object(
        'start_date',      p_start_date,
        'end_date',        p_end_date,
        'beginning_value', t.beginning_value,
        'purchases',       t.purchases,
        'ending_value',    t.ending_value,
        'total_cogs',      t.total_cogs,
        'revenue',         ROUND(v_revenue, 2),
        'cogs_percent',    CASE WHEN v_revenue > 0
                                THEN ROUND(t.total_cogs / v_revenue * 100, 2)
                                ELSE 0 END,
        'gross_profit',    ROUND(v_revenue - t.total_cogs, 2),
        'by_category',     COALESCE(bc.arr, '[]'::jsonb),
        'by_item',         COALESCE(bi.arr, '[]'::jsonb)
    )
    INTO v_result
    FROM totals t, by_category bc, by_item bi;

    RETURN v_result;
END;
$$;
-- ----------------------------------------------------------------------------
-- T2.2 — get_food_cost_analysis()
-- Theoretical cost = recipes × sales. Actual cost = beginning + purchases
-- − ending − waste. Variance exposes shrinkage / over-portioning / recipe drift.
--
-- Returns JSONB:
-- {
--   start_date, end_date,
--   theoretical_cost, actual_cost, waste_cost, variance, variance_percent,
--   by_category: [{ category, theoretical, actual, variance }],
--   by_week:     [{ week_start, theoretical, actual }]
-- }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_food_cost_analysis(
    p_merchant_id   UUID,
    p_location_id   UUID,
    p_start_date    DATE,
    p_end_date      DATE
)
RETURNS JSONB
LANGUAGE plpgsql
-- VOLATILE (default): creates session-scoped TEMP tables, so it must not be STABLE.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start_ts          TIMESTAMPTZ := p_start_date::TIMESTAMPTZ;
    v_end_ts            TIMESTAMPTZ := (p_end_date + 1)::TIMESTAMPTZ;
    v_theoretical       NUMERIC := 0;
    v_actual            NUMERIC := 0;
    v_waste             NUMERIC := 0;
    v_by_category       JSONB;
    v_by_week           JSONB;
    v_result            JSONB;
BEGIN
    -- ---- effective cost per item -------------------------------------------
    CREATE TEMP TABLE _fc_costs ON COMMIT DROP AS
    SELECT ii.id AS inventory_item_id,
           COALESCE(NULLIF(TRIM(ii.category), ''), 'Uncategorized') AS category,
           COALESCE(
               CASE WHEN p_location_id IS NOT NULL THEN ovr.cost END,
               ii.cost_per_unit, 0
           ) AS cost
    FROM inventory_items ii
    LEFT JOIN LATERAL (
        SELECT COALESCE(lio.custom_cost, lio.cost_per_unit) AS cost
        FROM location_inventory_overrides lio
        WHERE lio.inventory_item_id = ii.id
          AND lio.location_id = p_location_id
        LIMIT 1
    ) ovr ON TRUE
    WHERE ii.merchant_id = p_merchant_id;

    -- ---- theoretical usage from sold orders --------------------------------
    -- sold order-item lines, bucketed by ISO week
    CREATE TEMP TABLE _fc_sold ON COMMIT DROP AS
    SELECT oi.menu_item_id,
           oi.quantity::NUMERIC AS qty,
           date_trunc('week', COALESCE(o.completed_at, o.created_at))::DATE AS week_start
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.status NOT IN ('draft', 'cancelled', 'refunded', 'void')
      AND COALESCE(oi.is_voided, FALSE) = FALSE
      AND COALESCE(o.completed_at, o.created_at) >= v_start_ts
      AND COALESCE(o.completed_at, o.created_at) <  v_end_ts
      AND oi.menu_item_id IS NOT NULL;

    -- theoretical inventory consumption per (week, item): direct + recipe paths
    CREATE TEMP TABLE _fc_theo ON COMMIT DROP AS
    SELECT week_start, inventory_item_id, SUM(qty_used) AS qty_used
    FROM (
        -- direct menu_item → inventory link
        SELECT s.week_start,
               mir.inventory_item_id,
               s.qty * COALESCE(mir.quantity_used, 1)
                     * COALESCE(mir.quantity_multiplier, 1) AS qty_used
        FROM _fc_sold s
        JOIN menu_item_recipes mir ON mir.menu_item_id = s.menu_item_id
        WHERE mir.inventory_item_id IS NOT NULL

        UNION ALL

        -- recipe → recipe_items → inventory link
        SELECT s.week_start,
               ri.inventory_item_id,
               s.qty * COALESCE(ri.quantity, 0)
                     * COALESCE(mir.quantity_multiplier, 1) AS qty_used
        FROM _fc_sold s
        JOIN menu_item_recipes mir ON mir.menu_item_id = s.menu_item_id
        JOIN recipe_items ri        ON ri.recipe_id = mir.recipe_id
        WHERE mir.recipe_id IS NOT NULL
          AND ri.inventory_item_id IS NOT NULL
    ) u
    GROUP BY week_start, inventory_item_id;

    SELECT COALESCE(SUM(t.qty_used * c.cost), 0)
    INTO v_theoretical
    FROM _fc_theo t
    JOIN _fc_costs c ON c.inventory_item_id = t.inventory_item_id;

    -- ---- waste cost in period ----------------------------------------------
    SELECT COALESCE(SUM(estimated_cost), 0)
    INTO v_waste
    FROM waste_logs
    WHERE merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND waste_date >= p_start_date
      AND waste_date <= p_end_date;

    -- ---- actual cost = beginning + purchases − ending − waste --------------
    v_actual :=
        public._inventory_value_at(p_merchant_id, p_location_id, v_start_ts)
        + (
            SELECT COALESCE(SUM(COALESCE(poi.quantity_received, 0) * COALESCE(poi.unit_cost, 0)), 0)
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchase_order_id
            WHERE po.merchant_id = p_merchant_id
              AND COALESCE(po.is_adhoc_expense, FALSE) = FALSE
              AND po.status IN ('received', 'paid')
              AND po.received_at >= v_start_ts
              AND po.received_at <  v_end_ts
              AND (p_location_id IS NULL OR po.location_id = p_location_id)
          )
        - public._inventory_value_at(p_merchant_id, p_location_id, v_end_ts)
        - v_waste;

    -- ---- by category --------------------------------------------------------
    WITH theo_cat AS (
        SELECT c.category, SUM(t.qty_used * c.cost) AS theoretical
        FROM _fc_theo t
        JOIN _fc_costs c ON c.inventory_item_id = t.inventory_item_id
        GROUP BY c.category
    ),
    -- actual per category: per-item COGS reuse, minus per-category waste
    item_actual AS (
        SELECT c.category,
               (COALESCE(s.current_qty, 0) - COALESCE(d.delta_since_start, 0)) * c.cost
               + COALESCE(p.purchase_cost, 0)
               - (COALESCE(s.current_qty, 0) - COALESCE(d.delta_after_end, 0)) * c.cost AS actual_cogs
        FROM _fc_costs c
        LEFT JOIN (
            SELECT inventory_item_id, SUM(COALESCE(stock_quantity, 0)) AS current_qty
            FROM location_inventory_stock
            WHERE (p_location_id IS NULL OR location_id = p_location_id)
            GROUP BY inventory_item_id
        ) s ON s.inventory_item_id = c.inventory_item_id
        LEFT JOIN (
            SELECT inventory_item_id,
                   SUM(COALESCE(change_amount, 0)) FILTER (WHERE created_at >= v_start_ts) AS delta_since_start,
                   SUM(COALESCE(change_amount, 0)) FILTER (WHERE created_at >= v_end_ts)   AS delta_after_end
            FROM stock_update_log
            WHERE merchant_id = p_merchant_id
              AND (p_location_id IS NULL OR location_id = p_location_id)
            GROUP BY inventory_item_id
        ) d ON d.inventory_item_id = c.inventory_item_id
        LEFT JOIN (
            SELECT poi.inventory_item_id,
                   SUM(COALESCE(poi.quantity_received, 0) * COALESCE(poi.unit_cost, 0)) AS purchase_cost
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchase_order_id
            WHERE po.merchant_id = p_merchant_id
              AND COALESCE(po.is_adhoc_expense, FALSE) = FALSE
              AND po.status IN ('received', 'paid')
              AND po.received_at >= v_start_ts
              AND po.received_at <  v_end_ts
              AND (p_location_id IS NULL OR po.location_id = p_location_id)
              AND poi.inventory_item_id IS NOT NULL
            GROUP BY poi.inventory_item_id
        ) p ON p.inventory_item_id = c.inventory_item_id
    ),
    actual_cat AS (
        SELECT category, SUM(actual_cogs) AS actual_cogs
        FROM item_actual
        GROUP BY category
    ),
    waste_cat AS (
        SELECT COALESCE(NULLIF(TRIM(ii.category), ''), 'Uncategorized') AS category,
               SUM(wl.estimated_cost) AS waste_cost
        FROM waste_logs wl
        JOIN inventory_items ii ON ii.id = wl.inventory_item_id
        WHERE wl.merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR wl.location_id = p_location_id)
          AND wl.waste_date >= p_start_date
          AND wl.waste_date <= p_end_date
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
               'category',    cat,
               'theoretical', ROUND(theoretical, 2),
               'actual',      ROUND(actual, 2),
               'variance',    ROUND(actual - theoretical, 2)
           ) ORDER BY (actual - theoretical) DESC)
    INTO v_by_category
    FROM (
        SELECT COALESCE(tc.category, ac.category, wc.category)        AS cat,
               COALESCE(tc.theoretical, 0)                            AS theoretical,
               COALESCE(ac.actual_cogs, 0) - COALESCE(wc.waste_cost, 0) AS actual
        FROM theo_cat tc
        FULL JOIN actual_cat ac ON ac.category = tc.category
        FULL JOIN waste_cat  wc ON wc.category = COALESCE(tc.category, ac.category)
    ) merged
    WHERE theoretical <> 0 OR actual <> 0;

    -- ---- by week ------------------------------------------------------------
    WITH weeks AS (
        SELECT generate_series(
                   date_trunc('week', p_start_date),
                   date_trunc('week', p_end_date),
                   INTERVAL '1 week'
               )::DATE AS week_start
    ),
    theo_week AS (
        SELECT t.week_start, SUM(t.qty_used * c.cost) AS theoretical
        FROM _fc_theo t
        JOIN _fc_costs c ON c.inventory_item_id = t.inventory_item_id
        GROUP BY t.week_start
    ),
    purch_week AS (
        SELECT date_trunc('week', po.received_at)::DATE AS week_start,
               SUM(COALESCE(poi.quantity_received, 0) * COALESCE(poi.unit_cost, 0)) AS purchases
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.purchase_order_id
        WHERE po.merchant_id = p_merchant_id
          AND COALESCE(po.is_adhoc_expense, FALSE) = FALSE
          AND po.status IN ('received', 'paid')
          AND po.received_at >= v_start_ts
          AND po.received_at <  v_end_ts
          AND (p_location_id IS NULL OR po.location_id = p_location_id)
        GROUP BY 1
    ),
    waste_week AS (
        SELECT date_trunc('week', waste_date)::DATE AS week_start,
               SUM(estimated_cost) AS waste_cost
        FROM waste_logs
        WHERE merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
          AND waste_date >= p_start_date
          AND waste_date <= p_end_date
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
               'week_start',  w.week_start,
               'theoretical', ROUND(COALESCE(tw.theoretical, 0), 2),
               'actual',      ROUND(
                   public._inventory_value_at(p_merchant_id, p_location_id, w.week_start::TIMESTAMPTZ)
                   + COALESCE(pw.purchases, 0)
                   - public._inventory_value_at(p_merchant_id, p_location_id, (w.week_start + 7)::TIMESTAMPTZ)
                   - COALESCE(ww.waste_cost, 0), 2)
           ) ORDER BY w.week_start)
    INTO v_by_week
    FROM weeks w
    LEFT JOIN theo_week  tw ON tw.week_start = w.week_start
    LEFT JOIN purch_week pw ON pw.week_start = w.week_start
    LEFT JOIN waste_week ww ON ww.week_start = w.week_start;

    v_result := jsonb_build_object(
        'start_date',       p_start_date,
        'end_date',         p_end_date,
        'theoretical_cost', ROUND(v_theoretical, 2),
        'actual_cost',      ROUND(v_actual, 2),
        'waste_cost',       ROUND(v_waste, 2),
        'variance',         ROUND(v_actual - v_theoretical, 2),
        'variance_percent', CASE WHEN v_theoretical > 0
                                 THEN ROUND((v_actual - v_theoretical) / v_theoretical * 100, 2)
                                 ELSE 0 END,
        'by_category',      COALESCE(v_by_category, '[]'::jsonb),
        'by_week',          COALESCE(v_by_week, '[]'::jsonb)
    );

    DROP TABLE IF EXISTS _fc_costs;
    DROP TABLE IF EXISTS _fc_sold;
    DROP TABLE IF EXISTS _fc_theo;

    RETURN v_result;
END;
$$;
-- ----------------------------------------------------------------------------
-- Grants — match Phase 1 inventory RPC exposure.
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._inventory_value_at(UUID, UUID, TIMESTAMPTZ)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cogs_report(UUID, UUID, DATE, DATE)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_food_cost_analysis(UUID, UUID, DATE, DATE)  TO authenticated, service_role;
