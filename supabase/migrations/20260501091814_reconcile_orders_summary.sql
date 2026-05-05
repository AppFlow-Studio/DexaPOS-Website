-- =====================================================================
-- Migration: reconcile_orders_summary — lightweight bulk drift-check RPC
-- =====================================================================
-- New function. Backs the bulk path in
-- `services/orderHeaderReconcile.ts::reconcileAllActiveOrdersHeader`
-- in the Dexa-POS app, replacing a fan-out of `get_order_details` calls
-- (one per order, ~3-10KB payload each, 8 correlated subqueries) with a
-- single bulk summary call (~60 bytes/row).
--
-- Returns just the drift indicators the reconcile loop needs:
--   - sync_version       → primary signal (server bumps on every mutation)
--   - updated_at         → fallback signal when sync_version is null on
--                          either side
--   - status / payment_status / check_status → catches drift the version
--     guard misses (e.g., denormalized fields updated by a trigger that
--     didn't bump sync_version)
--
-- Reconcile-side logic compares each row to local state; only orders that
-- actually drifted incur a full `get_order_details` round trip. For 100
-- active orders with no drift, this is 1 RPC instead of 100.
--
-- Access control: same merchant/location guard pattern as
-- `get_order_details` — RLS effectively enforced via `user_merchant_id()`
-- and `user_location_ids()`.
--
-- Source: Dexa-POS app — Wave 2 of the get_order_details fan-out fix.
-- Rollback: 20260501091814_reconcile_orders_summary_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reconcile_orders_summary(p_order_ids uuid[])
RETURNS TABLE (
  id uuid,
  updated_at timestamptz,
  sync_version integer,
  status text,
  payment_status text,
  check_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    o.id,
    o.updated_at,
    o.sync_version,
    o.status::text,
    o.payment_status::text,
    o.check_status
  FROM public.orders o
  WHERE o.id = ANY(p_order_ids)
    AND o.merchant_id = public.user_merchant_id()
    AND o.location_id = ANY(public.user_location_ids());
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_orders_summary(uuid[]) TO authenticated;
