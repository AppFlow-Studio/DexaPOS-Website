-- ============================================================================
-- get_previous_orders_page_v1 — keyset-paginated Previous Orders summaries
-- ============================================================================
-- Ticket: [POS-PERF] AUD-9 (Audit §9)
--   https://app.notion.com/p/3a88280c1b1d8148b69bee999480fb7e
-- Plan:   docs/features/orders/PLAN-2026-08-09-AUD-9-PREVIOUS-ORDERS-KEYSET-RPC.md
--
-- Replaces the client-side business-day resolution + wide per-order payload
-- behind Previous Orders. Three changes vs. the path this supersedes:
--   1. Business-day bounds resolved server-side (timezone-correct, one source).
--   2. Compact summaries only — no items, no payments, no discounts. Detail
--      still loads on open via get_order_details.
--   3. Keyset cursor instead of OFFSET: constant cost per page at any scroll
--      depth, and immune to rows shifting under an active scroll.
--
-- READ-ONLY. STABLE. Creates no triggers and modifies no existing object.
-- Inert on deploy — nothing calls it until the tablet client cuts over.
--
-- ---------------------------------------------------------------------------
-- ASSUMPTIONS (locked 2026-08-10; confirm with Ali Dika / Ali Jaffal)
-- ---------------------------------------------------------------------------
-- A1. Business day resolves from `locations.business_day_start_hour`, via the
--     existing get_business_day_bounds() helper.
--     Rationale: `business_day_end_hour` is read by exactly three functions,
--     all tips/labor (calculate_tip_distribution_v2, rebuild_employee_daily_tips,
--     declare_cash_tips_for_shift). Every ORDER/REPORTING surface — including
--     get_business_day_summary_v1 and get_business_day_activity_summary_v1 —
--     resolves the day through get_business_day_bounds(), i.e. start_hour.
--     Previous Orders is an order surface and must agree with those reports.
--     NOTE: the two columns are duplicate spellings of one setting and disagree
--     whenever a location sets one and not the other. Reconciling them is a
--     separate ticket; see plan §3.3.
--
-- A2. History status set = completed, cancelled, void, refunded, declined.
--     Terminal statuses only. `declined` is included because it is terminal and
--     is exactly what the Online-orders channel filter is used to find;
--     `accepted` is excluded because it is still in flight.
--     Must stay in sync with the index predicate in the companion migration
--     20260810120100_idx_orders_history_keyset.sql.
--
-- A3. Return shape is a jsonb envelope {rows, next_cursor, has_more}. The
--     sibling get_active_orders_v1 returns SETOF json, but that feed has no
--     pagination and therefore nowhere to put a stop signal. useInfiniteQuery's
--     getNextPageParam needs one, or every list fires a trailing empty request.
--
-- A4. Authorization guards on user_location_ids(), matching get_active_orders_v1.
--     get_order_details documents a stricter permission check; that asymmetry
--     pre-exists this ticket and is deliberately not resolved here (plan §5.7).
--
-- A5. Single business day per call. If the screen offers a date range or a
--     search box, this signature is short a parameter — open question, plan §5.6.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_previous_orders_page_v1(
  p_location_id   uuid,
  p_business_date date              DEFAULT NULL,
  p_order_type    public.order_type DEFAULT NULL,
  p_order_source  text              DEFAULT NULL,
  p_cursor        jsonb             DEFAULT NULL,
  p_limit         int               DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- A2: terminal statuses only. Keep in sync with idx_orders_history_keyset.
  v_history_statuses public.order_status[] := ARRAY[
    'completed', 'cancelled', 'void', 'refunded', 'declined'
  ]::public.order_status[];

  v_bounds        RECORD;
  v_limit         int;
  v_source        text;
  v_cursor_ts     timestamptz;
  v_cursor_id     uuid;
  v_rows          jsonb;
  v_row_count     int;
  v_has_more      boolean;
  v_next_cursor   jsonb;
BEGIN
  -- A4: location membership guard. SECURITY DEFINER bypasses RLS, so the
  -- tenant check has to live here.
  IF NOT (p_location_id = ANY (user_location_ids())) THEN
    RAISE EXCEPTION 'Location access denied' USING ERRCODE = '42501';
  END IF;

  -- Clamp: AUD-9 specifies 50; the Apr-6 client ticket says 100. Named here so
  -- the client is not guessing, and so a hostile p_limit cannot fan out.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  -- A1: business-day bounds, server-side. NULL p_business_date => current
  -- business day, resolved by the helper against the location's timezone.
  SELECT * INTO v_bounds
    FROM get_business_day_bounds(p_location_id, p_business_date);

  -- Channel filter. normalize_order_source() maps legacy spellings
  -- ('online' -> 'online_store', 'phone'/'in_store' -> 'pos').
  --
  -- CRITICAL: normalize_order_source(NULL) returns 'pos', NOT NULL, because of
  -- its ELSE COALESCE(..., 'pos') branch. Normalizing before the NULL check
  -- would silently filter ALL history to POS orders whenever no channel filter
  -- is supplied. The NULL check must come first — hence the explicit IF.
  IF p_order_source IS NULL THEN
    v_source := NULL;
  ELSE
    v_source := public.normalize_order_source(p_order_source);
  END IF;

  -- Keyset anchor. Parsed here so the format stays symmetric with the
  -- next_cursor emitted below (microsecond-precise ISO-8601, UTC).
  IF p_cursor IS NOT NULL THEN
    v_cursor_ts := (p_cursor ->> 'created_at')::timestamptz;
    v_cursor_id := (p_cursor ->> 'id')::uuid;

    IF v_cursor_ts IS NULL OR v_cursor_id IS NULL THEN
      RAISE EXCEPTION 'Malformed cursor: expected {created_at, id}, got %', p_cursor
        USING ERRCODE = '22P02';
    END IF;
  END IF;

  -- Fetch v_limit + 1 to derive has_more. Counting rows = v_limit cannot
  -- distinguish "exactly a full page" from "a full page with more behind it".
  -- Aggregation orders by the real columns, not by the emitted text. Ordering
  -- on the ISO string would happen to work (zero-padded UTC sorts
  -- lexicographically), but it is a silent dependency on the encoding and would
  -- break the moment the format changes.
  SELECT COALESCE(jsonb_agg(page.r ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        o.created_at,
        o.id,
        jsonb_build_object(
               'id',                    o.id,
               'order_number',          o.order_number,
               'display_number',        o.display_number,
               'created_at',            to_char(o.created_at AT TIME ZONE 'UTC',
                                                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
               'status',                o.status,
               -- Passed through underived. An open bug is mid-repair on this
               -- column (docs/features/orders/BUG-void-order-payment-status-
               -- clobbers-collected-payment.md); deriving here would create a
               -- third disagreeing implementation.
               'payment_status',        o.payment_status,
               'order_type',            o.order_type,
               'order_source',          o.order_source,
               'table_number',          o.table_number,
               'customer_name',         o.customer_name,
               -- Platform identity: the number the customer and the delivery
               -- platform actually quote. Without it a channel-filtered history
               -- shows only the internal order number.
               'platform_order_number', o.platform_order_number,
               'delivery_platform',     o.delivery_platform,
               -- Dual-pricing money. effective_*/total_amount mirror the CARD
               -- track even on cash-paid orders, so the lane columns ship
               -- alongside and the client resolves the charged lane with
               -- getOrderBreakdown(). total_amount is required as the fallback
               -- for legacy rows with null lane columns — omitting it makes
               -- those rows render $0.00 rather than fail.
               'card_total',            o.card_total,
               'cash_total',            o.cash_total,
               'payment_pricing_mode',  o.payment_pricing_mode,
               'total_amount',          o.total_amount
             ) AS r
        FROM public.orders o
       WHERE o.location_id = p_location_id
         AND o.status = ANY (v_history_statuses)
         AND o.created_at >= v_bounds.start_ts
         AND o.created_at <  v_bounds.end_ts
         AND (p_order_type IS NULL OR o.order_type   = p_order_type)
         AND (v_source     IS NULL OR o.order_source = v_source)
         AND (p_cursor IS NULL
              OR (o.created_at, o.id) < (v_cursor_ts, v_cursor_id))
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT v_limit + 1
    ) page;

  v_row_count := jsonb_array_length(v_rows);
  v_has_more  := v_row_count > v_limit;

  -- Drop the probe row before returning.
  IF v_has_more THEN
    v_rows := (
      SELECT COALESCE(jsonb_agg(elem ORDER BY idx), '[]'::jsonb)
        FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, idx)
       WHERE idx <= v_limit
    );
    v_row_count := v_limit;
  END IF;

  -- Cursor points at the last row actually returned. Null when the list ends,
  -- so the client has an unambiguous stop condition.
  IF v_has_more AND v_row_count > 0 THEN
    v_next_cursor := jsonb_build_object(
      'created_at', v_rows -> (v_row_count - 1) ->> 'created_at',
      'id',         v_rows -> (v_row_count - 1) ->> 'id'
    );
  ELSE
    v_next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object(
    'rows',        v_rows,
    'next_cursor', v_next_cursor,
    'has_more',    v_has_more
  );
END;
$$;

COMMENT ON FUNCTION public.get_previous_orders_page_v1(uuid, date, public.order_type, text, jsonb, int) IS
  'AUD-9: keyset-paginated Previous Orders summaries. Business-day bounds resolved '
  'server-side from business_day_start_hour. Returns {rows, next_cursor, has_more}. '
  'Summary fields only — detail loads on open via get_order_details.';

GRANT EXECUTE ON FUNCTION public.get_previous_orders_page_v1(uuid, date, public.order_type, text, jsonb, int)
  TO authenticated;
