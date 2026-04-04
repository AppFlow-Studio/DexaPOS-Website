-- ============================================================================
-- Migration 022: ADM-002 Admin RLS Scoping for Orders and Payments
-- ============================================================================
-- Adds assignment-scoped HQ read access without changing merchant-side write paths.
-- Uses existing admin_merchant_access table for merchant assignments.

-- ---------------------------------------------------------------------------
-- Helper: assigned merchant IDs for current HQ admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_merchant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH admin_ctx AS (
    SELECT
      public.current_user_id() AS user_id,
      public.is_dexapos_admin() AS is_admin,
      EXISTS (
        SELECT 1
        FROM public.get_my_hq_role() r
        WHERE r.role_code = 'hq.super_admin'
      ) AS is_super_admin
  )
  SELECT m.id
  FROM public.merchants m
  CROSS JOIN admin_ctx c
  WHERE c.is_admin = true
    AND c.is_super_admin = true

  UNION

  SELECT ama.merchant_id
  FROM public.admin_merchant_access ama
  CROSS JOIN admin_ctx c
  WHERE c.is_admin = true
    AND c.is_super_admin = false
    AND ama.admin_user_id = c.user_id
    AND ama.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_merchant_ids() TO authenticated;

COMMENT ON FUNCTION public.get_admin_merchant_ids()
IS 'Returns merchant IDs the current HQ admin can access; hq.super_admin gets all merchants.';

-- ---------------------------------------------------------------------------
-- Performance indexes for policy predicates and sort paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id
  ON public.orders(merchant_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_order_id
  ON public.order_payments(order_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_payments'
      AND column_name = 'merchant_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_order_payments_merchant_id ON public.order_payments(merchant_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_order_payments_merchant_initiated_at ON public.order_payments(merchant_id, initiated_at DESC)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_payments'
      AND column_name = 'merchant_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_payments'
      AND column_name = 'location_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_order_payments_merchant_location_initiated_at ON public.order_payments(merchant_id, location_id, initiated_at DESC)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_payment_items_order_payment_id
  ON public.order_payment_items(order_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id
  ON public.payment_events(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_id
  ON public.payment_events(order_id);

CREATE INDEX IF NOT EXISTS idx_admin_merchant_access_active_lookup
  ON public.admin_merchant_access(admin_user_id, merchant_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Enable RLS on admin-relevant payment/order tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Additive admin SELECT policies (read-only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hq_admin_select_orders ON public.orders;
CREATE POLICY hq_admin_select_orders
  ON public.orders
  FOR SELECT
  USING (
    public.is_dexapos_admin()
    AND merchant_id IN (SELECT public.get_admin_merchant_ids())
  );

DROP POLICY IF EXISTS hq_admin_select_order_payments ON public.order_payments;
CREATE POLICY hq_admin_select_order_payments
  ON public.order_payments
  FOR SELECT
  USING (
    public.is_dexapos_admin()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.merchant_id IN (SELECT public.get_admin_merchant_ids())
    )
  );

DROP POLICY IF EXISTS hq_admin_select_order_items ON public.order_items;
CREATE POLICY hq_admin_select_order_items
  ON public.order_items
  FOR SELECT
  USING (
    public.is_dexapos_admin()
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id IN (SELECT public.get_admin_merchant_ids())
    )
  );

DROP POLICY IF EXISTS hq_admin_select_order_payment_items ON public.order_payment_items;
CREATE POLICY hq_admin_select_order_payment_items
  ON public.order_payment_items
  FOR SELECT
  USING (
    public.is_dexapos_admin()
    AND EXISTS (
      SELECT 1
      FROM public.order_payments op
      JOIN public.orders o ON o.id = op.order_id
      WHERE op.id = order_payment_items.order_payment_id
        AND o.merchant_id IN (SELECT public.get_admin_merchant_ids())
    )
  );

DROP POLICY IF EXISTS hq_admin_select_payment_events ON public.payment_events;
CREATE POLICY hq_admin_select_payment_events
  ON public.payment_events
  FOR SELECT
  USING (
    public.is_dexapos_admin()
    AND (
      EXISTS (
        SELECT 1
        FROM public.order_payments op
        JOIN public.orders o ON o.id = op.order_id
        WHERE op.id = payment_events.payment_id
          AND o.merchant_id IN (SELECT public.get_admin_merchant_ids())
      )
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = payment_events.order_id
          AND o.merchant_id IN (SELECT public.get_admin_merchant_ids())
      )
    )
  );
