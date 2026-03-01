# How to Use Loyalty Data in Actual Receipts

**Quick Answer:** The loyalty section is currently in the **receipt preview** (settings page). To use it in **actual customer receipts** when they checkout, you need to:

1. Call `GetReceiptLoyaltyData()` server action **when generating a receipt**
2. Pass the returned data to your receipt formatter
3. Render the loyalty section with real customer data

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ POS Tablet (React Native) or Web Checkout           │
│                                                      │
│ 1. Customer completes order                        │
│ 2. Receipt generation triggered                    │
│ 3. [CALL SERVER ACTION HERE] ↓                     │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────────────────┐
│ Server Action: GetReceiptLoyaltyData()              │
│ Location: app/dashboard/actions/loyalty-receipt.ts │
│                                                      │
│ Returns:                                            │
│ - programs[] with balances & progress              │
│ - available_rewards_count                          │
│ - call_to_action messages                          │
└──────────────┬───────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────┐
│ Receipt Formatter (wherever receipts are built)     │
│                                                      │
│ Renders loyalty section with real data              │
│ ─────────────────────────────────────────────────    │
│ REWARDS SUMMARY                                      │
│ ─────────────────────────────────────────────────    │
│ ☕ Coffee Card: +1 punch (8/9)                      │
│    1 more to free coffee!                           │
│ ...etc                                              │
└──────────────────────────────────────────────────────┘
```

---

## Implementation Approaches

### Option 1: Web Checkout (Next.js)

If you have a web-based checkout or receipt display:

```typescript
// In your receipt generation component
import { GetReceiptLoyaltyData } from '@/app/dashboard/actions/loyalty-receipt';

export async function generateReceipt(orderId: string, customerId: string, merchantId: string) {
  // 1. Get order data
  const order = await getOrder(orderId);

  // 2. Get loyalty data for receipt
  const loyaltyData = await GetReceiptLoyaltyData(customerId, merchantId);

  // 3. Build receipt with loyalty section
  const receipt = {
    orderNumber: order.order_number,
    items: order.items,
    total: order.total,
    // ADD LOYALTY SECTION HERE
    loyalty: {
      programs: loyaltyData.programs,
      hasRewards: loyaltyData.has_available_rewards,
      rewardsCount: loyaltyData.available_rewards_count,
      callToAction: loyaltyData.call_to_action
    }
  };

  return receipt;
}
```

### Option 2: POS Tablet (React Native)

Since the POS runs React Native, you'd call the same server action via API:

```typescript
// In React Native POS app
async function generateReceipt(orderId, customerId, merchantId) {
  try {
    // Call the server action via API endpoint
    const response = await fetch('/api/receipt/loyalty-data', {
      method: 'POST',
      body: JSON.stringify({ customerId, merchantId })
    });

    const loyaltyData = await response.json();

    // Add to receipt template
    const receipt = {
      ...orderData,
      loyalty: loyaltyData
    };

    return receipt;
  } catch (error) {
    console.error('Failed to fetch loyalty data:', error);
    // Return receipt without loyalty section if API fails
    return orderData;
  }
}
```

### Option 3: Create a Public API Endpoint

For POS integration, create an API route that wraps the server action:

**File:** `app/api/receipt/loyalty-data/route.ts`

```typescript
import { GetReceiptLoyaltyData } from '@/app/dashboard/actions/loyalty-receipt';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { customerId, merchantId } = await request.json();

    if (!customerId || !merchantId) {
      return NextResponse.json(
        { error: 'Missing customerId or merchantId' },
        { status: 400 }
      );
    }

    const loyaltyData = await GetReceiptLoyaltyData(customerId, merchantId);

    return NextResponse.json(loyaltyData);
  } catch (error) {
    console.error('[Receipt Loyalty API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch loyalty data' },
      { status: 500 }
    );
  }
}
```

Then call it from anywhere:

```typescript
const response = await fetch('/api/receipt/loyalty-data', {
  method: 'POST',
  body: JSON.stringify({ customerId, merchantId }),
  headers: { 'Content-Type': 'application/json' }
});
const loyaltyData = await response.json();
```

---

## Receipt Data Structure

The server action returns:

```typescript
{
  programs: [
    {
      program_id: "uuid",
      program_name: "Coffee Card",
      program_type: "punch_card",
      emoji: "☕",
      points_earned: 8,              // Points earned this order
      current_balance: 8,            // Total current balance
      progress_toward_reward: {
        amount: 8,                   // Current progress
        threshold: 9,                // Goal to reach
        points_remaining: 1          // How many more needed
      },
      rewards_available: 0,
      message: "1 more to your next reward!"
    },
    // ... more programs
  ],
  has_available_rewards: true,       // Customer has rewards to redeem
  available_rewards_count: 1,        // How many rewards available
  call_to_action: "Show your phone at checkout to redeem"
}
```

---

## Receipt Template Example

Here's what the actual receipt output should look like:

```
Order #1042                           01/15/2026
═════════════════════════════════════════════════
1x Cheeseburger              $12.99
1x Caesar Salad               $9.50
2x Iced Tea                   $5.98
─────────────────────────────────────────────────
Subtotal                     $28.47
Tax (8.25%)                   $2.35
═════════════════════════════════════════════════
Total                        $30.82
─────────────────────────────────────────────────
Paid: Card                   $30.82
Visa ending in 4242

