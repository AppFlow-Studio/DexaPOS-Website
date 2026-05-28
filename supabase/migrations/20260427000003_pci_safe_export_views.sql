-- A13: Structural PCI exclusion for export surfaces.
--
-- Rule: every export RPC must SELECT FROM a `pci_safe_<table>` view, never
-- the underlying table. The view is an *allow-list* of columns — adding a
-- new column to the base table does not automatically expose it.
--
-- PCI-sensitive columns (NEVER include in exports / displays / logs):
--   order_payments.card_token            — processor vault token
--   order_payments.card_exp_month        — derivable card data
--   order_payments.card_exp_year         — derivable card data
--   order_payments.processor_response    — raw processor blob; can echo PAN / track2
--   order_payments.terminal_response     — raw terminal blob; same risk
--   order_payments.metadata              — free-form; never trusted for export
--   order_payments.dvpaylite_request_id  — sensitive correlation id
--   order_payments.dejavoo_invoice_number — sensitive correlation id
--
-- Anything below this threshold (`card_last_four`, `card_type`, masked auth
-- codes, totals) is PCI-safe per PCI-DSS 3.2.1 §3.3 (PAN masking).

-- ---------------------------------------------------------------------------
-- 1) Tag PCI-sensitive columns at the schema level. The regression test in
--    20260427000003_pci_safe_regression.sql reads these comments to enforce
--    "no export function may reference a tagged column".
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.order_payments.card_token IS
  '@pci-sensitive Processor vault token. Excluded from pci_safe_order_payments.';
COMMENT ON COLUMN public.order_payments.card_exp_month IS
  '@pci-sensitive Card expiration month. Excluded from pci_safe_order_payments.';
COMMENT ON COLUMN public.order_payments.card_exp_year IS
  '@pci-sensitive Card expiration year. Excluded from pci_safe_order_payments.';
COMMENT ON COLUMN public.order_payments.processor_response IS
  '@pci-sensitive Raw processor response. May contain PAN/track data. Never expose in exports.';
COMMENT ON COLUMN public.order_payments.terminal_response IS
  '@pci-sensitive Raw terminal response. May contain PAN/track data. Never expose in exports.';
COMMENT ON COLUMN public.order_payments.metadata IS
  '@pci-sensitive Free-form metadata. Treat as untrusted for PCI scope.';
COMMENT ON COLUMN public.order_payments.dvpaylite_request_id IS
  '@pci-sensitive DV PayLite request id. Excluded from pci_safe_order_payments.';
COMMENT ON COLUMN public.order_payments.dejavoo_invoice_number IS
  '@pci-sensitive Dejavoo invoice number. Excluded from pci_safe_order_payments.';
COMMENT ON COLUMN public.order_payments.terminal_request IS
  '@pci-sensitive Raw terminal request payload. May contain PAN/track data.';
COMMENT ON COLUMN public.order_payments.emv_data IS
  '@pci-sensitive Raw EMV chip data. PCI scope by definition.';
