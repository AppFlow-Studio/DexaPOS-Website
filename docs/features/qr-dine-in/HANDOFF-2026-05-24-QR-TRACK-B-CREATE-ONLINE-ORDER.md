# QR Track B Handoff: `create-online-order`

This note summarizes the Track B work already completed for the QR dine-in project so another developer can continue without re-reading the full ticket thread.

## Scope covered

This handoff covers only the dependency slice from the Track B ticket that Track A needed first:

- `QR-6` Extend `create-online-order` for table binding
- `QR-7` Auto-fire vs accept-gate wiring

Everything else in the Track B ticket is still open.

## Files changed

- `supabase/functions/create-online-order/index.ts`

## What changed

### 1. QR-bound session detection

The edge function now detects a QR-bound session if the loaded `online_order_sessions` row contains any of:

- `table_qr_code_id`
- `floor_plan_object_id`
- `table_label`

This allows the checkout path to recognize QR dine-in without inventing a separate session model.

### 2. QR-specific validation

The edge function now rejects QR checkout when:

- `order_type = 'qr_dine_in'` but the session is not QR-bound
- `online_store_config.accepts_dine_in` is `false`
- `online_store_config.qr_kill_switch` is `true`
- customer phone is missing
- `pay_cash_in_store = true` for QR dine-in

This keeps QR aligned with the project rules:

- pay-before-kitchen
- single payer
- no cash-in-store QR flow

### 3. Fulfillment order type split

The function now separates:

- the **shared order-engine fulfillment type**
  - still `pickup` or `delivery`
- the **QR dine-in identity**
  - applied after the shared order RPC returns

Reason:

- the existing `process_online_order(...)` engine was not built to create `qr_dine_in` directly
- the QR identity is patched onto the `orders` row after creation

### 4. QR service fee passthrough

The function now reads:

- `online_store_config.qr_service_fee_pct`

and includes that as a surcharge in the order total.

This is currently passed through the existing `p_surcharge` input into `process_online_order(...)`.

### 5. Customer upsert by phone

Added customer normalization and upsert behavior:

- normalize phone
- look up existing customer by `merchant_id + phone`
- update existing customer if found
- insert new customer if not found

Then link the result to:

- `online_order_sessions.customer_id`
- `orders.customer_id`

This is the start of the `D5` customer dedupe requirement from the QR ticket.

### 6. Order binding after shared RPC

After `process_online_order(...)` returns a created order, the function now updates the `orders` row with:

- `orders.online_session_id = session.id`
- `orders.order_type = 'qr_dine_in'`
- `orders.table_number = session.table_label`

This is the key Track B dependency that Track A needed available.

### 7. Auto-accept rewired

The function no longer relies on the legacy `p_auto_accept` shortcut inside `process_online_order(...)`.

New behavior:

1. create the order first
2. capture payment
3. if `auto_accept_orders = true`
   - call `accept_online_order(order_id)` explicitly

This matches the QR project rule:

- payment first
- accept is kitchen pacing only

### 8. Important follow-up fix

After the first pass, one real bug was found:

- `online_order_sessions.order_type` still has a legacy database check constraint allowing only:
  - `pickup`
  - `delivery`

So the session update was corrected to keep:

- `online_order_sessions.order_type = pickup|delivery`

and **not** write:

- `qr_dine_in`

The QR identity is now carried on the **order row**, not forced into the session row.

This avoids breaking checkout on the current schema.

## What this maps to in the ticket

### `QR-6`

Covered in code, locally:

- QR-bound session accepted
- `orders.table_number` patched from session label
- `orders.online_session_id` bound
- customer upsert/dedupe started
- QR service fee included
- payment-before-kitchen flow preserved

Still needs staging verification before it can be marked done.

### `QR-7`

Covered in code, locally:

- explicit post-payment `accept_online_order(...)`
- pending state preserved when auto-accept is off
- no reliance on the old auto-accept shortcut

Still needs staging verification before it can be marked done.

## What is not done yet

None of these were implemented in this handoff:

- `QR-32` payment-domain whitelist
- `QR-9` funnel event emission
- `QR-25` digital receipt trigger
- `QR-9c` guest-alert broadcast wiring
- `QR-8` abandoned-cart QR tagging
- any storefront work
- any dashboard work

## Related Track A work already authored

These exist locally and are relevant to the overall QR project state:

- `supabase/migrations/20260522120000_qr_w1_schema.sql`
- `supabase/migrations/20260522120500_qr_w1_primary_color_default_blue.sql`
- `supabase/migrations/20260522133000_qr_w2_status_and_guest_alert_rpcs.sql`
- `docs/features/qr-dine-in/PLAN-2026-05-22-QR-DINE-IN-TRACK-A.md`

Track A still has a hard blocker on:

- `QR-5` HMAC secret handoff from Temur

That blocks:

- `resolve_table_qr(...)`
- the real QR scan bootstrap flow

## Validation completed

Local only:

- targeted TypeScript syntax check on `supabase/functions/create-online-order/index.ts`
- result: `syntax-ok`

Not completed:

- staging deploy
- staging QR checkout test
- acceptance-criteria verification for `QR-6`
- acceptance-criteria verification for `QR-7`

## Required next steps for the next developer

1. Deploy `create-online-order`

```bash
npx supabase@latest functions deploy create-online-order --project-ref dfwqakoyittmrwbqvxgw
```

2. Validate on staging:

- QR-bound checkout creates an order
- `orders.order_type = 'qr_dine_in'`
- `orders.table_number` matches the scanned table label
- `orders.online_session_id` is set
- customer is deduped by phone
- QR service fee is applied correctly
- `auto_accept_orders = true` fires `accept_online_order(...)`
- `auto_accept_orders = false` leaves order `pending`
- declined/retry path does not duplicate order or kitchen fire

3. After that, continue with:

- `QR-32`
- `QR-9`
- `QR-25`

in that order, unless the Track A secret blocker is cleared first and the team wants to resume the full scan flow.

## Checklist status recommendation

For the Track B ticket:

- `QR-6` = **in progress**
- `QR-7` = **in progress**
- everything else = still open
