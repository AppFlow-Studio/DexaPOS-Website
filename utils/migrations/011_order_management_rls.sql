-- ============================================================================
-- DEXA POS - ORDER MANAGEMENT RLS POLICIES
-- Row Level Security for Order Tables
-- ============================================================================
-- TODO Update this to sync with the roles we have present and make it more secure
-- Enable RLS on all order tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sequences ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================================

- Get user's merchant_id from staff_profiles
CREATE OR REPLACE FUNCTION auth.user_merchant_id()
RETURNS UUID AS $$
  SELECT merchant_id 
  FROM public.staff_profiles 
  WHERE user_id = get_my_claim() 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.user_merchant_id() 
  IS 'Returns the merchant_id for the authenticated user from staff_profiles';

-- Get user's staff_profile_id
CREATE OR REPLACE FUNCTION auth.user_staff_profile_id()
RETURNS UUID AS $$
  SELECT id 
  FROM public.staff_profiles 
  WHERE user_id = get_my_claim('sub') 
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.user_staff_profile_id() 
  IS 'Returns the staff_profile_id for the authenticated user';

-- Get user's accessible location IDs from location_members table
CREATE OR REPLACE FUNCTION auth.user_location_ids()
RETURNS UUID[] AS $$
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT location_id),
    ARRAY[]::UUID[]
  )
  FROM (
    -- Get locations from location_members where user is assigned
    -- Handles both Clerk users (user_id match) and POS-only users (staff_profile_id match)
    SELECT lm.location_id
    FROM public.location_members lm
    WHERE lm.is_active = true
      AND lm.merchant_id = auth.user_merchant_id()
      AND (
        lm.user_id = get_my_claim('sub')  -- For Clerk users
        OR lm.staff_profile_id = auth.user_staff_profile_id()  -- For POS-only users
      )
    
    UNION
    
    -- If user has merchant-level role, include all merchant locations
    SELECT l.id as location_id
    FROM public.locations l
    WHERE l.merchant_id = auth.user_merchant_id()
      AND EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        INNER JOIN public.roles r ON r.code = ur.role_code
        WHERE ur.user_id = get_my_claim('sub')
          AND r.organization_type = 'merchant'
          AND r.level_type IN ('merchant', 'organization')
      )
  ) all_locations
  WHERE location_id IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.user_location_ids() 
  IS 'Returns array of location IDs the user can access from location_members table or merchant-level roles';