-- ---------------------------------------------------------------------------
-- 2) The PCI-safe export view for order_payments.
--
--    Scalar entry-mode fields are pre-extracted from processor/terminal
--    response jsonb so consumers never need to touch the raw blob. If a new
--    extraction is needed, add it HERE (and update the regression test
--    allow-list) — never widen by reaching back to the base table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.pci_safe_order_payments AS
SELECT
  op.id,
  op.order_id,
  op.payment_method,
  op.amount,
  op.tip_amount,
  op.total_amount,
  op.status,
  op.terminal_type,
  op.terminal_id,
  op.device_id,
  op.transaction_id,
  op.authorization_code,
  op.reference_number,
  op.card_type,
  op.card_last_four,
  op.dejavoo_transaction_type,
  op.dejavoo_response_code,
  op.dejavoo_response_message,
  op.dejavoo_batch_number,
  op.dvpaylite_application_type,
  op.processor_name,
  op.gateway_fee,
  op.cash_discount_applied,
  op.original_amount,
  op.refunded_amount,
  op.refund_reason,
  op.refunded_at,
  op.refunded_by,
  op.parent_payment_id,
  op.initiated_at,
  op.authorized_at,
  op.captured_at,
  op.failed_at,
  op.voided_at,
  op.processed_by_staff_id,
  op.processed_by_user_id,
  op.error_code,
  op.error_message,
  op.retry_count,
  op.amount_tendered,
  op.change_given,
  op.is_voided,
  op.voided_by,
  op.void_reason,
  op.subtotal_portion,
  op.tax_portion,
  op.discount_portion,
  op.is_cash_priced,
  op.covers_items,
  op.split_portion_index,
  op.split_count,
  op.auth_code,
  op.rrn,
  op.result_code,
  op.result_message,
  op.batch_number,
  op.is_settled,
  op.settled_at,
  op.is_returned,
  op.returned_at,
  op.returned_by,
  op.return_reason,
  op.return_number,
  op.return_reference_id,
  op.return_amount,
  op.return_auth_code,
  op.return_rrn,
  op.tip_adjusted_at,
  op.tip_adjusted_by,
  op.original_tip_amount,
  op.split_index,
  op.split_total,
  op.approved_at,
  op.merchant_id,
  op.location_id,
  -- Pre-extracted entry-mode (the only piece exports need from processor/terminal jsonb).
  COALESCE(
    NULLIF(op.processor_response->>'entry_type', ''),
    NULLIF(op.processor_response->>'entryType', ''),
    NULLIF(op.processor_response->>'entry_mode', ''),
    NULLIF(op.processor_response->>'entryMode', ''),
    NULLIF(op.terminal_response->>'entry_type', ''),
    NULLIF(op.terminal_response->>'entryType', ''),
    NULLIF(op.terminal_response->>'entry_mode', ''),
    NULLIF(op.terminal_response->>'entryMode', '')
  ) AS entry_mode
FROM public.order_payments op;
ALTER VIEW public.pci_safe_order_payments OWNER TO postgres;
COMMENT ON VIEW public.pci_safe_order_payments IS
  'PCI-safe projection of order_payments. Export RPCs MUST SELECT FROM this view, never the base table. See migration 20260427000003 for the exclusion list.';
GRANT SELECT ON public.pci_safe_order_payments TO authenticated, service_role;
-- ---------------------------------------------------------------------------
-- 3) Refactor get_admin_transactions_export to use the view.
-- ---------------------------------------------------------------------------
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
    'initiated_at', 'created_at', 'order_number', 'total_amount',
    'merchant_name', 'location_name', 'customer_name',
    'payment_method', 'payment_status'
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
      op.entry_mode,
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
    FROM public.pci_safe_order_payments op
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
    c.payment_id, c.order_id, c.order_number, c.display_number, c.created_at,
    c.merchant_id, c.merchant_name, c.location_id, c.location_name, c.customer_name,
    c.order_type, c.order_status, c.payment_method, c.card_type, c.card_last_four,
    c.entry_mode, c.authorization_code, c.reference_number, c.batch_number,
    c.subtotal_amount, c.tax_amount, c.tip_amount, c.discount_amount,
    c.service_charge_amount, c.total_amount, c.amount_tendered, c.change_given,
    c.payment_status, c.is_voided, c.void_reason, c.is_returned, c.return_amount,
    c.return_reason, c.staff_name, c.terminal_serial, c.device_id, c.total_count
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
-- ---------------------------------------------------------------------------
-- 4) Registry of export functions. The regression test iterates this.
--    Adding a new export RPC means adding it here AND making sure its source
--    only references pci_safe_* views (never the underlying tables).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pci_export_function_registry (
  function_name text PRIMARY KEY,
  registered_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
INSERT INTO public.pci_export_function_registry (function_name, notes)
VALUES ('get_admin_transactions_export', 'HQ admin transactions export — A13 PCI-safe.')
ON CONFLICT (function_name) DO NOTHING;
COMMENT ON TABLE public.pci_export_function_registry IS
  'Registry of every RPC that produces user-downloadable exports of payment data. Regression test in 20260427000004 verifies each one references only pci_safe_* views.';
