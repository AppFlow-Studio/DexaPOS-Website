# TICKET 9: Receipt & Post-Visit Communication Implementation Guide

**Status:** ✅ Complete
**Ticket:** DEXA-LYL-009
**Priority:** Low (Phase 2)

---

## Overview

Implements loyalty information on receipts and post-visit SMS communication to customers. Provides a personalized receipt summary and automated opt-in SMS reminders after order completion.

## Features Implemented

### 1. Receipt Loyalty Integration

Receipts include a loyalty summary at the bottom:

```
─────────────────────────────
REWARDS SUMMARY
─────────────────────────────
☕ Coffee Card: +1 punch (8/9)
   1 more to free coffee!
⭐ VIP Points: +18 pts (358)
   142 pts to next reward

🎁 You have 1 reward available!
   Show your phone at checkout
   to redeem.
─────────────────────────────
```

**Server Action:** `GetReceiptLoyaltyData(customerId, merchantId)`

Returns:
- Program name and type
- Current balance for each program
- Progress toward next reward
- Available rewards count
- Call-to-action messages

### 2. Post-Visit SMS (Opt-In Only)

Customers who opted in receive an SMS 15 minutes after order completion:

```
Thanks for visiting Restaurant Name! ☕
You earned 1 punch today (8/9).
Just 1 more coffee to your FREE one!
Reply STOP to opt out.
```

