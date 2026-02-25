# RPC Functions Error Fixes Summary

## Errors Found & Fixed

### ✅ FIXED: 1. GetCustomerVisitPattern - Ambiguous Column Reference
**Error Code:** 42702
**Message:** `column reference "visit_count" is ambiguous`

**Root Cause:** In the final SELECT, the `visit_count` and ORDER BY clause were ambiguous.

**Fix:** Qualified column references with table alias in [enhance_customer_overview_tab.sql](database/migrations/enhance_customer_overview_tab.sql#L78-L82)
```sql
-- BEFORE
SELECT
  TRIM(day_of_week) AS day_of_week,
  hour_of_day,
  visit_count,  -- ❌ Ambiguous
  (rank <= 3)::boolean AS is_peak
FROM visit_stats
ORDER BY visit_count DESC;  -- ❌ Ambiguous

-- AFTER
SELECT
  TRIM(day_of_week) AS day_of_week,
  hour_of_day,
  visit_stats.visit_count,  -- ✅ Qualified
  (rank <= 3)::boolean AS is_peak
FROM visit_stats
ORDER BY visit_stats.visit_count DESC;  -- ✅ Qualified
```

---

### ✅ FIXED: 2. GetCustomerTopItems - Type Mismatch on Timestamp
**Error Code:** 42804
**Message:** `Returned type timestamp with time zone does not match expected type timestamp without time zone`

**Root Cause:** Function return type specified `timestamp` (no timezone) but query returns `timestamptz`.

**Fixes:**
1. Changed return type to match actual data:
```sql
-- BEFORE
RETURNS TABLE (
  ...
  last_ordered_at timestamp,  -- ❌ No timezone
  ...
)

-- AFTER
RETURNS TABLE (
  ...
  last_ordered_at timestamp with time zone,  -- ✅ With timezone
  ...
)
```

2. Removed unnecessary explicit cast:
```sql
-- BEFORE
io.last_ordered_at::timestamp,  -- ❌ Downcast to timestamp

-- AFTER
io.last_ordered_at,  -- ✅ Let database handle type
```

---

### ✅ FIXED: 3. GetCustomerActivityTimeline - Timestamp Type Mismatch
**Error Code:** 42804
**Message:** `Returned type timestamp with time zone does not match expected type timestamp without time zone`

**Root Cause:** Same as #2 - return type specified `timestamp` but data is `timestamptz`.

**Fixes:**
1. Changed return type:
```sql
RETURNS TABLE (
  ...
  created_at timestamp with time zone,  -- ✅ Changed from timestamp
  ...
)
```

2. Removed unnecessary casts in ORDER subquery:
```sql
-- BEFORE
o.created_at::timestamp AS created_at,  -- ❌ Downcast
ca.created_at::timestamp AS created_at,  -- ❌ Downcast

-- AFTER
o.created_at,  -- ✅ No cast needed
ca.created_at,  -- ✅ No cast needed
```

---

### ✅ FIXED: 4. Merge Customers - Non-existent Column Update
**File:** [create_customer_deduplication_rpcs.sql](database/migrations/create_customer_deduplication_rpcs.sql#L141-L145)

**Error:** The `customer_activities` table doesn't have an `updated_at` column.

**Fix:**
```sql
-- BEFORE
UPDATE customer_activities
SET customer_id = p_primary_id,
    updated_at = NOW()  -- ❌ Column doesn't exist
WHERE customer_id = ANY(p_duplicate_ids)
  AND merchant_id = v_merchant_id;

-- AFTER
UPDATE customer_activities
SET customer_id = p_primary_id  -- ✅ Removed updated_at
WHERE customer_id = ANY(p_duplicate_ids)
  AND merchant_id = v_merchant_id;
```

---

## ⚠️ NOT FIXED (Usage Error): 5. GetCustomerPercentile - Wrong Parameter Type
**Error Code:** 22P02
**Message:** `invalid input syntax for type uuid: "org_34LN9aMJGO4jNllGTvHH4CLB5gq"`

**Root Cause:** Component is passing Clerk org ID instead of merchant UUID to RPC function.

**Location:** [CustomerProfileSheet.tsx:451](app/dashboard/customers/components/CustomerProfileSheet.tsx#L451)

```typescript
// BEFORE (❌ Wrong)
const merchantId = userInfo?.members?.[0]?.organizations?.id || null;  // Clerk org ID!
const { data: percentile } = useCustomerPercentile(customerId, merchantId);
```

**Why It Fails:**
- `org_34LN9aMJGO4jNllGTvHH4CLB5gq` is a Clerk organization ID (format: `org_*`)
- RPC function expects a UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- PostgreSQL can't convert the Clerk ID to a valid UUID

**Solutions (Choose One):**

**Option A: Use getMerchantId() in a useEffect**
```typescript
const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || null;
const [merchantId, setMerchantId] = useState<string | null>(null);

useEffect(() => {
  if (clerkOrgId) {
    getMerchantId(clerkOrgId).then(setMerchantId);
  }
}, [clerkOrgId]);

const { data: percentile } = useCustomerPercentile(customerId, merchantId);
```

**Option B: Create a custom hook (Recommended)**
```typescript
// In useCustomers.ts
export function useCustomerPercentileWithClerkOrgId(
  customerId: string | null,
  clerkOrgId: string | null,
) {
  const [merchantId, setMerchantId] = useState<string | null>(null);

  useEffect(() => {
    if (clerkOrgId) {
      getMerchantId(clerkOrgId).then(setMerchantId);
    }
  }, [clerkOrgId]);

  return useCustomerPercentile(customerId, merchantId);
}
```

Then update the component:
```typescript
const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || null;
const { data: percentile } = useCustomerPercentileWithClerkOrgId(customerId, clerkOrgId);
```

---

## Migration Files Updated

1. ✅ [database/migrations/enhance_customer_overview_tab.sql](database/migrations/enhance_customer_overview_tab.sql)
   - Fixed ambiguous column reference in `get_customer_visit_pattern`
   - Fixed timestamp type mismatch in `get_customer_top_items`
   - Fixed timestamp type mismatch in `get_customer_activity_timeline`

2. ✅ [database/migrations/create_customer_deduplication_rpcs.sql](database/migrations/create_customer_deduplication_rpcs.sql)
   - Removed non-existent `updated_at` column from `customer_activities` update

3. ⚠️ [app/dashboard/customers/components/CustomerProfileSheet.tsx](app/dashboard/customers/components/CustomerProfileSheet.tsx)
   - **REQUIRES MANUAL FIX** - Need to handle Clerk org ID to merchant UUID conversion for GetCustomerPercentile

---

## Testing Recommendations

After applying fixes, test each RPC:

```sql
-- Test 1: Spend Trend
SELECT * FROM get_customer_spend_trend('customer-uuid', 6);

-- Test 2: Visit Pattern
SELECT * FROM get_customer_visit_pattern('customer-uuid', 90);

-- Test 3: Top Items
SELECT * FROM get_customer_top_items('customer-uuid', 90, 10);

-- Test 4: Channel Trend
SELECT * FROM get_customer_channel_trend('customer-uuid', 90);

-- Test 5: Activity Timeline
SELECT * FROM get_customer_activity_timeline('customer-uuid', 50);

-- Test 6: Percentile (with correct merchant UUID)
SELECT * FROM get_customer_percentile('customer-uuid', 'merchant-uuid');

-- Test 7: Visit Trend
SELECT * FROM get_customer_visit_trend('customer-uuid', 90, 90);

-- Test 8: Merge Customers
SELECT merge_customers('primary-uuid', ARRAY['dup-uuid-1', 'dup-uuid-2']);
```