-- Check if user has specific permission
CREATE OR REPLACE FUNCTION auth.has_permission(permission_code TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.role_permissions rp ON ur.role_code = rp.role_code
    INNER JOIN public.permissions p ON p.code = rp.permission_code
    WHERE ur.user_id = get_my_claim('sub')
      AND p.code = permission_code
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.has_permission(TEXT) 
  IS 'Checks if user has a specific permission through their assigned roles';

-- Check if user has any of the specified permissions (helper for OR logic)
CREATE OR REPLACE FUNCTION auth.has_any_permission(permission_codes TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    INNER JOIN public.role_permissions rp ON ur.role_code = rp.role_code
    INNER JOIN public.permissions p ON p.code = rp.permission_code
    WHERE ur.user_id = get_my_claim('sub')
      AND p.code = ANY(permission_codes)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.has_any_permission(TEXT[]) 
  IS 'Checks if user has any of the specified permissions';

-- ============================================================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_my_claim('sub') TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_merchant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_staff_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_location_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_any_permission(TEXT[]) TO authenticated;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for location_members lookup by user_id
CREATE INDEX IF NOT EXISTS idx_location_members_user_id 
  ON public.location_members(user_id) 
  WHERE user_id IS NOT NULL AND is_active = true;

-- Index for location_members lookup by staff_profile_id
CREATE INDEX IF NOT EXISTS idx_location_members_staff_profile_id 
  ON public.location_members(staff_profile_id) 
  WHERE staff_profile_id IS NOT NULL AND is_active = true;

-- Index for location_members merchant lookup
CREATE INDEX IF NOT EXISTS idx_location_members_merchant_id 
  ON public.location_members(merchant_id) 
  WHERE is_active = true;

-- Index for staff_profiles lookup by user_id
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id 
  ON public.staff_profiles(user_id) 
  WHERE user_id IS NOT NULL;

-- Index for user_roles lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id 
  ON public.user_roles(user_id);

-- Index for role_permissions lookup
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_code 
  ON public.role_permissions(role_code);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_code 
  ON public.role_permissions(permission_code);

-- Index for permissions lookup
CREATE INDEX IF NOT EXISTS idx_permissions_code 
  ON public.permissions(code);


-- ============================================================================
-- ORDERS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view orders from their merchant's locations
CREATE POLICY "Users can view their merchant orders"
  ON public.orders
  FOR SELECT
  USING (
    merchant_id = auth.user_merchant_id()
    AND location_id = ANY(auth.user_location_ids())
  );

-- Policy: Users can create orders for their assigned locations
CREATE POLICY "Users can create orders for their locations"
  ON public.orders
  FOR INSERT
  WITH CHECK (
    merchant_id = auth.user_merchant_id()
    AND location_id = ANY(auth.user_location_ids())
  );

-- Policy: Users can update orders they have access to (not completed/cancelled)
CREATE POLICY "Users can update their orders"
  ON public.orders
  FOR UPDATE
  USING (
    merchant_id = auth.user_merchant_id()
    AND location_id = ANY(auth.user_location_ids())
    AND status NOT IN ('completed', 'cancelled', 'void')
  )
  WITH CHECK (
    merchant_id = auth.user_merchant_id()
    AND location_id = ANY(auth.user_location_ids())
  );

-- Policy: Only authorized users can delete orders (soft delete via status recommended)
CREATE POLICY "Managers can delete orders"
  ON public.orders
  FOR DELETE
  USING (
    merchant_id = auth.user_merchant_id()
    AND location_id = ANY(auth.user_location_ids())
    AND auth.has_permission('orders:delete')
  );

-- ============================================================================
-- ORDER ITEMS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view items from orders they can access
CREATE POLICY "Users can view order items"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Users can insert items into orders they can access
CREATE POLICY "Users can add items to orders"
  ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
        AND o.status NOT IN ('completed', 'cancelled', 'void')
    )
  );

-- Policy: Users can update items in orders they can access
CREATE POLICY "Users can update order items"
  ON public.order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
        AND o.status NOT IN ('completed', 'cancelled', 'void')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Users can soft-delete (void) items
CREATE POLICY "Users can void order items"
  ON public.order_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
        AND o.status NOT IN ('completed', 'cancelled', 'void')
    )
  );

-- ============================================================================
-- ORDER ITEM MODIFIERS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view modifiers for items they can access
CREATE POLICY "Users can view order item modifiers"
  ON public.order_item_modifiers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      INNER JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_modifiers.order_item_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Users can insert modifiers
CREATE POLICY "Users can add modifiers"
  ON public.order_item_modifiers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      INNER JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_modifiers.order_item_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
        AND o.status NOT IN ('completed', 'cancelled', 'void')
    )
  );

-- Policy: Users can update modifiers
CREATE POLICY "Users can update modifiers"
  ON public.order_item_modifiers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      INNER JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_modifiers.order_item_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
        AND o.status NOT IN ('completed', 'cancelled', 'void')
    )
  );

-- Policy: Users can delete modifiers
CREATE POLICY "Users can delete modifiers"
  ON public.order_item_modifiers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      INNER JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_modifiers.order_item_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
        AND o.status NOT IN ('completed', 'cancelled', 'void')
    )
  );

-- ============================================================================
-- ORDER PAYMENTS TABLE POLICIES
-- ============================================================================

-- Policy: Users can view payments for their orders
CREATE POLICY "Users can view order payments"
  ON public.order_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Users can create payments for orders they can access
CREATE POLICY "Users can create payments"
  ON public.order_payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Users can update payments (for status changes, refunds, etc)
CREATE POLICY "Users can update payments"
  ON public.order_payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Only authorized users can delete payments
CREATE POLICY "Managers can delete payments"
  ON public.order_payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_payments.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
    AND auth.has_permission('payments:delete')
  );

-- ============================================================================
-- ORDER STATUS HISTORY TABLE POLICIES
-- ============================================================================

-- Policy: Users can view status history for their orders
CREATE POLICY "Users can view order status history"
  ON public.order_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.merchant_id = auth.user_merchant_id()
        AND o.location_id = ANY(auth.user_location_ids())
    )
  );

