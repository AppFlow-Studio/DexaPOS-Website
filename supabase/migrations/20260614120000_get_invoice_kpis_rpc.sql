-- get_invoice_kpis(p_merchant_id, p_location_id) — DB-authoritative dashboard
-- KPIs for the merchant Invoices page (§4). Replaces the old client-side
-- summation that mis-counted partials, used updated_at as a paid-date proxy, and
-- showed Overdue=0 (nothing ever sets status='overdue').
--
-- SECURITY DEFINER + pinned search_path (mirrors get_public_invoice). The arg is
-- explicit, so we guard inside the function: only the owning merchant's admins or
-- a Dexa HQ admin may aggregate a given merchant's invoices.
--
-- Overdue is DERIVED at read time (no persisted status, no sweep): an invoice is
-- overdue when its effective due date has passed AND it still owes a balance.
-- Effective due date by payment_due_type, using coalesce(sent_at, created_at) as
-- the issue date for net terms.

CREATE OR REPLACE FUNCTION public.get_invoice_kpis(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (is_merchant_admin(p_merchant_id) OR is_dexapos_admin()) THEN
    RAISE EXCEPTION 'not authorized to read invoice KPIs for this merchant';
  END IF;

  WITH scoped AS (
    SELECT
      inv.status,
      inv.total_amount,
      inv.amount_paid,
      inv.paid_at,
      GREATEST(inv.total_amount - inv.amount_paid, 0)            AS balance,
      CASE inv.payment_due_type
        WHEN 'upon_receipt' THEN COALESCE(inv.sent_at, inv.created_at)
        WHEN 'net_15'       THEN COALESCE(inv.sent_at, inv.created_at) + INTERVAL '15 days'
        WHEN 'net_30'       THEN COALESCE(inv.sent_at, inv.created_at) + INTERVAL '30 days'
        WHEN 'net_60'       THEN COALESCE(inv.sent_at, inv.created_at) + INTERVAL '60 days'
        WHEN 'custom'       THEN inv.due_date::timestamptz
        ELSE NULL
      END                                                        AS effective_due
    FROM public.invoices inv
    WHERE inv.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
  )
  SELECT jsonb_build_object(
    'outstanding', COALESCE(SUM(balance)
      FILTER (WHERE status IN ('sent', 'viewed', 'overdue', 'payment_failed')), 0),
    'paid_this_month', COALESCE(SUM(amount_paid)
      FILTER (WHERE paid_at IS NOT NULL
                AND date_trunc('month', paid_at) = date_trunc('month', now())), 0),
    'overdue_count', COALESCE(COUNT(*)
      FILTER (WHERE status NOT IN ('paid', 'cancelled', 'draft')
                AND balance > 0
                AND effective_due IS NOT NULL
                AND effective_due < now()), 0),
    'overdue_amount', COALESCE(SUM(balance)
      FILTER (WHERE status NOT IN ('paid', 'cancelled', 'draft')
                AND balance > 0
                AND effective_due IS NOT NULL
                AND effective_due < now()), 0),
    'draft_count', COALESCE(COUNT(*) FILTER (WHERE status = 'draft'), 0)
  )
  INTO v_result
  FROM scoped;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_kpis(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_kpis(uuid, uuid) TO authenticated;