═════════════════════════════════════════════════
          REWARDS SUMMARY
═════════════════════════════════════════════════
☕ Coffee Card: +1 punch (8/9)
   1 more to free coffee!

⭐ VIP Points: +18 pts (358)
   142 pts to next reward

═════════════════════════════════════════════════
🎁 You have 1 reward available!
   Show your phone at checkout to redeem.

═════════════════════════════════════════════════
Earn rewards → ask your server!
═════════════════════════════════════════════════
```

---

## Key Integration Points

### 1. When Order is Completed

**Pseudocode:**
```
ORDER COMPLETED
  ↓
FETCH LOYALTY DATA
  GetReceiptLoyaltyData(customerId, merchantId)
  ↓
BUILD RECEIPT
  Add loyalty section to receipt
  ↓
PRINT/DISPLAY RECEIPT
  ↓
SEND POST-VISIT SMS (optional)
  TriggerPostVisitSms(...) after 15 minutes
```

### 2. What Data You Need

To call `GetReceiptLoyaltyData()`, you need:

- **customerId** - UUID of the customer who placed the order
- **merchantId** - UUID of the merchant/restaurant

Both should be available from the order data.

### 3. Error Handling

Always have a fallback:

```typescript
try {
  const loyaltyData = await GetReceiptLoyaltyData(customerId, merchantId);
  receipt.loyalty = loyaltyData;
} catch (error) {
  console.warn('Could not fetch loyalty data, receipt without loyalty section');
  // Receipt still prints, just without loyalty section
}
```

---

## Testing

### Test Scenario 1: Customer with Loyalty Programs

1. Create a loyalty program
2. Enroll a customer
3. Create an order for that customer
4. Call `GetReceiptLoyaltyData(customerId, merchantId)`
5. Verify returns correct balance and progress

```typescript
const loyaltyData = await GetReceiptLoyaltyData(testCustomerId, testMerchantId);
console.log(loyaltyData);
// Should show:
// - programs array with this customer's enrolled programs
// - current balance for each program
// - progress toward next reward
```

### Test Scenario 2: Customer with Available Rewards

1. Manually add rewards to a customer
2. Call `GetReceiptLoyaltyData()`
3. Verify `has_available_rewards = true` and `available_rewards_count > 0`

### Test Scenario 3: Customer with No Programs

1. Create an order for a non-enrolled customer
2. Call `GetReceiptLoyaltyData()`
3. Verify returns empty programs array gracefully

---

## Current Status

| Component | Status | Location |
|-----------|--------|----------|
| ✅ Server Action | Complete | `app/dashboard/actions/loyalty-receipt.ts` |
| ✅ Receipt Preview | Complete | `app/dashboard/settings/receipt-templates/...` |
| ⏳ API Endpoint | Create as needed | `app/api/receipt/loyalty-data/route.ts` |
| ⏳ POS Integration | Depends on POS code | React Native app |
| ⏳ Web Checkout Integration | Depends on checkout page | Your checkout component |

---

## Next Steps

1. **Identify your receipt generation system**
   - Is it in Next.js web checkout?
   - Is it in React Native POS?
   - Is it a separate service?

2. **Create integration point**
   - Add call to `GetReceiptLoyaltyData()` at receipt build time
   - Or create API endpoint (Option 3 above)

3. **Add loyalty section to receipt template**
   - Loop through `loyaltyData.programs`
   - Format each program with emoji, name, progress
   - Show `call_to_action` if available

4. **Test end-to-end**
   - Place order as enrolled customer
   - Verify receipt shows correct loyalty info
   - Check formatting matches spacing/alignment

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Loyalty data is null/empty | Check if customer is enrolled in programs |
| Wrong balance showing | Verify `loyalty_transactions` table has data |
| API returns 404 | If using Option 3, ensure route file exists |
| Performance slow | Add caching with TanStack Query if called frequently |
| Receipt doesn't fit | Reduce font size or omit less-important programs |

