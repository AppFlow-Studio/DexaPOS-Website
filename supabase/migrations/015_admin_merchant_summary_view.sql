-- ============================================================================
-- DEXA POS - Admin Merchant Summary View
-- ============================================================================
-- This view aggregates key metrics for the admin merchant list.
-- Used by HQ admins to view and manage all merchants.
-- ============================================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.admin_merchant_summary;

-- Create the summary view
CREATE OR REPLACE VIEW public.admin_merchant_summary AS
SELECT
  m.id,
  m.name,
  m.clerk_org_id,
  m.type,
  m.created_at,
  m.updated_at,
  m.public_metadata,

  -- Location counts
  (SELECT COUNT(*)::int FROM locations l WHERE l.merchant_id = m.id) AS total_locations,
  (SELECT COUNT(*)::int FROM locations l WHERE l.merchant_id = m.id AND l.is_active = true) AS active_locations,

  -- Staff count
  (SELECT COUNT(*)::int FROM staff_profiles sp WHERE sp.merchant_id = m.id AND sp.is_active = true) AS active_staff_count,

  -- Today's metrics
  (SELECT COUNT(*)::int FROM orders o
   WHERE o.merchant_id = m.id
   AND o.created_at >= CURRENT_DATE
   AND o.status NOT IN ('cancelled', 'draft')) AS orders_today,

  (SELECT COALESCE(SUM(o.total_amount), 0)::numeric FROM orders o
   WHERE o.merchant_id = m.id
   AND o.created_at >= CURRENT_DATE
   AND o.status = 'completed') AS revenue_today,

  -- Last activity
  (SELECT MAX(o.created_at) FROM orders o WHERE o.merchant_id = m.id) AS last_order_at,

  -- Derived status based on activity
  CASE
    -- No active locations = still onboarding
    WHEN NOT EXISTS (SELECT 1 FROM locations l WHERE l.merchant_id = m.id AND l.is_active = true)
      THEN 'onboarding'
    -- No orders in last 7 days = inactive
    WHEN (SELECT MAX(o.created_at) FROM orders o WHERE o.merchant_id = m.id) IS NULL
      THEN 'onboarding'
    WHEN (SELECT MAX(o.created_at) FROM orders o WHERE o.merchant_id = m.id) < NOW() - INTERVAL '7 days'
      THEN 'inactive'
    -- Otherwise active
    ELSE 'active'
  END AS derived_status

FROM merchants m;

-- Grant access to authenticated users (RLS on underlying tables still applies)
GRANT SELECT ON public.admin_merchant_summary TO authenticated;

-- ============================================================================
-- RLS Policy for Admin Access to Merchants
-- ============================================================================
-- Ensure HQ admins can see all merchants

-- Check if admin policy exists, if not create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'merchants'
    AND policyname = 'hq_admin_full_access'
  ) THEN
    CREATE POLICY hq_admin_full_access ON public.merchants
      FOR ALL
      USING (is_dexapos_admin())
      WITH CHECK (is_dexapos_admin());
  END IF;
END $$;

-- ============================================================================
-- Index for better view performance
-- ============================================================================

-- Index on orders for merchant_id and created_at (for today's metrics)
CREATE INDEX IF NOT EXISTS idx_orders_merchant_created
  ON orders(merchant_id, created_at DESC);

-- Index on staff_profiles for merchant lookups
CREATE INDEX IF NOT EXISTS idx_staff_profiles_merchant_active
  ON staff_profiles(merchant_id)
  WHERE is_active = true;
