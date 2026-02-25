# Lifetime Spend - Real-Time Calculation Fix

## Problem
The "LIFETIME SPEND" card was showing stale data from the `customers.lifetime_spend` denormalized field, which wasn't being updated when orders were created. This caused:
- **Card showing:** $107 (outdated)
- **Spend trend chart showing:** $124+ (accurate, from orders)
- **Data inconsistency:** Numbers don't match

## Solution: Calculate from RPC Data
Instead of relying on the denormalized field, the card now **calculates lifetime spend in real-time** from the `get_customer_spend_trend()` RPC function, which queries actual order data.

### Changes Made

**File:** [CustomerProfileSheet.tsx](app/dashboard/customers/components/CustomerProfileSheet.tsx)

**Lines 475-481 (Calculation):**
```typescript
// BEFORE: Used stale denormalized field
const lifetimeSpend = profile?.customer?.lifetime_spend ?? customer.lifetime_spend ?? 0;

// AFTER: Calculates from actual spend trend data
const lifetimeSpend = spendTrend && spendTrend.length > 0
  ? spendTrend.reduce((sum, month) => sum + (month.total_spend || 0), 0)
  : (profile?.customer?.lifetime_spend ?? customer.lifetime_spend ?? 0);
```

**Lines 642-648 (Loading State):**
```typescript
// BEFORE: Only loading on profile load
isLoading={isLoadingProfile}

// AFTER: Also loading while spend trend loads
isLoading={isLoadingProfile || isLoadingSpend}
```

## How It Works

```
User opens customer profile
    ↓
Component loads spendTrend from RPC (get_customer_spend_trend)
    ↓
RPC queries all orders for the customer
    ↓
Frontend sums all months: Jan($45) + Feb($52) + Mar($38) = $135
    ↓
Card displays: LIFETIME SPEND: $135
```

## Benefits

✅ **Always accurate** - Uses live order data, not cached/denormalized field
✅ **Matches spend chart** - Card total = sum of chart data
✅ **No manual syncing needed** - Calculates on-the-fly from orders
✅ **Falls back gracefully** - Uses cached field if RPC hasn't loaded yet

## Edge Cases Handled

1. **RPC still loading:** Shows previous value while `isLoadingSpend` is true
2. **No spend data:** Gracefully falls back to `customers.lifetime_spend`
3. **All months zero:** Correctly shows $0

## Data Consistency

Now guaranteed that:
```
LIFETIME SPEND card = SUM(Spend Over Time chart)
```

Example:
- Jan: $45
- Feb: $52
- Mar: $38
- **Card shows: $135** ✅ (matches sum)

## Migration Notes

- No database changes needed
- Works with existing `get_customer_spend_trend()` RPC
- Backward compatible with old `customers.lifetime_spend` as fallback
- Old stale data can be cleaned up with:
  ```sql
  UPDATE customers c
  SET lifetime_spend = (
    SELECT COALESCE(SUM(total_amount), 0)
    FROM orders WHERE customer_id = c.id
      AND status NOT IN ('cancelled', 'void')
  );
  ```

## Testing

Open a customer profile and verify:
1. LIFETIME SPEND card value
2. Spend Over Time chart total (hover to see)
3. Card shows loading spinner while data fetches
4. Both values match after loading completes
