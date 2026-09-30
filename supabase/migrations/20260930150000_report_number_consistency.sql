-- Report number consistency: one calculation behind every report page.
--
-- Plan & evidence: docs/features/reporting/PLAN-2026-09-30-REPORT-NUMBER-CONSISTENCY.md
--
-- Before this migration every report page computed revenue, refunds, tax and
-- order counts with its own query, and the pages disagreed (same merchant,
-- same period): revenue $12,612 vs $13,630 vs $71,213, refunds $6.58 vs $38.74
-- vs $21.58, AOV built on a different basis than revenue, cash orders reported
-- at the card price, and discounts subtracted twice (bare `subtotal` is already
-- post-discount on discounted orders).
--
-- This migration adds ONE definition of the money and makes the report RPCs
-- read from it:
--
--   is_order_sale()        which orders are sales (refunded orders stay in —
--                          their refunds are subtracted on their own line)
--   report_order_money()   an order's money on the lane it was actually
--                          charged on (card / cash / mixed)
--   report_sale_orders()   one row per sale order in a window
--   report_refunds()       one row per refund in a window (dated by refunded_at)
--   report_item_sales()    order money allocated to its item lines
--   get_sales_report()     the grouped aggregate every page reads
--
-- Rewritten on top of it (signatures and JSON shapes unchanged, fields added):
--   get_financial_kpis, get_sales_by_item_report_v2, get_voids_report
--
-- Nothing is dropped. `is_order_reportable` (both overloads) is left as-is for
-- the HQ/operational callers this change does not migrate; the 3-arg overload
-- is committed here verbatim because it existed only in the live database.

