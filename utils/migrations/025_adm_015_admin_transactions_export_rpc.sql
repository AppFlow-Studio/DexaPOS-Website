-- ============================================================================
-- Migration 025: ADM-015 Admin Transactions Export RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_transactions_export(
  p_merchant_ids uuid[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_payment_status text[] DEFAULT NULL,
  p_payment_method text[] DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_card_type text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_sort_by text DEFAULT 'initiated_at',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 10000
)
RETURNS TABLE (
  payment_id uuid,
  order_id uuid,
  order_number text,
  display_number text,
  created_at timestamptz,
  merchant_id uuid,
  merchant_name text,
  location_id uuid,
  location_name text,
  customer_name text,
  order_type text,
  order_status text,
  payment_method text,
  card_type text,
  card_last_four text,
  entry_mode text,
  authorization_code text,
  reference_number text,
  batch_number text,
  subtotal_amount numeric,
  tax_amount numeric,
  tip_amount numeric,
  discount_amount numeric,
  service_charge_amount numeric,
  total_amount numeric,
  amount_tendered numeric,
  change_given numeric,
  payment_status text,
  is_voided boolean,
  void_reason text,
  is_returned boolean,
  return_amount numeric,
  return_reason text,
  staff_name text,
  terminal_serial text,
  device_id text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sort_by text;
  v_sort_dir text;
  v_search text := NULLIF(trim(p_search), '');
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_card_tokens text[];
  v_export_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10000), 1), 10000);
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);

    IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  v_sort_by := lower(COALESCE(p_sort_by, 'initiated_at'));
  IF v_sort_by NOT IN (
    'initiated_at',
    'created_at',
    'order_number',
    'total_amount',
    'merchant_name',
    'location_name',
    'customer_name',
    'payment_method',
    'payment_status'
  ) THEN
    v_sort_by := 'initiated_at';
  END IF;

  v_sort_dir := lower(COALESCE(p_sort_dir, 'desc'));
  IF v_sort_dir NOT IN ('asc', 'desc') THEN
    v_sort_dir := 'desc';
  END IF;

  IF NULLIF(trim(COALESCE(p_card_type, '')), '') IS NOT NULL THEN
    v_card_tokens := ARRAY(
      SELECT trim(token)
      FROM unnest(string_to_array(lower(p_card_type), ',')) AS token
      WHERE trim(token) <> ''
    );
  ELSE
    v_card_tokens := ARRAY[]::text[];
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      op.id AS payment_id,
      op.order_id,
      o.order_number,
      o.display_number,
      COALESCE(op.captured_at, op.initiated_at, o.created_at) AS created_at,
      o.merchant_id,
      m.name AS merchant_name,
      o.location_id,
      l.name AS location_name,
      COALESCE(NULLIF(o.customer_name, ''), 'Walk-in') AS customer_name,
      o.order_type::text AS order_type,
      o.status::text AS order_status,
      op.payment_method::text AS payment_method,
      op.card_type,
      op.card_last_four,
      COALESCE(
        NULLIF(op.processor_response->>'entry_type', ''),
        NULLIF(op.processor_response->>'entryType', ''),
        NULLIF(op.processor_response->>'entry_mode', ''),
        NULLIF(op.processor_response->>'entryMode', ''),
        NULLIF(op.terminal_response->>'entry_type', ''),
        NULLIF(op.terminal_response->>'entryType', ''),
        NULLIF(op.terminal_response->>'entry_mode', ''),
        NULLIF(op.terminal_response->>'entryMode', '')
      ) AS entry_mode,
      op.authorization_code,
      op.reference_number,
      COALESCE(op.batch_number::text, op.dejavoo_batch_number)::text AS batch_number,
      o.subtotal::numeric AS subtotal_amount,
      o.tax_amount::numeric AS tax_amount,
      op.tip_amount::numeric AS tip_amount,
      o.discount_amount::numeric AS discount_amount,
      o.service_charge::numeric AS service_charge_amount,
      op.total_amount::numeric AS total_amount,
      op.amount_tendered::numeric AS amount_tendered,
      op.change_given::numeric AS change_given,
      op.status::text AS payment_status,
      COALESCE(op.is_voided, false) AS is_voided,
      op.void_reason,
      COALESCE(op.is_returned, false) AS is_returned,
      op.return_amount::numeric AS return_amount,
      op.return_reason::text AS return_reason,
      NULLIF(trim(concat_ws(' ', sp.first_name, sp.last_name)), '') AS staff_name,
      COALESCE(pt.serial_number, NULLIF(op.terminal_id, '')) AS terminal_serial,
      COALESCE(NULLIF(op.device_id, ''), NULLIF(o.device_id, '')) AS device_id
    FROM public.order_payments op
    JOIN public.orders o
      ON o.id = op.order_id
    JOIN public.merchants m
      ON m.id = o.merchant_id
    LEFT JOIN public.locations l
      ON l.id = o.location_id
    LEFT JOIN public.staff_profiles sp
      ON sp.id = COALESCE(op.processed_by_staff_id, o.created_by_staff_id)
    LEFT JOIN LATERAL (
      SELECT pt_inner.*
      FROM public.payment_terminals pt_inner
      WHERE pt_inner.location_id = COALESCE(op.location_id, o.location_id)
        AND (
          op.terminal_id IS NULL
          OR pt_inner.serial_number = op.terminal_id
          OR pt_inner.tpn = op.terminal_id
          OR pt_inner.id::text = op.terminal_id
        )
      ORDER BY
        CASE
          WHEN op.terminal_id IS NOT NULL AND pt_inner.serial_number = op.terminal_id THEN 0
          WHEN op.terminal_id IS NOT NULL AND pt_inner.tpn = op.terminal_id THEN 1
          WHEN op.terminal_id IS NOT NULL AND pt_inner.id::text = op.terminal_id THEN 2
          ELSE 3
        END,
        pt_inner.updated_at DESC
      LIMIT 1
    ) pt ON true
    WHERE o.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND (p_status IS NULL OR o.status::text = ANY (p_status))
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
      AND (p_payment_method IS NULL OR op.payment_method::text = ANY (p_payment_method))
      AND (p_date_from IS NULL OR COALESCE(op.captured_at, op.initiated_at, o.created_at) >= p_date_from)
      AND (p_date_to IS NULL OR COALESCE(op.captured_at, op.initiated_at, o.created_at) <= p_date_to)
      AND (p_min_amount IS NULL OR op.total_amount >= p_min_amount)
      AND (p_max_amount IS NULL OR op.total_amount <= p_max_amount)
      AND (
        p_staff_id IS NULL
        OR op.processed_by_staff_id = p_staff_id
        OR o.created_by_staff_id = p_staff_id
      )
      AND (
        COALESCE(array_length(v_card_tokens, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(v_card_tokens) AS token
          WHERE lower(COALESCE(op.card_type, '')) LIKE '%' || token || '%'
        )
      )
      AND (
        v_search IS NULL
        OR COALESCE(o.order_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.display_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.customer_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.card_last_four, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.authorization_code, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.reference_number, '') ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT f.*, COUNT(*) OVER() AS total_count
    FROM filtered f
  )
  SELECT
    c.payment_id,
    c.order_id,
    c.order_number,
    c.display_number,
    c.created_at,
    c.merchant_id,
    c.merchant_name,
    c.location_id,
    c.location_name,
    c.customer_name,
    c.order_type,
    c.order_status,
    c.payment_method,
    c.card_type,
    c.card_last_four,
    c.entry_mode,
    c.authorization_code,
    c.reference_number,
    c.batch_number,
    c.subtotal_amount,
    c.tax_amount,
    c.tip_amount,
    c.discount_amount,
    c.service_charge_amount,
    c.total_amount,
    c.amount_tendered,
    c.change_given,
    c.payment_status,
    c.is_voided,
    c.void_reason,
    c.is_returned,
    c.return_amount,
    c.return_reason,
    c.staff_name,
    c.terminal_serial,
    c.device_id,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_sort_by = 'order_number'   AND v_sort_dir = 'asc'  THEN c.order_number END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'order_number'   AND v_sort_dir = 'desc' THEN c.order_number END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'total_amount'   AND v_sort_dir = 'asc'  THEN c.total_amount END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'total_amount'   AND v_sort_dir = 'desc' THEN c.total_amount END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'merchant_name'  AND v_sort_dir = 'asc'  THEN c.merchant_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'merchant_name'  AND v_sort_dir = 'desc' THEN c.merchant_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'location_name'  AND v_sort_dir = 'asc'  THEN c.location_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'location_name'  AND v_sort_dir = 'desc' THEN c.location_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'customer_name'  AND v_sort_dir = 'asc'  THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'customer_name'  AND v_sort_dir = 'desc' THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_method' AND v_sort_dir = 'asc'  THEN c.payment_method END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_method' AND v_sort_dir = 'desc' THEN c.payment_method END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_status' AND v_sort_dir = 'asc'  THEN c.payment_status END ASC NULLS LAST,
    CASE WHEN v_sort_by = 'payment_status' AND v_sort_dir = 'desc' THEN c.payment_status END DESC NULLS LAST,
    CASE WHEN v_sort_by IN ('initiated_at', 'created_at') AND v_sort_dir = 'asc'  THEN c.created_at END ASC NULLS LAST,
    CASE WHEN v_sort_by IN ('initiated_at', 'created_at') AND v_sort_dir = 'desc' THEN c.created_at END DESC NULLS LAST,
    c.created_at DESC
  LIMIT v_export_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_transactions_export(
  uuid[], uuid[], text[], text[], text[], timestamptz, timestamptz,
  numeric, numeric, text, text, uuid, text, text, integer
) TO authenticated;

COMMENT ON FUNCTION public.get_admin_transactions_export(
  uuid[], uuid[], text[], text[], text[], timestamptz, timestamptz,
  numeric, numeric, text, text, uuid, text, text, integer
)
IS 'HQ admin export query for transactions with assignment-scoped merchant intersection and a hard 10,000-row cap.';
