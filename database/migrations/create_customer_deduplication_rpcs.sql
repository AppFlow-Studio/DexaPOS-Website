-- =============================================================================
-- UNIQUE CONSTRAINT for Customer Phone Numbers
-- =============================================================================
-- Prevents duplicate phone numbers within a merchant
-- This ensures data integrity at the database level

CREATE UNIQUE INDEX unique_merchant_phone
ON customers (merchant_id, phone)
WHERE phone IS NOT NULL;
-- =============================================================================
-- RPC Functions for Customer Deduplication (DEXA-CUST-001 Phase 3)
-- =============================================================================
-- This file contains two RPC functions for managing customer merges:
-- 1. find_duplicate_customers - Identifies duplicate customer groups (by phone)
-- 2. merge_customers - Merges duplicate customers into a primary record
--
-- NOTE: With the UNIQUE constraint above, duplicate phones are prevented at insert time.
-- These functions exist for historical duplicates that may have been created before
-- the constraint was added, or for handling special merge scenarios.
-- =============================================================================

CREATE OR REPLACE FUNCTION merge_customers(
  p_primary_id uuid,
  p_duplicate_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_id uuid;
  v_primary_name text;
  v_new_spend numeric := 0;
  v_new_visits bigint := 0;
  v_new_last_visit timestamptz;
  v_new_total_orders bigint := 0;
  v_merged_tags text[];
  v_duplicate_count int;
BEGIN

  -- =====================================
  -- 1️⃣ Basic Input Validation
  -- =====================================

  IF p_duplicate_ids IS NULL
     OR array_length(p_duplicate_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No duplicate IDs provided'
    );
  END IF;

  IF p_primary_id = ANY(p_duplicate_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Primary ID cannot be included in duplicate IDs'
    );
  END IF;

  -- =====================================
  -- 2️⃣ Lock Primary Customer Row
  -- =====================================

  SELECT merchant_id, name
  INTO v_merchant_id, v_primary_name
  FROM customers
  WHERE id = p_primary_id
  FOR UPDATE;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Primary customer not found'
    );
  END IF;

  -- =====================================
  -- 3️⃣ Validate + Lock Duplicate Rows
  -- =====================================

  SELECT COUNT(*)
  INTO v_duplicate_count
  FROM customers
  WHERE id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id
  FOR UPDATE;

  IF v_duplicate_count <> array_length(p_duplicate_ids, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'One or more duplicate IDs invalid or cross-merchant'
    );
  END IF;

  -- =====================================
  -- 4️⃣ Aggregate Duplicate Totals
  -- =====================================

  SELECT
    COALESCE(SUM(lifetime_spend), 0),
    COALESCE(SUM(visits), 0),
    MAX(last_visit),
    COALESCE(SUM(total_orders), 0)
  INTO
    v_new_spend,
    v_new_visits,
    v_new_last_visit,
    v_new_total_orders
  FROM customers
  WHERE id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 5️⃣ Merge Tags (Set Union)
  -- =====================================

  SELECT array_agg(DISTINCT tag)
  INTO v_merged_tags
  FROM (
    SELECT unnest(tags) AS tag
    FROM customers
    WHERE (id = p_primary_id OR id = ANY(p_duplicate_ids))
      AND merchant_id = v_merchant_id
      AND tags IS NOT NULL
  ) t
  WHERE tag IS NOT NULL;

  -- =====================================
  -- 6️⃣ Reassign Orders
  -- =====================================

  UPDATE orders
  SET customer_id = p_primary_id,
      updated_at = NOW()
  WHERE customer_id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 7️⃣ Reassign Customer Activities
  -- =====================================

  UPDATE customer_activities
  SET customer_id = p_primary_id
  WHERE customer_id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 8️⃣ Update Primary Customer
  -- =====================================

  UPDATE customers
  SET
    lifetime_spend = lifetime_spend + v_new_spend,
    visits = visits + v_new_visits,
    last_visit = CASE
      WHEN v_new_last_visit IS NOT NULL
           AND (last_visit IS NULL OR v_new_last_visit > last_visit)
      THEN v_new_last_visit
      ELSE last_visit
    END,
    tags = COALESCE(v_merged_tags, tags),
    total_orders = total_orders + v_new_total_orders,
    updated_at = NOW()
  WHERE id = p_primary_id
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 9️⃣ Delete Duplicate Customers
  -- =====================================

  DELETE FROM customers
  WHERE id = ANY(p_duplicate_ids)
    AND merchant_id = v_merchant_id;

  -- =====================================
  -- 10️⃣ Success Response
  -- =====================================

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', p_primary_id,
    'primary_name', v_primary_name,
    'merged_count', v_duplicate_count,
    'merged_ids', p_duplicate_ids,
    'combined_spend', v_new_spend,
    'combined_visits', v_new_visits
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

CREATE OR REPLACE FUNCTION find_duplicate_customers(p_merchant_id uuid)
RETURNS TABLE (
  customers jsonb,
  reason text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN

  -- =========================
  -- Duplicate Phone Numbers
  -- =========================
  -- NOTE: With the UNIQUE constraint on (merchant_id, phone),
  -- this should only return results if:
  -- 1. Historical duplicates exist before constraint was added
  -- 2. One of the duplicate phones was set to NULL
  -- 3. Data was corrupted or migrated

  RETURN QUERY
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'email', c.email,
        'lifetime_spend', c.lifetime_spend,
        'visits', c.visits,
        'last_visit', c.last_visit,
        'total_orders', c.total_orders,
        'avg_spend', c.avg_spend,
        'tags', c.tags
      )
      ORDER BY c.created_at ASC
    ) AS customers,
    'same_phone'::text AS reason
  FROM customers c
  WHERE c.merchant_id = p_merchant_id
    AND c.phone IS NOT NULL
  GROUP BY c.phone
  HAVING COUNT(*) > 1;

END;
$$;

-- =============================================================================
-- Setup & Testing
-- =============================================================================
--
-- 1. Run this migration in Supabase:
--    - Paste this entire script into SQL Editor
--    - Click "Run"
--
-- 2. The UNIQUE constraint will prevent:
--    - Two customers with the same phone (even if names differ)
--    - The same phone being assigned to multiple customers
--
-- 3. Testing the RPC:
--    -- Find any historical duplicates (should return empty if constraint is enforced)
--    SELECT * FROM find_duplicate_customers('your-merchant-uuid');
--
--    -- To merge duplicates (if they somehow exist):
--    SELECT merge_customers('primary-customer-uuid',
--                          ARRAY['dup-customer-1-uuid', 'dup-customer-2-uuid']);
--
-- 4. Frontend Integration:
--    - DuplicatesAlert.tsx will only show duplicates if they exist
--    - AddCustomerDialog already has phone duplicate checking
--    - CreateCustomer action will fail gracefully if phone is already taken
--
-- 5. Update database.types.ts after creating this function:
--    find_duplicate_customers: {
--      Args: { p_merchant_id: string }
--      Returns: Array<{customers: CustomerListItem[], reason: "same_phone"}>
--    }
--    merge_customers: {
--      Args: { p_primary_id: string; p_duplicate_ids: string[] }
--      Returns: { success: boolean; error?: string }
--    }
-- =============================================================================