-- ---------------------------------------------------------------------------
-- 0. Commit the live-only 3-arg is_order_reportable (no behaviour change).
--    Callers: get_platform_gmv_by_day, get_avg_ticket_by_day,
--    get_avg_time_to_first_order, get_sales_by_item_report (v1, unused by app).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_order_reportable(
  p_order_status text,
  p_payment_status text,
  p_total_amount numeric DEFAULT NULL::numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(p_order_status, '') NOT IN ('draft', 'cancelled', 'void')
    AND COALESCE(p_payment_status, '') IN (
      'paid',
      'captured',
      'partial',
      'partially_refunded',
      'refunded'
    )
    AND COALESCE(p_total_amount, 0) >= 0
$function$;

-- ---------------------------------------------------------------------------
-- 1. Which orders are sales.
--    Paid (in full) orders, including ones later refunded. Open checks,
--    part-paid checks, drafts, cancellations, voids and declines are not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_order_sale(
  p_status public.order_status,
  p_payment_status public.payment_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT p_status NOT IN ('draft', 'cancelled', 'void', 'declined')
     AND p_payment_status IN ('paid', 'captured', 'partially_refunded', 'refunded');
$function$;

COMMENT ON FUNCTION public.is_order_sale(public.order_status, public.payment_status) IS
  'Reporting: an order counts as a sale when paid in full (refunded orders included; refunds are netted separately). Mirror: lib/reporting/recognized-order.ts isOrderSale.';

-- ---------------------------------------------------------------------------
-- 2. An order's money on the lane it was charged on.
--
--    Lane: from the tenders actually taken (cash tender = is_cash_priced or
--    payment_method 'cash'); both kinds -> 'mixed'; no tender -> the order's
--    payment_pricing_mode; else 'card'. Same rule as resolveChargedLane() in
--    lib/orders/pricing-lane.ts, except refunded tenders still identify the lane.
--
--    gross    = the lane's subtotal (pre-discount: card_subtotal / cash_subtotal)
--    net      = what was charged before tax, service charge and tip:
--               lane total - lane tax - service charge, never above gross.
--               Mixed tenders use amount_paid (card ladder, discounted blend
--               collected), as getOrderBreakdown() does.
--    discount = gross - net (so every order foots by construction)
--    collected= net + tax + service charge + tip (what the customer paid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_order_money(o public.orders)
RETURNS TABLE (
  lane text,
  gross numeric,
  discount numeric,
  net numeric,
  tax numeric,
  service_charge numeric,
  tip numeric,
  collected numeric
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH tender AS (
    SELECT
      bool_or(p.is_cash_priced IS TRUE OR p.payment_method = 'cash') AS has_cash,
      bool_or(NOT (p.is_cash_priced IS TRUE OR p.payment_method = 'cash')) AS has_card
    FROM public.order_payments p
    WHERE p.order_id = o.id
      AND p.status IN ('captured', 'paid', 'partially_refunded', 'refunded')
  ),
  l AS (
    SELECT CASE
      WHEN t.has_cash AND t.has_card THEN 'mixed'
      WHEN t.has_cash THEN 'cash'
      WHEN t.has_card THEN 'card'
      ELSE COALESCE(o.payment_pricing_mode::text, 'card')
    END AS lane
    FROM tender t
  ),
  v AS (
    SELECT
      l.lane,
      CASE WHEN l.lane = 'cash' THEN COALESCE(o.cash_subtotal, o.subtotal, 0)
           ELSE COALESCE(o.card_subtotal, o.subtotal, 0) END AS gross,
      CASE WHEN l.lane = 'cash' THEN COALESCE(o.cash_tax_amount, o.tax_amount, 0)
           ELSE COALESCE(o.card_tax_amount, o.tax_amount, 0) END AS tax,
      COALESCE(o.service_charge, 0) AS service_charge,
      COALESCE(o.tip_amount, 0) AS tip,
      CASE
        WHEN l.lane = 'cash' THEN COALESCE(o.cash_total, o.total_amount, 0)
        WHEN l.lane = 'mixed' AND COALESCE(o.amount_paid, 0) > 0
          THEN o.amount_paid - COALESCE(o.tip_amount, 0)
        ELSE COALESCE(o.card_total, o.total_amount, 0)
      END AS charged_ex_tip
    FROM l
  ),
  n AS (
    SELECT v.*,
      LEAST(v.gross, GREATEST(0, v.charged_ex_tip - v.tax - v.service_charge)) AS net
    FROM v
  )
  SELECT
    n.lane,
    round(n.gross, 2),
    round(n.gross - n.net, 2),
    round(n.net, 2),
    round(n.tax, 2),
    round(n.service_charge, 2),
    round(n.tip, 2),
    round(n.net + n.tax + n.service_charge + n.tip, 2)
  FROM n;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Sale orders in a window (created_at, half-open), one row each.
--    p_location_ids NULL = every location of the merchant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sale_orders(
  p_merchant_id uuid,
  p_location_ids uuid[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  order_id uuid,
  location_id uuid,
  order_type text,
  order_source text,
  local_ts timestamp,
  lane text,
  gross numeric,
  discount numeric,
  net numeric,
  tax numeric,
  service_charge numeric,
  tip numeric,
  collected numeric
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT
    o.id,
    o.location_id,
    o.order_type::text,
    public.normalize_order_source(o.order_source),
    o.created_at AT TIME ZONE COALESCE(loc.timezone, 'America/New_York'),
    m.lane, m.gross, m.discount, m.net, m.tax, m.service_charge, m.tip, m.collected
  FROM public.orders o
  LEFT JOIN public.locations loc ON loc.id = o.location_id
  CROSS JOIN LATERAL public.report_order_money(o) m
  WHERE o.merchant_id = p_merchant_id
    AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
    AND o.created_at >= p_start
    AND o.created_at < p_end
    AND public.is_order_sale(o.status, o.payment_status);
$function$;

-- ---------------------------------------------------------------------------
-- 4. Refunds in a window, dated by when the money went back (refunded_at).
--    Only refunds on sale orders: a voided order was never in gross, so its
--    refund must not be subtracted either (it nets to zero).
--    The refunded amount is split into sales / tax / service charge / tip in
--    the proportions the order was collected; the sales portion is the
--    remainder so the parts always add up to the amount returned.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_refunds(
  p_merchant_id uuid,
  p_location_ids uuid[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  payment_id uuid,
  order_id uuid,
  order_number text,
  location_id uuid,
  order_type text,
  order_source text,
  local_ts timestamp,
  refunded_at timestamptz,
  amount numeric,
  sales numeric,
  tax numeric,
  service_charge numeric,
  tip numeric,
  reason text,
  staff_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH r AS (
    SELECT
      op.id AS payment_id,
      o.id AS order_id,
      o.order_number,
      o.location_id,
      o.order_type::text AS order_type,
      public.normalize_order_source(o.order_source) AS order_source,
      op.refunded_at AT TIME ZONE COALESCE(loc.timezone, 'America/New_York') AS local_ts,
      op.refunded_at,
      op.refunded_amount AS amount,
      CASE WHEN m.collected > 0 THEN op.refunded_amount / m.collected ELSE 0 END AS ratio,
      m.tax AS o_tax, m.service_charge AS o_svc, m.tip AS o_tip,
      COALESCE(NULLIF(op.refund_reason, ''), rev.reason_code) AS reason,
      COALESCE(op.refunded_by, rev.initiated_by) AS staff_id
    FROM public.order_payments op
    JOIN public.orders o ON o.id = op.order_id
    LEFT JOIN public.locations loc ON loc.id = o.location_id
    CROSS JOIN LATERAL public.report_order_money(o) m
    LEFT JOIN LATERAL (
      SELECT rv.reason_code::text AS reason_code, rv.initiated_by
      FROM public.reversals rv
      WHERE rv.original_payment_id = op.id AND rv.status = 'completed'
      ORDER BY rv.requested_at DESC
      LIMIT 1
    ) rev ON true
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND op.refunded_amount > 0
      AND op.refunded_at >= p_start
      AND op.refunded_at < p_end
      AND public.is_order_sale(o.status, o.payment_status)
  ),
  s AS (
    SELECT r.*,
      round(r.o_tax * r.ratio, 2) AS tax_part,
      round(r.o_svc * r.ratio, 2) AS svc_part,
      round(r.o_tip * r.ratio, 2) AS tip_part
    FROM r
  )
  SELECT
    s.payment_id, s.order_id, s.order_number, s.location_id, s.order_type,
    s.order_source, s.local_ts, s.refunded_at, s.amount,
    s.amount - s.tax_part - s.svc_part - s.tip_part,
    s.tax_part, s.svc_part, s.tip_part,
    s.reason, s.staff_id
  FROM s;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Item sales: each sale order's money allocated to its (non-voided) lines
--    in proportion to the line amounts, so item totals add up exactly to the
--    order totals. Refunds are allocated the same way, dated by refund.
--    Orders with no item lines appear once with item_name NULL so nothing
--    is silently lost.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_item_sales(
  p_merchant_id uuid,
  p_location_ids uuid[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  order_id uuid,
  order_source text,
  item_name text,
  category_name text,
  quantity numeric,
  gross numeric,
  discount numeric,
  refunds numeric,
  net numeric
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH so AS (
    SELECT * FROM public.report_sale_orders(p_merchant_id, p_location_ids, p_start, p_end)
  ),
  rf AS (
    SELECT * FROM public.report_refunds(p_merchant_id, p_location_ids, p_start, p_end)
  ),
  lines AS (
    SELECT
      oi.order_id,
      oi.item_name,
      oi.category_name,
      GREATEST(COALESCE(oi.quantity, 0) - COALESCE(oi.refunded_quantity, 0), 0) AS quantity,
      GREATEST(COALESCE(oi.pre_discount_subtotal, oi.subtotal, 0), 0) AS weight,
      COALESCE(oi.quantity, 0) AS raw_qty
    FROM public.order_items oi
    WHERE COALESCE(oi.is_voided, false) = false
      AND oi.order_id IN (SELECT so.order_id FROM so UNION SELECT rf.order_id FROM rf)
  ),
  shares AS (
    SELECT
      l.*,
      CASE
        WHEN SUM(l.weight) OVER w > 0 THEN l.weight / SUM(l.weight) OVER w
        WHEN SUM(l.raw_qty) OVER w > 0 THEN l.raw_qty::numeric / SUM(l.raw_qty) OVER w
        ELSE 1.0 / COUNT(*) OVER w
      END AS share
    FROM lines l
    WINDOW w AS (PARTITION BY l.order_id)
  ),
  sale AS (
    SELECT
      so.order_id, so.order_source,
      sh.item_name, sh.category_name,
      COALESCE(sh.quantity, 0) AS quantity,
      so.gross * COALESCE(sh.share, 1) AS gross,
      so.discount * COALESCE(sh.share, 1) AS discount,
      0::numeric AS refunds
    FROM so
    LEFT JOIN shares sh ON sh.order_id = so.order_id
  ),
  refund AS (
    SELECT
      rf.order_id, rf.order_source,
      sh.item_name, sh.category_name,
      0::numeric AS quantity,
      0::numeric AS gross,
      0::numeric AS discount,
      rf.sales * COALESCE(sh.share, 1) AS refunds
    FROM rf
    LEFT JOIN shares sh ON sh.order_id = rf.order_id
  )
  SELECT
    x.order_id, x.order_source, x.item_name, x.category_name, x.quantity,
    x.gross, x.discount, x.refunds, x.gross - x.discount - x.refunds
  FROM (SELECT * FROM sale UNION ALL SELECT * FROM refund) x;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Access guard shared by the report RPCs (same rule as the existing
--    get_sales_by_item_report_v2 guard).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_report_access(
  p_merchant_id uuid,
  p_location_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  IF p_merchant_id IS DISTINCT FROM public.user_merchant_id() THEN
    RAISE EXCEPTION 'Access denied: merchant not in user scope';
  END IF;

  IF p_location_ids IS NOT NULL
     AND NOT (p_location_ids <@ public.user_location_ids()) THEN
    RAISE EXCEPTION 'Access denied: location not in user scope';
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. The one aggregate every report page reads.
--
--    p_group_by: total | day | hour | order_type | source | day_source |
--                location | location_day | location_hour | location_dow_hour
--    Sales are bucketed by when the order was placed, refunds by when the
--    money went back — both in the location's timezone.
--
--    net_sales = gross_sales - discounts - refunds   (foots on every row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_merchant_id uuid,
  p_location_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_group_by text DEFAULT 'total'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  g text := COALESCE(p_group_by, 'total');
BEGIN
  IF g NOT IN ('total', 'day', 'hour', 'order_type', 'source', 'day_source',
               'location', 'location_day', 'location_hour', 'location_dow_hour') THEN
    RAISE EXCEPTION 'Invalid p_group_by: %', p_group_by USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_report_access(p_merchant_id, p_location_ids);

  RETURN (
    WITH events AS (
      SELECT so.location_id, so.order_type, so.order_source, so.local_ts,
             so.gross, so.discount, 0::numeric AS refunds,
             so.tax, 0::numeric AS tax_refunded,
             so.service_charge, so.tip, so.collected,
             0::numeric AS refunds_total,
             1 AS order_count, 0 AS refund_count
      FROM public.report_sale_orders(p_merchant_id, p_location_ids, p_start, p_end) so
      UNION ALL
      SELECT rf.location_id, rf.order_type, rf.order_source, rf.local_ts,
             0, 0, rf.sales,
             0, rf.tax,
             0, 0, 0,
             rf.amount,
             0, 1
      FROM public.report_refunds(p_merchant_id, p_location_ids, p_start, p_end) rf
    ),
    keyed AS (
      SELECT e.*,
        CASE WHEN g IN ('day', 'day_source', 'location_day') THEN e.local_ts::date END AS k_day,
        CASE WHEN g IN ('hour', 'location_hour', 'location_dow_hour')
             THEN extract(hour FROM e.local_ts)::int END AS k_hour,
        CASE WHEN g = 'location_dow_hour' THEN extract(isodow FROM e.local_ts)::int END AS k_dow,
        CASE WHEN g IN ('location', 'location_day', 'location_hour', 'location_dow_hour')
             THEN e.location_id END AS k_location,
        CASE WHEN g = 'order_type' THEN e.order_type END AS k_order_type,
        CASE WHEN g IN ('source', 'day_source') THEN e.order_source END AS k_source
      FROM events e
    ),
    agg AS (
      SELECT
        k_day, k_hour, k_dow, k_location, k_order_type, k_source,
        round(SUM(gross), 2) AS gross_sales,
        round(SUM(discount), 2) AS discounts,
        round(SUM(refunds), 2) AS refunds,
        round(SUM(gross) - SUM(discount) - SUM(refunds), 2) AS net_sales,
        round(SUM(tax), 2) AS tax,
        round(SUM(tax_refunded), 2) AS tax_refunded,
        round(SUM(service_charge), 2) AS service_charge,
        round(SUM(tip), 2) AS tips,
        round(SUM(collected), 2) AS collected,
        round(SUM(refunds_total), 2) AS refunds_total,
        SUM(order_count)::int AS order_count,
        SUM(refund_count)::int AS refund_count
      FROM keyed
      GROUP BY k_day, k_hour, k_dow, k_location, k_order_type, k_source
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'day', a.k_day::text,
        'hour', a.k_hour,
        'dow', a.k_dow,
        'location_id', a.k_location,
        'order_type', a.k_order_type,
        'source', a.k_source
      )) || jsonb_build_object(
        'gross_sales', a.gross_sales,
        'discounts', a.discounts,
        'refunds', a.refunds,
        'net_sales', a.net_sales,
        'tax', a.tax,
        'tax_refunded', a.tax_refunded,
        'service_charge', a.service_charge,
        'tips', a.tips,
        'collected', a.collected,
        'refunds_total', a.refunds_total,
        'order_count', a.order_count,
        'refund_count', a.refund_count,
        'avg_order_value', CASE WHEN a.order_count > 0
                                THEN round((a.gross_sales - a.discounts - a.refunds) / a.order_count, 2)
                                ELSE 0 END
      )
      ORDER BY a.k_location NULLS FIRST, a.k_day NULLS FIRST, a.k_dow NULLS FIRST,
               a.k_hour NULLS FIRST, a.k_order_type NULLS FIRST, a.k_source NULLS FIRST
    ), '[]'::jsonb)
    FROM agg a
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. get_financial_kpis — same signature and JSON shape, now built on the
--    shared definitions. Added summary fields: service_charge_total,
--    refunds_money_total, tax_refunded. `refunds_total` is the sales portion
--    of refunds so that gross - discounts - refunds = net.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_kpis(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_locs uuid[] := CASE WHEN p_location_id IS NULL THEN NULL ELSE ARRAY[p_location_id] END;
  v_total jsonb;
  v_summary json;
  v_payment_methods json;
  v_daily_stats json;
  v_best_sellers json;
  v_order_types json;
BEGIN
  v_total := COALESCE(
    public.get_sales_report(p_merchant_id, v_locs, p_start_date, p_end_date, 'total') -> 0,
    '{}'::jsonb
  );

  v_summary := json_build_object(
    'gross_sales',          COALESCE((v_total ->> 'gross_sales')::numeric, 0),
    'discounts_total',      COALESCE((v_total ->> 'discounts')::numeric, 0),
    'refunds_total',        COALESCE((v_total ->> 'refunds')::numeric, 0),
    'net_sales',            COALESCE((v_total ->> 'net_sales')::numeric, 0),
    'tax_total',            COALESCE((v_total ->> 'tax')::numeric, 0),
    'tax_refunded',         COALESCE((v_total ->> 'tax_refunded')::numeric, 0),
    'service_charge_total', COALESCE((v_total ->> 'service_charge')::numeric, 0),
    'tip_total',            COALESCE((v_total ->> 'tips')::numeric, 0),
    'refunds_money_total',  COALESCE((v_total ->> 'refunds_total')::numeric, 0),
    'order_count',          COALESCE((v_total ->> 'order_count')::int, 0),
    'avg_order_value',      COALESCE((v_total ->> 'avg_order_value')::numeric, 0),
    'paid_in_total',        COALESCE((v_total ->> 'collected')::numeric, 0)
  );

  -- Tender mix is a payments view, not a sales view: unchanged.
  SELECT COALESCE(json_agg(pm), '[]'::json) INTO v_payment_methods
  FROM (
    SELECT op.payment_method AS method, SUM(op.amount) AS amount, COUNT(*) AS count
    FROM order_payments op
    JOIN orders o ON o.id = op.order_id
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND op.status IN ('captured', 'authorized')
      AND o.created_at >= p_start_date
      AND o.created_at < p_end_date
    GROUP BY op.payment_method
  ) pm;

  SELECT COALESCE(json_agg(json_build_object(
           'date', d ->> 'day',
           'net_sales', (d ->> 'net_sales')::numeric,
           'gross_sales', (d ->> 'gross_sales')::numeric,
           'discounts', (d ->> 'discounts')::numeric,
           'refunds', (d ->> 'refunds')::numeric,
           'tax', (d ->> 'tax')::numeric,
           'service_charge', (d ->> 'service_charge')::numeric,
           'tips', (d ->> 'tips')::numeric,
           'order_count', (d ->> 'order_count')::int,
           'guest_count', (d ->> 'order_count')::int
         ) ORDER BY d ->> 'day'), '[]'::json)
  INTO v_daily_stats
  FROM jsonb_array_elements(
    public.get_sales_report(p_merchant_id, v_locs, p_start_date, p_end_date, 'day')
  ) d;

  SELECT COALESCE(json_agg(bs ORDER BY bs.revenue DESC), '[]'::json) INTO v_best_sellers
  FROM (
    SELECT i.item_name, round(SUM(i.quantity), 2) AS quantity, round(SUM(i.net), 2) AS revenue
    FROM public.report_item_sales(p_merchant_id, v_locs, p_start_date, p_end_date) i
    WHERE i.item_name IS NOT NULL
    GROUP BY i.item_name
    ORDER BY revenue DESC
    LIMIT 10
  ) bs;

  SELECT COALESCE(json_agg(json_build_object(
           'type', t ->> 'order_type',
           'count', (t ->> 'order_count')::int,
           'revenue', (t ->> 'net_sales')::numeric
         )), '[]'::json)
  INTO v_order_types
  FROM jsonb_array_elements(
    public.get_sales_report(p_merchant_id, v_locs, p_start_date, p_end_date, 'order_type')
  ) t
  WHERE (t ->> 'order_count')::int > 0;

  RETURN json_build_object(
    'summary',         v_summary,
    'payment_methods', v_payment_methods,
    'daily_stats',     v_daily_stats,
    'best_sellers',    v_best_sellers,
    'order_types',     v_order_types
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. get_sales_by_item_report_v2 — same signature, guard and bare-array shape.
--    Now reads report_item_sales, so its totals equal get_financial_kpis.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sales_by_item_report_v2(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_order_source text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_locs uuid[] := CASE WHEN p_location_id IS NULL THEN NULL ELSE ARRAY[p_location_id] END;
  v_filter_source text := CASE
    WHEN p_order_source IS NULL THEN NULL
    ELSE public.normalize_order_source(p_order_source)
  END;
BEGIN
  IF v_filter_source IS NOT NULL
     AND v_filter_source NOT IN ('pos', 'kiosk', 'online_store', 'orderout') THEN
    RAISE EXCEPTION 'Invalid order_source filter: %', p_order_source
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_report_access(p_merchant_id, v_locs);

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'item_name', COALESCE(item_name, 'No item detail'),
          'category', COALESCE(category_name, 'Uncategorized'),
          'quantity_sold', total_qty,
          'gross_sales', gross_sales,
          'discounts', discounts,
          'refunds', refunds,
          'net_sales', net_sales
        )
        ORDER BY net_sales DESC
      ),
      '[]'::jsonb
    )
    FROM (
      -- Largest-remainder rounding: each money column is rounded to cents so
      -- that the rows add up exactly to the rounded total (per-row round()
      -- drifted a cent from Sales Overview).
      SELECT
        g.item_name,
        g.category_name,
        g.total_qty,
        round(g.gross_floor + CASE WHEN g.gross_rank <= g.gross_short THEN 0.01 ELSE 0 END, 2) AS gross_sales,
        round(g.disc_floor + CASE WHEN g.disc_rank <= g.disc_short THEN 0.01 ELSE 0 END, 2) AS discounts,
        round(g.ref_floor + CASE WHEN g.ref_rank <= g.ref_short THEN 0.01 ELSE 0 END, 2) AS refunds,
        round(g.net_floor + CASE WHEN g.net_rank <= g.net_short THEN 0.01 ELSE 0 END, 2) AS net_sales
      FROM (
        SELECT
          r.*,
          floor(r.gross * 100) / 100 AS gross_floor,
          round(SUM(r.gross) OVER () * 100) - SUM(floor(r.gross * 100)) OVER () AS gross_short,
          row_number() OVER (ORDER BY r.gross * 100 - floor(r.gross * 100) DESC, r.item_name, r.category_name) AS gross_rank,
          floor(r.discount * 100) / 100 AS disc_floor,
          round(SUM(r.discount) OVER () * 100) - SUM(floor(r.discount * 100)) OVER () AS disc_short,
          row_number() OVER (ORDER BY r.discount * 100 - floor(r.discount * 100) DESC, r.item_name, r.category_name) AS disc_rank,
          floor(r.refunds * 100) / 100 AS ref_floor,
          round(SUM(r.refunds) OVER () * 100) - SUM(floor(r.refunds * 100)) OVER () AS ref_short,
          row_number() OVER (ORDER BY r.refunds * 100 - floor(r.refunds * 100) DESC, r.item_name, r.category_name) AS ref_rank,
          floor(r.net * 100) / 100 AS net_floor,
          round(SUM(r.net) OVER () * 100) - SUM(floor(r.net * 100)) OVER () AS net_short,
          row_number() OVER (ORDER BY r.net * 100 - floor(r.net * 100) DESC, r.item_name, r.category_name) AS net_rank
        FROM (
          SELECT
            i.item_name,
            i.category_name,
            round(SUM(i.quantity), 2) AS total_qty,
            SUM(i.gross) AS gross,
            SUM(i.discount) AS discount,
            SUM(i.refunds) AS refunds,
            SUM(i.net) AS net
          FROM public.report_item_sales(p_merchant_id, v_locs, p_start_date, p_end_date) i
          WHERE v_filter_source IS NULL OR i.order_source = v_filter_source
          GROUP BY i.item_name, i.category_name
        ) r
      ) g
    ) stats
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10. get_voids_report — same shape.
--     voids:   line amount on the order's charged lane (was unit_price*qty,
--              which ignored modifiers, sizes and the cash price). Lines voided
--              as part of a refund on a sale order are left out: that money is
--              already in `refunds`.
--     refunds: exactly the rows get_sales_report subtracts (report_refunds),
--              with reason / staff falling back to the reversal record.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_voids_report(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_locs uuid[] := CASE WHEN p_location_id IS NULL THEN NULL ELSE ARRAY[p_location_id] END;
BEGIN
  PERFORM public.assert_report_access(p_merchant_id, v_locs);

  RETURN json_build_object(
    'voids', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'item_name', oi.item_name,
          'quantity', oi.quantity,
          'amount', CASE WHEN m.lane = 'cash'
                         THEN round(COALESCE(oi.cash_subtotal, oi.subtotal, oi.unit_price * oi.quantity), 2)
                         ELSE round(COALESCE(oi.subtotal, oi.unit_price * oi.quantity), 2) END,
          'reason', oi.void_reason,
          'voided_at', oi.voided_at,
          'voided_by', NULLIF(trim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
          'order_number', o.order_number,
          'order_id', o.id
        ) ORDER BY oi.voided_at DESC
      ), '[]'::json)
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      CROSS JOIN LATERAL public.report_order_money(o) m
      LEFT JOIN staff_profiles sp ON sp.id = oi.voided_by
      WHERE o.merchant_id = p_merchant_id
        AND (p_location_id IS NULL OR o.location_id = p_location_id)
        AND oi.is_voided = true
        AND oi.voided_at >= p_start_date
        AND oi.voided_at < p_end_date
        AND NOT (
          public.is_order_sale(o.status, o.payment_status)
          AND COALESCE(oi.void_reason, '') ILIKE 'refunded%'
        )
    ),
    'refunds', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'order_number', rf.order_number,
          'order_id', rf.order_id,
          'amount', rf.amount,
          'sales_amount', rf.sales,
          'reason', rf.reason,
          'refunded_at', rf.refunded_at,
          'refunded_by', NULLIF(trim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), '')
        ) ORDER BY rf.refunded_at DESC
      ), '[]'::json)
      FROM public.report_refunds(p_merchant_id, v_locs, p_start_date, p_end_date) rf
      LEFT JOIN staff_profiles sp ON sp.id = rf.staff_id
    )
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants. Internal building blocks are not callable directly by clients
-- (the SECURITY DEFINER report RPCs call them); the report RPCs are callable
-- by signed-in users only and enforce assert_report_access.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.report_order_money(public.orders) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sale_orders(uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_refunds(uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_item_sales(uuid, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_report_access(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_order_money(public.orders) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_sale_orders(uuid, uuid[], timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_refunds(uuid, uuid[], timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_item_sales(uuid, uuid[], timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_report_access(uuid, uuid[]) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_order_sale(public.order_status, public.payment_status) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_sales_report(uuid, uuid[], timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_report(uuid, uuid[], timestamptz, timestamptz, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_financial_kpis(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_kpis(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_voids_report(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_voids_report(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;
