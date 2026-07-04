-- ============================================================================
-- Backfill: correct order_source + platform columns on existing online orders
-- ----------------------------------------------------------------------------
-- Split out of 20260702120000 (the process_online_order function fix) ON PURPOSE:
-- these UPDATEs touch `orders`, which has the deferred constraint trigger
-- enforce_order_math() (20260501000006). A pre-existing payment-inconsistent row
-- (e.g. payment_status='paid' with amount_paid=0 — abandoned $0 test orders) raises
-- P0005 the moment it's touched and aborts the whole statement. If the backfill were
-- bundled with the CREATE OR REPLACE FUNCTION, that abort would ALSO roll back the
-- function fix — which is exactly what happened on first apply. Keeping the forward
-- RPC fix in its own migration guarantees new orders are tagged correctly even if
-- this data backfill needs iteration.
--
-- Both statements are idempotent (WHERE predicates make re-runs no-ops) and SKIP any
-- row that currently violates the payment-math invariant, so they never trip the
-- trigger. Skipped rows keep their stale order_source until their payment data is
-- repaired separately; the RPC fix already tags all *new* orders correctly.
-- ============================================================================

-- OrderOut aggregator orders (mis-tagged 'online', platform fields NULL).
UPDATE public.orders o
SET order_source          = 'orderout',
    delivery_platform     = COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
    platform_order_number = COALESCE(o.platform_order_number, o.metadata->>'provider_order_id')
WHERE (o.metadata->>'provider' = 'orderout' OR o.external_id LIKE 'orderout:%')
  AND o.order_source IS DISTINCT FROM 'orderout'
  AND NOT (
    (o.payment_status = 'paid'    AND COALESCE(o.amount_paid, 0) <= 0.01) OR
    (o.payment_status = 'paid'    AND COALESCE(o.amount_due, 0)  > 0.01)  OR
    (o.payment_status = 'pending' AND COALESCE(o.amount_paid, 0) > 0.01)  OR
    COALESCE(o.amount_paid, 0) < -0.01 OR COALESCE(o.amount_due, 0) < -0.01
  );

-- First-party storefront/app orders currently mis-tagged 'online'.
UPDATE public.orders o
SET order_source = 'online_store'
WHERE o.order_source = 'online'
  AND (o.metadata->>'provider' IN ('website', 'app') OR o.external_id LIKE 'website:%')
  AND NOT (
    (o.payment_status = 'paid'    AND COALESCE(o.amount_paid, 0) <= 0.01) OR
    (o.payment_status = 'paid'    AND COALESCE(o.amount_due, 0)  > 0.01)  OR
    (o.payment_status = 'pending' AND COALESCE(o.amount_paid, 0) > 0.01)  OR
    COALESCE(o.amount_paid, 0) < -0.01 OR COALESCE(o.amount_due, 0) < -0.01
  );

-- Index supporting Channel + Platform filtering on the Orders list.
CREATE INDEX IF NOT EXISTS idx_orders_source_platform
  ON public.orders (merchant_id, location_id, order_source, delivery_platform);