**Features:**
- ✅ Opt-in tracking (customers.sms_opt_in)
- ✅ Rate limiting (max 1 SMS per customer per day)
- ✅ Minimum order amount check (don't send for small orders)
- ✅ SMS audit trail and delivery tracking
- ✅ Twilio integration for sending

---

## Implementation Details

### Server Actions

#### 1. `GetReceiptLoyaltyData(customerId, merchantId)`

Fetches loyalty data for receipt display.

```typescript
import { GetReceiptLoyaltyData } from "@/app/dashboard/actions/loyalty-receipt";

const loyaltyData = await GetReceiptLoyaltyData(customerId, merchantId);
// Returns: ReceiptLoyaltySummary with program info and progress
```

**Returns:**
```typescript
{
  programs: [
    {
      program_id: "uuid",
      program_name: "Coffee Card",
      program_type: "punch_card",
      emoji: "☕",
      points_earned: 8,
      current_balance: 8,
      progress_toward_reward: {
        amount: 8,
        threshold: 9,
        points_remaining: 1
      },
      rewards_available: 0,
      message: "1 more to your next reward!"
    }
  ],
  has_available_rewards: true,
  available_rewards_count: 1,
  call_to_action: "Show your phone at checkout to redeem"
}
```

#### 2. `SendPostVisitSms(request)`

Sends SMS after order completion (called by Edge Function).

```typescript
import { SendPostVisitSms } from "@/app/dashboard/actions/post-visit-sms";

const result = await SendPostVisitSms({
  customerId: "uuid",
  orderId: "uuid",
  merchantId: "uuid",
  orderAmount: 45.99,
  restaurantName: "Coffee Shop"
});
```

**Checks:**
- Customer SMS opt-in status
- Phone number availability
- Minimum order amount threshold
- Daily rate limit (1 SMS per day per customer)
- Loyalty earnings eligibility

#### 3. `CheckSmsRateLimit(customerId, merchantId)`

Checks if customer has already received SMS today.

```typescript
const { can_send, messages_sent_today } = await CheckSmsRateLimit(
  customerId,
  merchantId
);
```

#### 4. `LogSmsSent(customerId, merchantId, smsType, phone)`

Logs SMS for audit trail and rate limiting.

```typescript
await LogSmsSent(customerId, merchantId, "post_visit", "+1234567890");
```

---

## Database Schema

### New Table: `customer_sms_log`

Tracks all SMS sent to customers for rate limiting and audit trail.

```sql
customer_sms_log:
  - id: UUID (primary key)
  - customer_id: UUID (foreign key → customers)
  - merchant_id: UUID (foreign key → merchants)
  - sms_type: VARCHAR ('post_visit', 'post_visit_invite', etc.)
  - phone_number: TEXT (the actual phone number sent to)
  - message: TEXT (SMS content)
  - status: VARCHAR ('sent', 'delivered', 'failed', 'bounced')
  - provider_response: JSONB (Twilio response)
  - created_at: TIMESTAMP
  - updated_at: TIMESTAMP
```

**Indexes:**
- `customer_id` - for finding customer's SMS history
- `merchant_id` - for finding merchant's SMS logs
- `created_at` - for time-based queries
- `(customer_id, merchant_id, created_at DESC)` - for rate limit checking

### Modified Table: `customers`

Added `sms_opt_in` column (Boolean, default: false)

```sql
ALTER TABLE customers ADD COLUMN sms_opt_in BOOLEAN DEFAULT FALSE;
```

---

## Edge Function: `send-post-visit-sms`

**Trigger:** Called 15 minutes after order completion (scheduled via order webhook)

**Path:** `/supabase/functions/send-post-visit-sms/index.ts`

**Flow:**
1. Receives order completion event
2. Verifies customer SMS opt-in
3. Checks phone number availability
4. Validates minimum order amount
5. Checks daily rate limit
6. Gets loyalty earnings summary
7. Sends SMS via Twilio
8. Logs SMS for audit trail

**Environment Variables Required:**
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

---

## Integration Points

### 1. Order Completion Workflow

When an order is marked as completed:

```typescript
// In order completion handler
import { TriggerPostVisitSms } from "@/app/dashboard/actions/post-visit-sms";

// Option A: Immediate call (simpler)
await TriggerPostVisitSms(customerId, orderId, merchantId, orderAmount, restaurantName);

// Option B: Scheduled via Supabase scheduler
// Call Edge Function with 15-minute delay
// (Requires webhook setup in Supabase)
```

### 2. Receipt Template Integration

In receipt printing system:

```typescript
import { GetReceiptLoyaltyData } from "@/app/dashboard/actions/loyalty-receipt";

async function generateReceipt(orderId, customerId, merchantId) {
  const loyaltyData = await GetReceiptLoyaltyData(customerId, merchantId);

  // Add loyalty section to receipt
  receipt.addSection("REWARDS SUMMARY", {
    programs: loyaltyData.programs,
    has_available_rewards: loyaltyData.has_available_rewards
  });
}
```

### 3. Customer SMS Opt-In UI

Add to customer profile settings:

```typescript
// In customer profile edit form
<Checkbox
  label="Opt in to post-visit SMS rewards reminders"
  checked={customer.sms_opt_in}
  onChange={(checked) => {
    updateCustomer({ sms_opt_in: checked })
  }}
/>
```

---

## Rate Limiting & Safeguards

### 1. Daily SMS Limit

**Limit:** Max 1 SMS per customer per day per merchant

**Implementation:** Query `customer_sms_log` for today's date, check count

### 2. Minimum Order Amount

**Default:** No minimum (configurable per program with `min_order_to_earn`)

**Check:** Order amount >= `loyalty_programs.min_order_to_earn`

### 3. SMS Opt-In

**Default:** Opt-in disabled (customer must explicitly enable)

**Check:** `customers.sms_opt_in === true`

### 4. Phone Number Validation

**Requirement:** Customer must have valid phone number

**Check:** Phone number exists and is not empty

---

## Testing

### Unit Tests

```typescript
// Test GetReceiptLoyaltyData
const loyaltyData = await GetReceiptLoyaltyData(testCustomerId, testMerchantId);
expect(loyaltyData.programs.length).toBeGreaterThan(0);
expect(loyaltyData.has_available_rewards).toBe(true);

// Test SendPostVisitSms
const result = await SendPostVisitSms({
  customerId: testCustomerId,
  orderId: testOrderId,
  merchantId: testMerchantId,
  orderAmount: 50.00,
  restaurantName: "Test Restaurant"
});
expect(result.success).toBe(true);
expect(result.sms_sent).toBe(true);

// Test CheckSmsRateLimit
const { can_send } = await CheckSmsRateLimit(testCustomerId, testMerchantId);
// Should return false after first SMS, true after 24 hours
```

### Integration Tests

1. **SMS After Order:**
   - Place order
   - Wait 15 minutes
   - Verify SMS received (if opted in)
   - Verify logged in `customer_sms_log`

2. **Rate Limiting:**
   - Send SMS manually
   - Attempt to send another immediately
   - Verify second SMS blocked

3. **Opt-In:**
   - Disable SMS opt-in
   - Complete order
   - Verify no SMS sent
   - Re-enable opt-in
   - Verify SMS sent on next order

---

## Example Usage

### Send SMS on Order Completion

```typescript
// In order completion handler
import { SendPostVisitSms } from "@/app/dashboard/actions/post-visit-sms";

export async function CompleteOrder(orderId: string) {
  const order = await getOrder(orderId);
  const customer = await getCustomer(order.customer_id);
  const merchant = await getMerchant(order.merchant_id);

  // Mark order as completed
  await updateOrderStatus(orderId, "completed");

  // Send post-visit SMS (async, don't wait)
  SendPostVisitSms({
    customerId: customer.id,
    orderId: orderId,
    merchantId: merchant.id,
    orderAmount: order.total,
    restaurantName: merchant.name
  }).catch(err => console.error("SMS failed:", err));
}
```

### Display Receipt Loyalty Section

```typescript
function ReceiptLoyaltySection({ customerId, merchantId }) {
  const { data: loyaltyData } = useQuery({
    queryKey: ["receipt-loyalty", customerId, merchantId],
    queryFn: () => GetReceiptLoyaltyData(customerId, merchantId)
  });

  return (
    <div className="receipt-section">
      <h3>REWARDS SUMMARY</h3>
      {loyaltyData?.programs.map(program => (
        <div key={program.program_id}>
          <p>{program.emoji} {program.program_name}: {program.message}</p>
        </div>
      ))}
      {loyaltyData?.has_available_rewards && (
        <p>🎁 You have {loyaltyData.available_rewards_count} reward(s) available!</p>
      )}
    </div>
  );
}
```

---

## Troubleshooting

### SMS Not Sending

1. **Check Twilio credentials** - Verify `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
2. **Check customer opt-in** - Verify `customers.sms_opt_in = true`
3. **Check phone number** - Ensure valid phone format and not empty
4. **Check rate limit** - Verify not more than 1 SMS per day
5. **Check logs** - Query `customer_sms_log` to see delivery status

### Receipt Data Empty

1. **Verify customer enrolled** - Check `loyalty_transactions` exists
2. **Verify programs active** - Check `loyalty_programs.is_active = true`
3. **Check program visibility** - Verify program `location_ids` includes customer's location

---

## Future Enhancements

- [ ] Webhook integration for automatic Edge Function triggering
- [ ] Custom SMS templates per merchant
- [ ] A/B testing for SMS messaging
- [ ] SMS bounce handling and list management
- [ ] Multi-language SMS support
- [ ] WhatsApp/MMS support beyond SMS
- [ ] Email alternative to SMS
- [ ] SMS delivery analytics dashboard
