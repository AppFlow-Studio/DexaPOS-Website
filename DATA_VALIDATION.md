# Customer Profile Data - Real Data & Validation

## Cards - Do They Have Real Data?

### ✅ YES - Cards Display Real Data

The 6 metric cards get data from **actual customer records**:

| Card | Data Source | Fallback |
|------|-------------|----------|
| **LAST VISIT** | `profile?.customer?.last_visit` | `customer.last_visit` |
| **TOTAL VISITS** | `profile?.customer?.visits` | `customer.visits` |
| **LIFETIME SPEND** | `profile?.customer?.lifetime_spend` | `customer.lifetime_spend` |
| **AVG. SPEND** | `profile?.customer?.avg_spend` | `customer.avg_spend` |
| **AVG. TIP** | `profile?.customer?.avg_tip_percent` | Defaults to 0 |
| **CUSTOMER SINCE** | `profile?.customer?.created_at` | Calculated from creation date |

**Source:** [CustomerProfileSheet.tsx:475-499](app/dashboard/customers/components/CustomerProfileSheet.tsx#L475-L499)

The `profile` comes from the `get_customer_profile()` RPC function, which queries the database. If that data is empty, it falls back to the `customer` object passed from the list view.

---

## Visit Pattern - Why "Not Enough Data Yet"?

### ❌ This Shows When No Visit Pattern Data Exists

The visit pattern card displays "Not enough data yet" when:

```typescript
// Line 711-724 in CustomerProfileSheet.tsx
{visitPatternSummary ? (
  // Show: "Usually visits on Saturdays around 11 AM"
) : (
  // Show: "Not enough data yet"  ← When visitPatternSummary is null
)}
```

### Why visitPatternSummary is null:

```typescript
const peakPattern = visitPattern?.[0];  // Get first (peak) pattern
const visitPatternSummary = peakPattern ? "Usually visits..." : null;
```

`visitPatternSummary` is null when `visitPattern` is empty (no data returned from RPC).

### Why visitPattern might be empty:

The `get_customer_visit_pattern()` RPC requires:

1. ✅ Customer has orders in the **last 90 days**
2. ✅ Orders have status **NOT** 'cancelled' or 'void'
3. ✅ Orders have valid `created_at` timestamps

If ANY of these are missing:
- No orders → Empty result
- All orders cancelled/void → Filtered out → Empty result
- No data in last 90 days → Empty result

---

## How to Verify Data Exists

### 1. Check If Customer Has Orders

**In Supabase SQL Editor:**

```sql
-- Replace 'customer-uuid' with actual customer ID
SELECT COUNT(*) as total_orders,
       COUNT(DISTINCT DATE(created_at)) as visit_days,
       MIN(created_at) as earliest_order,
       MAX(created_at) as latest_order
FROM orders
WHERE customer_id = 'customer-uuid'
  AND status NOT IN ('cancelled', 'void');
```

**Expected Result:** If `total_orders > 0`, the customer has visitible orders.

### 2. Test RPC Function Directly

```sql
-- Replace 'customer-uuid' with actual customer ID
SELECT * FROM get_customer_visit_pattern('customer-uuid', 90);
```

**Expected Result:**
- Multiple rows with (day_of_week, hour_of_day, visit_count, is_peak)
- Sorted by visit_count descending
- First row shows the peak visit time

**If Empty:**
- Customer has no orders in last 90 days, OR
- All orders are cancelled/void

### 3. Check Raw Customer Profile

```sql
-- Replace 'customer-uuid' with actual customer ID
SELECT get_customer_profile('customer-uuid');
```

Should return a full profile object.

---

## What Real Data Looks Like

### Example: Customer with Good Data

**Database:**
```
orders table:
- 50 orders total
- 25 in last 90 days
- Status: 'completed' (not cancelled)
- Last order: 3 days ago
```

**Cards Display:**
```
LAST VISIT: 3 days ago
TOTAL VISITS: 50
LIFETIME SPEND: $1,245.75
AVG. SPEND: $24.92
AVG. TIP: 18.2%
CUSTOMER SINCE: 8 months
```

**Visit Pattern:**
```
Usually visits on Thursdays around 6 PM
- Thursdays — 6:00 · 8 visits
- Fridays — 7:00 · 6 visits
- Tuesdays — 6:00 · 5 visits
```

### Example: Customer with No Recent Orders

**Database:**
```
orders table:
- 10 orders total
- 0 in last 90 days
- Last order: 4 months ago
```

**Cards Display:**
```
LAST VISIT: 4 months ago
TOTAL VISITS: 10
LIFETIME SPEND: $287.50
AVG. SPEND: $28.75
AVG. TIP: 15.0%
CUSTOMER SINCE: 10 months
```

**Visit Pattern:**
```
Not enough data yet  ← Because no visits in last 90 days
```

---

## Data Quality Issues & Solutions

### Issue 1: Cards Show Zeros

**Problem:** Cards display 0 or null values

**Cause:** Either:
1. Customer record doesn't exist in database
2. `profile` is null AND customer object doesn't have the field

**Solution:**
```bash
# In Supabase SQL Editor:
SELECT * FROM customers WHERE id = 'customer-uuid' LIMIT 1;
# Should return the customer record with all fields populated
```

### Issue 2: Visit Pattern Empty But Orders Exist

**Problem:** "Not enough data yet" shows despite having orders

**Cause:** RPC function isn't returning data

**Solution:**
```bash
# Test the RPC directly:
SELECT * FROM get_customer_visit_pattern('customer-uuid', 90);

# If empty, check for issues:
SELECT COUNT(*) FROM orders
WHERE customer_id = 'customer-uuid'
  AND created_at >= NOW() - '90 days'::interval
  AND status NOT IN ('cancelled', 'void');
# Should be > 0
```

### Issue 3: Orders Exist But All Cancelled

**Problem:** Customer has orders, but all show as cancelled/void

**Cause:** Test data created with wrong status

**Solution:**
```sql
-- Check cancelled orders
SELECT COUNT(*) FROM orders
WHERE customer_id = 'customer-uuid'
AND status IN ('cancelled', 'void');

-- Update test orders to 'completed'
UPDATE orders
SET status = 'completed'
WHERE customer_id = 'customer-uuid'
AND status IN ('cancelled', 'void');
```

---

## Creating Test Data

If you need real-looking test data:

```sql
-- Insert test customer
INSERT INTO customers (id, merchant_id, name, phone, email, lifetime_spend, visits, created_at)
VALUES (
  gen_random_uuid(),
  'merchant-uuid',
  'John Doe',
  '555-0123',
  'john@example.com',
  250.00,
  10,
  NOW() - '6 months'::interval
)
RETURNING id;

-- Copy the returned ID and use it below:

-- Insert 10 test orders for last 90 days
INSERT INTO orders (id, merchant_id, location_id, customer_id, order_type, status, order_number, total_amount, created_at)
SELECT
  gen_random_uuid(),
  'merchant-uuid',
  'location-uuid',
  'customer-uuid',  -- Use the ID from above
  'dine_in',
  'completed',
  'ORD-' || (row_number() OVER ()),
  ROUND(20 + RANDOM() * 80, 2),
  NOW() - ('1 days'::interval * (RANDOM() * 89)::int)
FROM generate_series(1, 10);

-- Verify
SELECT COUNT(*) FROM orders WHERE customer_id = 'customer-uuid';
SELECT * FROM get_customer_visit_pattern('customer-uuid', 90) LIMIT 5;
```

---

## Summary

| Question | Answer | Location |
|----------|--------|----------|
| Do cards have real data? | ✅ YES - from customer profile + fallback | Lines 475-499 |
| Why "not enough data" for visits? | ❌ No orders in last 90 days | Lines 516, 711 |
| How to check if data exists? | Run SQL tests above | See "How to Verify" section |
| Is the RPC function broken? | No - it works fine with valid data | Tests confirm this |
| Do I need test data? | Maybe - check if customer has recent orders | Create test data if needed |