-- Policy: Status history is insert-only (no updates/deletes)
CREATE POLICY "System can insert status history"
  ON public.order_status_history
  FOR INSERT
  WITH CHECK (true); -- Trigger handles this automatically

-- ============================================================================
-- ORDER SEQUENCES TABLE POLICIES
-- ============================================================================

-- Policy: Users can view sequences for their locations
CREATE POLICY "Users can view order sequences"
  ON public.order_sequences
  FOR SELECT
  USING (
    location_id = ANY(auth.user_location_ids())
  );

-- Policy: System can manage sequences
CREATE POLICY "System can manage sequences"
  ON public.order_sequences
  FOR ALL
  USING (
    location_id = ANY(auth.user_location_ids())
  )
  WITH CHECK (
    location_id = ANY(auth.user_location_ids())
  );

-- ============================================================================
-- GRANT NECESSARY PERMISSIONS
-- ============================================================================

-- Grant usage on functions
GRANT EXECUTE ON FUNCTION auth.user_merchant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_location_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_permission(TEXT) TO authenticated;

-- Grant access to order tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_modifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payments TO authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_sequences TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can view their merchant orders" ON public.orders 
  IS 'Users can only see orders from their assigned merchant and locations';
  
COMMENT ON POLICY "Users can create orders for their locations" ON public.orders 
  IS 'Users can create orders for locations they have access to';
  
COMMENT ON FUNCTION auth.user_merchant_id() 
  IS 'Returns the merchant_id for the authenticated user (supports both Clerk and POS-only users)';
  
COMMENT ON FUNCTION auth.user_location_ids() 
  IS 'Returns array of location IDs the authenticated user can access';



  -- ============================================================================
-- TESTING QUERIES
-- ============================================================================

/*
-- Test if functions work correctly
SELECT get_my_claim('sub');
-- Expected: 'user_36qp8GJ8vdkhsLuNKtDRZBJIzCX'

SELECT auth.user_merchant_id();
-- Expected: '2add44cb-f498-4653-aca3-a8f0ca258e70'

SELECT auth.user_staff_profile_id();
-- Expected: UUID of staff profile

SELECT auth.user_location_ids();
-- Expected: ['657a703d-37ef-423e-a72b-a8766f67941a', '8835e749-9bbf-4405-b4a4-7f28a56f990a', ...]

SELECT auth.has_permission('location.orders.view');
-- Expected: true or false

-- Debug location access
SELECT 
  lm.location_id,
  lm.user_id,
  lm.staff_profile_id,
  lm.role_code,
  lm.is_active,
  l.name as location_name
FROM location_members lm
LEFT JOIN locations l ON l.id = lm.location_id
WHERE lm.merchant_id = auth.user_merchant_id()
  AND (
    lm.user_id = get_my_claim('sub')
    OR lm.staff_profile_id = auth.user_staff_profile_id()
  )
  AND lm.is_active = true;
*/

-- ============================================================================
-- NOTES ON location_members TABLE STRUCTURE
-- ============================================================================

/*
The location_members table handles both:

1. CLERK USERS (Dashboard/Admin access):
   - Has user_id populated
   - Has staff_profile_id populated
   - Location assignment via user_id match
   
   Example: Mike Doe (merchant.admin)
   - user_id: 'user_36u15MkVGaCOwWexx9cWWlrF1Vw'
   - staff_profile_id: 'ec6584db-874e-40b7-ab2b-399a590184b2'
   - Assigned to locations: '657a703d-37ef-423e-a72b-a8766f67941a', '8835e749-9bbf-4405-b4a4-7f28a56f990a'

2. POS-ONLY USERS (PIN-based access):
   - Has user_id = NULL
   - Has staff_profile_id populated
   - Has pin_code for authentication
   - Location assignment via staff_profile_id match
   
   Example: Frank Doe (merchant.cashier)
   - user_id: NULL
   - staff_profile_id: '4545ef38-b77e-4dc6-9b4a-f730123fd862'
   - Assigned to location: '657a703d-37ef-423e-a72b-a8766f67941a'

3. MERCHANT-LEVEL ROLES:
   - Users with merchant.admin, merchant.manager, merchant.owner roles
   - Get access to ALL locations automatically
   - Don't need explicit location_members entries (but may have them)
   
The auth.user_location_ids() function handles all three cases:
- Checks location_members for explicit assignments (both user_id and staff_profile_id)
- Also grants all locations if user has merchant-level role
*/