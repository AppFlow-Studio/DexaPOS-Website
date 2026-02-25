# RPC Functions - All Fixes Applied ✅

## Summary of Changes

### Database Migrations Fixed

#### 1. ✅ enhance_customer_overview_tab.sql

**Fixed: get_customer_visit_pattern** (Line 78-82)
- **Error:** `column reference "visit_count" is ambiguous` (Code 42702)
- **Cause:** References to `visit_count` in final SELECT and ORDER BY without table alias
- **Solution:** Qualified all column references with `visit_stats.visit_count`

```sql
-- Changed to:
SELECT ... visit_stats.visit_count, ...
ORDER BY visit_stats.visit_count DESC;
```

**Fixed: get_customer_top_items** (Line 102)
- **Error:** `Returned type timestamp with time zone does not match expected type timestamp without time zone` (Code 42804)
- **Cause:** Function return type specified `timestamp` but data is `timestamptz`
- **Solution:**
  - Changed return type to `timestamp with time zone` (Line 102)
  - Removed unnecessary cast `::timestamp` (Line 140)

**Fixed: get_customer_activity_timeline** (Line 246)
- **Error:** Same timestamp type mismatch (Code 42804)
- **Cause:** Return type mismatch between `timestamp` and `timestamptz`
- **Solution:**
  - Changed return type to `timestamp with time zone` (Line 246)
  - Removed casts `::timestamp` from both SELECT statements (Lines 265, 298)

#### 2. ✅ create_customer_deduplication_rpcs.sql

**Fixed: merge_customers** (Line 141-144)
- **Error:** `column "updated_at" does not exist on customer_activities` (Code 42703)
- **Cause:** Attempting to update non-existent `updated_at` column
- **Solution:** Removed the `updated_at = NOW()` line from UPDATE statement

```sql
-- Changed from:
UPDATE customer_activities
SET customer_id = p_primary_id,
    updated_at = NOW()  -- ❌ Doesn't exist

-- To:
UPDATE customer_activities
SET customer_id = p_primary_id  -- ✅ Only update what exists
```

---

### Application Code Fixed

#### 3. ✅ app/dashboard/actions/customers.ts

**Added:** New server action `GetCustomerPercentileByClerkOrgId` (Line 1077-1097)
- **Purpose:** Accepts Clerk org ID and automatically converts to merchant UUID before calling RPC
- **Why Needed:** Components were passing Clerk org IDs (`org_*`) instead of merchant UUIDs
- **How It Works:**
  1. Accepts `customerId` and `clerkOrgId`
  2. Calls `getMerchantId()` to convert Clerk org ID to merchant UUID
  3. Calls `GetCustomerPercentile()` with the resolved merchant UUID

```typescript
export async function GetCustomerPercentileByClerkOrgId(
  customerId: string,
  clerkOrgId: string,
): Promise<{ ... } | null> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return null;
  return GetCustomerPercentile(customerId, merchantId);
}
```

#### 4. ✅ app/dashboard/customers/hooks/useCustomers.ts

**Updated Imports:** Added `GetCustomerPercentileByClerkOrgId` (Line 25)

**Added:** New hook `useCustomerPercentileWithClerkOrgId` (Line 419-437)
- **Purpose:** Client-side hook that handles Clerk org ID parameter
- **Advantage:** Components can use either:
  - `useCustomerPercentile(customerId, merchantUUID)` - Direct merchant UUID
  - `useCustomerPercentileWithClerkOrgId(customerId, clerkOrgId)` - Auto-conversion

```typescript
export function useCustomerPercentileWithClerkOrgId(
  customerId: string | null,
  clerkOrgId: string | null,
) {
  return useQuery({
    queryKey: ["customer", "percentile", customerId, clerkOrgId],
    queryFn: () =>
      customerId && clerkOrgId
        ? GetCustomerPercentileByClerkOrgId(customerId, clerkOrgId)
        : null,
    enabled: !!customerId && !!clerkOrgId,
    staleTime: 10 * 60 * 1000,
  });
}
```

#### 5. ✅ app/dashboard/customers/components/CustomerProfileSheet.tsx

**Updated Imports:** Changed from `useCustomerPercentile` to `useCustomerPercentileWithClerkOrgId` (Line 56)

**Fixed Component Usage:** (Line 451, 465)
```typescript
// BEFORE (❌ Wrong)
const merchantId = userInfo?.members?.[0]?.organizations?.id || null;  // Clerk ID!
const { data: percentile } = useCustomerPercentile(customerId, merchantId);

// AFTER (✅ Correct)
const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || null;  // Correctly named
const { data: percentile } = useCustomerPercentileWithClerkOrgId(customerId, clerkOrgId);
```

---

## Verification Checklist

- [x] All ambiguous column references qualified with table aliases
- [x] All timestamp type mismatches resolved (timestamp → timestamp with time zone)
- [x] All non-existent column references removed
- [x] Clerk org ID to merchant UUID conversion handled
- [x] New server action handles automatic conversion
- [x] New client hook for easy component integration
- [x] Component updated to use correct hook with correct parameter types
- [x] Backward compatibility maintained (old `useCustomerPercentile` still available)

---

## Expected Behavior After Fixes

### Before (Errors):
```
[GetCustomerVisitPattern] Error: column reference "visit_count" is ambiguous
[GetCustomerTopItems] Error: Returned type timestamp with time zone does not match...
[GetCustomerActivityTimeline] Error: Returned type timestamp with time zone does not match...
[GetCustomerPercentile] Error: invalid input syntax for type uuid: "org_34LN9..."
```

### After (Success):
```
✅ GetCustomerVisitPattern returns visit patterns correctly
✅ GetCustomerTopItems returns timestamps with timezones correctly
✅ GetCustomerActivityTimeline returns activity data correctly
✅ GetCustomerPercentile accepts Clerk org ID and resolves merchant UUID automatically
```

---

## Files Modified

1. `database/migrations/enhance_customer_overview_tab.sql` - 3 RPC function fixes
2. `database/migrations/create_customer_deduplication_rpcs.sql` - 1 RPC function fix
3. `app/dashboard/actions/customers.ts` - Added new server action
4. `app/dashboard/customers/hooks/useCustomers.ts` - Added new client hook
5. `app/dashboard/customers/components/CustomerProfileSheet.tsx` - Updated to use new hook

---

## Next Steps

1. **Re-run the migrations** in Supabase:
   ```bash
   # Copy the updated SQL files and run them in Supabase SQL Editor
   ```

2. **Test all RPC functions** to confirm they work:
   ```bash
   npm run dev  # Start development server
   # Navigate to customer dashboard and check if profile sheet loads without errors
   ```

3. **Monitor console logs** for any remaining errors:
   ```bash
   # Check browser console for [GetCustomer*] error messages
   # Should be none for these RPC functions
   ```

---

## Technical Notes

### Type Safety
- `GetCustomerPercentile(customerId: uuid, merchantId: uuid)` - Direct function
- `GetCustomerPercentileByClerkOrgId(customerId: uuid, clerkOrgId: string)` - Wrapper function
- `useCustomerPercentile()` - Hook for direct merchant UUID
- `useCustomerPercentileWithClerkOrgId()` - Hook for Clerk org ID (automatic conversion)

### Database Consistency
All timestamp columns now correctly use `timestamp with time zone` to match the actual PostgreSQL column types:
- `orders.created_at` is `timestamp with time zone`
- `customer_activities.created_at` is `timestamp with time zone`
- `order_items.created_at` is `timestamp with time zone`

This ensures no type coercion errors when returning data from RPC functions.
