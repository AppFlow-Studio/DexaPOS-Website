-- ============================================================================
-- get_previous_orders_page_v1 — server-owned Previous Orders page
-- ============================================================================
-- Ticket: [POS-PERF] AUD-9 (Audit §9)
--   https://app.notion.com/p/3a88280c1b1d8148b69bee999480fb7e
-- Plan:   docs/features/orders/PLAN-2026-08-09-AUD-9-PREVIOUS-ORDERS-KEYSET-RPC.md
--
-- Replaces OrderService.getFilteredHistoryPage (tablet repo,
-- services/orderService.ts:1375) — a PostgREST call that selects the full
-- order object graph and pages with .range() (OFFSET).
--
-- What changes:
--   1. Payload: summary fields only. The old select is
--      `*, order_items(*), order_payments(*), order_discounts(*)` plus three
--      joins — the whole graph for 50 orders to draw 50 rows. Detail still
--      loads on open via get_order_details.
--   2. Paging: keyset instead of OFFSET, so page cost is flat at depth.
--   3. One round trip: the page and its exact total come back together,
--      replacing the parallel `count: exact, head: true` query.
--
-- What deliberately does NOT change: the filter, sort and exclusion semantics
-- are a faithful port of services/historyOrderFilters.ts (buildHistoryOrderQuery).
-- That module is the specification for this function's WHERE clause. Its tests
-- live at __tests__/historyOrderFilters.test.ts. If the two ever disagree, the
-- TypeScript is authoritative until this RPC is the only path.
--
-- READ-ONLY. STABLE. Creates no triggers and modifies no existing object.
-- Inert on deploy — nothing calls it until the tablet client cuts over.
--
-- ---------------------------------------------------------------------------
-- ASSUMPTIONS / DECISIONS
-- ---------------------------------------------------------------------------
-- A1. Business day resolves via get_business_day_bounds(location, start, end),
--     i.e. from `business_day_start_hour`.
--     CONFIRMED against production: usePreviousOrdersStore resolves bounds with
--     this same RPC as "Strategy 1: Server RPC (authoritative)" and only falls
--     back to client-side Luxon when it fails. Accepts a start AND end date
--     because the screen's date window is a range, not a single day.
--
-- A2. There is NO fixed history status set. The old base query applies no
--     status filter at all — history is everything in the window, minus empty
--     drafts. Status is a USER-FACING filter (all/paid/unpaid/refunded/voided)
--     expressed over payment_status + status. An earlier draft of this function
--     hardcoded five terminal statuses; that would have hidden rows the screen
--     shows today (e.g. a paid takeout still at status='ready').
--
-- A3. Returns a jsonb envelope {rows, next_cursor, has_more, total_count}.
--     total_count is required — the UI's tab counts and "N of M" pager depend
--     on an exact total, which has_more cannot provide.
--
-- A4. Authorization guards on user_location_ids(), matching get_active_orders_v1.
--
-- A5. Sort is one of four modes and the cursor is sort-dependent. Note the
--     tiebreaker is `id ASC` in every mode, including the DESC sorts — so the
--     keyset predicate is a mixed-direction comparison and CANNOT be written as
--     a simple row-wise (a,b) < (x,y). See the per-sort branches below.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_previous_orders_page_v1(
  p_location_id uuid,
  p_start_date  date    DEFAULT NULL,
  p_end_date    date    DEFAULT NULL,
  p_channel     text    DEFAULT 'all',
  p_status      text    DEFAULT 'all',
  p_provider    text    DEFAULT 'all',
  p_search      text    DEFAULT NULL,
  p_sort        text    DEFAULT 'date_desc',
  p_cursor      jsonb   DEFAULT NULL,
  p_limit       int     DEFAULT 50,
  p_with_count  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Mirrors lib/orderSource.ts ONLINE_ORDER_SOURCES. Note 'kiosk' is NOT
  -- online, and legacy 'online' is retained alongside canonical 'online_store'.
  c_online_sources CONSTANT text[] := ARRAY['online', 'orderout', 'online_store'];

  -- Mirrors PROVIDER_PLATFORM_TOKENS. Casing varies by ingestion path, so the
  -- comparison is done on lower(delivery_platform) against lowered tokens
  -- rather than by listing every spelling.
  c_marketplace_tokens CONSTANT text[] := ARRAY[
    'doordash', 'door_dash', 'ubereats', 'uber_eats', 'uber eats',
    'grubhub', 'grub_hub'
  ];

  v_bounds       RECORD;
  v_limit        int;
  v_sort         text;
  v_search       text;
  v_provider_tok text[];
  v_cursor_ts    timestamptz;
  v_cursor_amt   numeric;
  v_cursor_id    uuid;
  v_rows         jsonb;
  v_row_count    int;
  v_has_more     boolean;
  v_next_cursor  jsonb;
  v_total        int;
  v_last         jsonb;
BEGIN
  -- A4: SECURITY DEFINER bypasses RLS, so the tenant check lives here.
  IF NOT (p_location_id = ANY (user_location_ids())) THEN
    RAISE EXCEPTION 'Location access denied' USING ERRCODE = '42501';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_sort  := coalesce(nullif(trim(p_sort), ''), 'date_desc');

  IF v_sort NOT IN ('date_desc', 'date_asc', 'amount_desc', 'amount_asc') THEN
    RAISE EXCEPTION 'Unknown sort: %', p_sort USING ERRCODE = '22023';
  END IF;

  -- A1: business-day bounds, server-side, over the window's date range.
  SELECT * INTO v_bounds
    FROM get_business_day_bounds(p_location_id, p_start_date, p_end_date);

  -- Search term. LIKE metacharacters are escaped so a literal % or _ typed by
  -- a cashier matches itself. Mirrors escapeSearchTerm().
  v_search := nullif(trim(coalesce(p_search, '')), '');
  IF v_search IS NOT NULL THEN
    v_search := '%' || replace(replace(v_search, '%', '\%'), '_', '\_') || '%';
  END IF;

  -- Provider tokens for the marketplace case. 'house' and 'all' are handled in
  -- the predicate, not here.
  v_provider_tok := CASE lower(coalesce(p_provider, 'all'))
    WHEN 'doordash' THEN ARRAY['doordash', 'door_dash']
    WHEN 'ubereats' THEN ARRAY['ubereats', 'uber_eats', 'uber eats']
    WHEN 'grubhub'  THEN ARRAY['grubhub', 'grub_hub']
    ELSE NULL
  END;

  -- Keyset anchor. Which fields matter depends on the sort (A5).
  IF p_cursor IS NOT NULL THEN
    v_cursor_id := (p_cursor ->> 'id')::uuid;
    IF v_sort IN ('date_desc', 'date_asc') THEN
      v_cursor_ts := (p_cursor ->> 'created_at')::timestamptz;
    ELSE
      v_cursor_amt := (p_cursor ->> 'total_amount')::numeric;
    END IF;

    IF v_cursor_id IS NULL
       OR (v_sort IN ('date_desc', 'date_asc') AND v_cursor_ts IS NULL)
       OR (v_sort IN ('amount_desc', 'amount_asc') AND v_cursor_amt IS NULL)
    THEN
      RAISE EXCEPTION 'Malformed cursor for sort %: got %', v_sort, p_cursor
        USING ERRCODE = '22P02';
    END IF;
  END IF;

  -- ── Shared row set ────────────────────────────────────────────────────────
  -- One CTE carrying every filter, reused by both the page and the count so the
  -- "N of M" a merchant reads can never disagree with the rows underneath it —
  -- the same invariant historyOrderFilters.ts was written to guarantee.
  WITH scoped AS (
    SELECT o.*
      FROM public.orders o
     WHERE o.location_id = p_location_id
       AND o.created_at >= v_bounds.start_ts
       AND o.created_at <  v_bounds.end_ts

       -- ── Channel ──────────────────────────────────────────────────────────
       -- The four tabs partition the window, so the non-online tabs explicitly
       -- exclude online sources; that is what makes the counts sum to All.
       AND (
         p_channel IS NULL OR p_channel = 'all'
         OR (p_channel = 'online'
             AND lower(o.order_source) = ANY (c_online_sources))
         OR (p_channel = 'dine_in'
             AND o.order_type::text = ANY (ARRAY['dine_in', 'qr_dine_in'])
             AND NOT (lower(o.order_source) = ANY (c_online_sources)))
         OR (p_channel = 'takeout'
             AND o.order_type::text = 'takeout'
             AND NOT (lower(o.order_source) = ANY (c_online_sources)))
         OR (p_channel = 'delivery'
             AND o.order_type::text = 'delivery'
             AND NOT (lower(o.order_source) = ANY (c_online_sources)))
       )

       -- ── Provider (Online tab only) ───────────────────────────────────────
       -- House = an online order with no marketplace on it. NULL must be kept
       -- explicitly: a NULL delivery_platform does not satisfy NOT IN.
       AND (
         p_channel <> 'online' OR p_provider IS NULL OR p_provider = 'all'
         OR (v_provider_tok IS NOT NULL
             AND lower(o.delivery_platform) = ANY (v_provider_tok))
         OR (lower(coalesce(p_provider, '')) = 'house'
             AND (o.delivery_platform IS NULL
                  OR NOT (lower(o.delivery_platform) = ANY (c_marketplace_tokens))))
       )

       -- ── Status ───────────────────────────────────────────────────────────
       -- A2: a user-facing filter, not a fixed history set.
       AND (
         p_status IS NULL OR p_status = 'all'
         OR (p_status = 'paid'
             AND o.payment_status::text = 'paid' AND o.status::text <> 'void')
         OR (p_status = 'unpaid'
             AND o.payment_status::text <> 'paid' AND o.status::text <> 'void')
         OR (p_status = 'refunded'
             AND (o.status::text = 'refunded' OR o.payment_status::text = 'refunded'))
         OR (p_status = 'voided' AND o.status::text = 'void')
       )

       -- ── Search ───────────────────────────────────────────────────────────
       AND (
         v_search IS NULL
         OR o.display_number    ILIKE v_search
         OR o.order_number      ILIKE v_search
         OR o.customer_name     ILIKE v_search
         OR o.customer_phone    ILIKE v_search
         OR o.delivery_platform ILIKE v_search
       )

       -- ── Empty-draft exclusion ────────────────────────────────────────────
       -- Server-side mirror of isEmptyDraftOrder(). Unconditional, and applied
       -- to page and count alike: when this lived client-side only, the exact
       -- count included drafts the client then dropped, so the pager read
       -- "1-4 of 6" over 4 rows. total_amount <> 0 does not match NULL, which
       -- is correct — a draft with no totals yet is still a draft.
       AND (
         o.total_amount     <> 0
         OR o.subtotal        <> 0
         OR o.discount_amount <> 0
         OR o.completed_at IS NOT NULL
         OR o.payment_status::text = 'paid'
         OR o.status::text IN ('void', 'refunded')
       )
  ),
  -- Keyset. A5: the tiebreaker is id ASC even under DESC sorts, so this is a
  -- mixed-direction comparison and cannot collapse to a row-wise (a,b) < (x,y).
  page AS (
    SELECT s.*
      FROM scoped s
     WHERE p_cursor IS NULL
        OR CASE v_sort
             WHEN 'date_desc' THEN
               (s.created_at < v_cursor_ts)
               OR (s.created_at = v_cursor_ts AND s.id > v_cursor_id)
             WHEN 'date_asc' THEN
               (s.created_at > v_cursor_ts)
               OR (s.created_at = v_cursor_ts AND s.id > v_cursor_id)
             WHEN 'amount_desc' THEN
               (s.total_amount < v_cursor_amt)
               OR (s.total_amount = v_cursor_amt AND s.id > v_cursor_id)
             WHEN 'amount_asc' THEN
               (s.total_amount > v_cursor_amt)
               OR (s.total_amount = v_cursor_amt AND s.id > v_cursor_id)
           END
     ORDER BY
       CASE WHEN v_sort = 'date_desc'   THEN s.created_at   END DESC,
       CASE WHEN v_sort = 'date_asc'    THEN s.created_at   END ASC,
       CASE WHEN v_sort = 'amount_desc' THEN s.total_amount END DESC,
       CASE WHEN v_sort = 'amount_asc'  THEN s.total_amount END ASC,
       s.id ASC
     -- +1 probe: a page of exactly v_limit rows is indistinguishable from the
     -- last page without it.
     LIMIT v_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(x.r ORDER BY x.rn), '[]'::jsonb),
    CASE WHEN p_with_count THEN (SELECT count(*)::int FROM scoped) ELSE NULL END
    INTO v_rows, v_total
    FROM (
      SELECT
        row_number() OVER () AS rn,
        jsonb_build_object(
          'id',                    p.id,
          'order_number',          p.order_number,
          'display_number',        p.display_number,
          -- Microsecond-precise, UTC. The cursor round-trips through this
          -- string, so dropping precision here would duplicate or skip rows
          -- at page boundaries.
          'created_at',            to_char(p.created_at AT TIME ZONE 'UTC',
                                           'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'completed_at',          p.completed_at,
          'status',                p.status,
          -- Passed through underived: an open bug is mid-repair on this column
          -- (docs/features/orders/BUG-void-order-payment-status-clobbers-
          -- collected-payment.md). Deriving here would add a third
          -- disagreeing implementation.
          'payment_status',        p.payment_status,
          'check_status',          p.check_status,
          'order_type',            p.order_type,
          'order_source',          p.order_source,
          'table_number',          p.table_number,
          'customer_name',         p.customer_name,
          'customer_phone',        p.customer_phone,
          'platform_order_number', p.platform_order_number,
          'delivery_platform',     p.delivery_platform,
          -- Dual pricing: total_amount and effective_* mirror the CARD track
          -- even on cash-paid orders. Lane columns ship alongside so the client
          -- resolves the charged lane with getOrderBreakdown(). total_amount is
          -- required as the fallback — the client's pick() returns 0 when every
          -- candidate is null, so omitting it renders legacy rows as $0.00
          -- rather than failing.
          'total_amount',          p.total_amount,
          'card_total',            p.card_total,
          'cash_total',            p.cash_total,
          'payment_pricing_mode',  p.payment_pricing_mode,
          'amount_paid',           p.amount_paid,
          'tip_amount',            p.tip_amount,
          -- Parity with the old embed's three joins.
          'station_name',          st.station_name,
          'created_by_staff',      CASE
                                     WHEN sp.id IS NOT NULL THEN
                                       jsonb_build_object('first_name', sp.first_name,
                                                          'last_name',  sp.last_name)
                                     ELSE NULL
                                   END,
          'online_order',          CASE
                                     WHEN oo.order_id IS NOT NULL THEN
                                       jsonb_build_object('provider',         oo.provider,
                                                          'delivery_company', oo.delivery_company)
                                     ELSE NULL
                                   END
        ) AS r
        FROM page p
        LEFT JOIN public.stations       st ON st.id = p.station_id
        LEFT JOIN public.staff_profiles sp ON sp.id = p.created_by_staff_id
        LEFT JOIN LATERAL (
          SELECT o2.order_id, o2.provider, o2.delivery_company
            FROM public.online_orders o2
           WHERE o2.order_id = p.id
           LIMIT 1
        ) oo ON true
    ) x;

  v_row_count := jsonb_array_length(v_rows);
  v_has_more  := v_row_count > v_limit;

  -- Drop the probe row.
  IF v_has_more THEN
    v_rows := (
      SELECT COALESCE(jsonb_agg(elem ORDER BY idx), '[]'::jsonb)
        FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS t(elem, idx)
       WHERE idx <= v_limit
    );
    v_row_count := v_limit;
  END IF;

  -- Cursor is built from the last row actually returned, keyed to the active
  -- sort, and is NULL at the end of the list so the client has an unambiguous
  -- stop condition.
  IF v_has_more AND v_row_count > 0 THEN
    v_last := v_rows -> (v_row_count - 1);
    IF v_sort IN ('date_desc', 'date_asc') THEN
      v_next_cursor := jsonb_build_object(
        'created_at', v_last ->> 'created_at',
        'id',         v_last ->> 'id'
      );
    ELSE
      v_next_cursor := jsonb_build_object(
        'total_amount', v_last ->> 'total_amount',
        'id',           v_last ->> 'id'
      );
    END IF;
  ELSE
    v_next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object(
    'rows',        v_rows,
    'next_cursor', v_next_cursor,
    'has_more',    v_has_more,
    'total_count', v_total
  );
END;
$$;

COMMENT ON FUNCTION public.get_previous_orders_page_v1(uuid, date, date, text, text, text, text, text, jsonb, int, boolean) IS
  'AUD-9: server-owned Previous Orders page. Filter/sort/exclusion semantics port '
  'services/historyOrderFilters.ts (tablet repo). Returns '
  '{rows, next_cursor, has_more, total_count}. Summary fields only — detail loads '
  'on open via get_order_details.';

GRANT EXECUTE ON FUNCTION public.get_previous_orders_page_v1(uuid, date, date, text, text, text, text, text, jsonb, int, boolean)
  TO authenticated;
