-- ============================================================================
-- Platform Transactions Flat View
-- ============================================================================
-- Purpose:
--   Enables global search/filtering across payment + order + merchant fields
--   from a single relation for PostgREST queries.
-- ============================================================================

DROP VIEW IF EXISTS public.vw_platform_transactions;

CREATE OR REPLACE VIEW public.vw_platform_transactions
WITH (security_invoker = true)
AS
SELECT
  op.id,
  op.order_id,
  op.payment_method,
  op.amount,
  op.tip_amount,
  op.total_amount,
  op.status,
  op.card_type,
  op.card_last_four,
  op.authorization_code,
  op.reference_number,
  o.merchant_id,
  o.location_id,
  COALESCE(NULLIF(o.order_number, ''), o.display_number) AS order_number,
  o.customer_name,
  o.status AS order_status,
  m.name AS merchant_name,
  l.name AS location_name,
  COALESCE(op.captured_at, op.initiated_at, o.created_at) AS created_at
FROM public.order_payments op
JOIN public.orders o ON o.id = op.order_id
JOIN public.merchants m ON m.id = o.merchant_id
LEFT JOIN public.locations l ON l.id = o.location_id;

GRANT SELECT ON public.vw_platform_transactions TO authenticated;
