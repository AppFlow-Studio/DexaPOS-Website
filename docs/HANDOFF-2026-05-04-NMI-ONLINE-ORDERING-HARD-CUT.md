# NMI Online Ordering Hard Cut

## Summary
This change hard-cuts online-ordering payments from Dejavoo/iPOS to NMI for storefront checkout only.

In-store POS payment flows are intentionally untouched.

Key decisions:
- rollout is a hard cut, not dual-run
- credentials are location-device-scoped for online ordering
- synchronous NMI sale/void/refund responses are the source of truth
- reconciliation is supported as an on-demand admin action first
- the existing key names were preserved:
  - `nmiTokenizationKey`
  - `nmiPrivateApiKey`

## What This Replaces
Old online-ordering payment path:
- Dejavoo/iPOS device selection
- TPN-based bootstrap
- whitelist-domain flow
- location payment device dependency for storefront checkout

New online-ordering payment path:
- active location-scoped NMI payment device
- NMI browser tokenization key for checkout
- NMI private API key for server-side sale/void/refund
- no whitelist step
- storefront checkout resolves the selected active NMI device for the location

## What Was Implemented

### 1. Senior NMI device model adopted
Online ordering now uses the senior NMI schema already present in migrations.

Tables / columns in use:
- `public.location_payment_devices`
- `public.order_payments.payment_device_id`
- `public.sites.payment_device_id`
- `public.payment_credential_access_log`

SQL RPCs in use:
- `list_location_payment_devices(uuid)`
- `create_nmi_payment_device(uuid, text, text, boolean)`
- `activate_nmi_payment_device(uuid, text, text, text, text, text)`
- `get_storefront_payment_config(uuid)`
- `get_nmi_device_credentials(uuid)`

Design:
- the tokenization key is stored in `location_payment_devices.provider_public_key`
- the private NMI API/security key is stored in Vault and referenced by `location_payment_devices.provider_secret_id`
- the active online-ordering location device is the single source of truth for storefront checkout
- credential access is logged to `public.payment_credential_access_log`

Operational note:
- the current HQ form still captures only:
  - `nmiTokenizationKey`
  - `nmiPrivateApiKey`
- internal `provider_merchant_id` / `provider_gateway_id` fields are currently filled with stable placeholders so testing is not blocked

### 2. Storefront payment bootstrap
The `process-online-payment` edge function was repurposed to return NMI bootstrap config instead of Dejavoo device/bootstrap fields.

New response contract:
- `success`
- `provider: 'nmi'`
- `tokenization_key`
- `payment_device_id`

File:
- `supabase/functions/process-online-payment/index.ts`

### 3. Storefront card widget
The old client-side Dejavoo/FTD payment form was replaced with NMI React checkout.

Package added:
- `@nmipayments/nmi-pay-react`

Files:
- `package.json`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`

Behavior:
- checkout requests NMI bootstrap config
- NMI component tokenizes card details in-browser
- checkout stores the latest `payment_token`
- order submission sends `payment_token`
- `payment_token_id` is still accepted as a legacy alias during cutover

### 4. Online order charge flow
The online-order edge function now charges NMI synchronously before final order creation.

Files:
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/_shared/nmi.ts`

Implemented:
- `POST /api/v5/payments/sale`
- uses location device secret from `get_nmi_device_credentials`
- persists the selected `payment_device_id`
- persists NMI results into generic `order_payments` fields

Persisted fields include:
- `processor_name = 'nmi'`
- `payment_device_id`
- `transaction_id`
- `authorization_code`
- `auth_code`
- `reference_number`
- `card_type`
- `card_last_four`
- `result_code`
- `result_message`
- `gateway_fee`
- `metadata.provider = 'nmi'`

### 5. Cancel, void, and refund flows
Implemented NMI server-side reversal paths.

Files:
- `supabase/functions/cancel-online-order/index.ts`
- `lib/payments/nmi.ts`

Implemented endpoints:
- `POST /api/v5/payments/{transaction_id}/void`
- `POST /api/v5/payments/{transaction_id}/refund`
- `GET /api/v5/payments/{transaction_id}`

Behavior:
- unsettled payments use NMI void
- settled payments use NMI refund
- local payment/order state is updated after successful processor reversal

### 6. HQ admin settings
HQ online-store settings were updated to use NMI credentials instead of Dejavoo online-ordering fields.

Files:
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `lib/queries/use-admin-online-ordering.ts`
- `app/manage/merchants/[merchantId]/page.tsx`

Changed:
- active payment configuration fields are now:
  - `NMI Tokenization Key`
  - `NMI Private API Key`
- save flow now creates or activates the location's selected NMI online-ordering device
- old Dejavoo whitelist and merchant-id controls were removed from the active online-store UI path
- online store enable flow now validates the active location NMI device instead of Dejavoo readiness

### 7. Merchant dashboard cleanup
Merchant-facing online-ordering settings no longer carry Dejavoo/iPOS payment-device fields in their active data model.

Files:
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/dashboard/online-ordering/page.tsx`

Meaning:
- merchant dashboard still cannot edit payments
- payment credentials remain HQ-managed
- stale device/TPN fields were removed from the merchant storefront settings model

### 8. Reconciliation action
Added an on-demand HQ reconciliation action for NMI-backed order payments.

Files:
- `app/manage/actions/admin-merchant/online-payment-reconciliation.ts`
- `lib/queries/use-admin-online-ordering.ts`

Behavior:
- loads an NMI transaction by stored `transaction_id`
- updates local `order_payments` state from current processor status
- resolves credentials through `payment_device_id` or the order location fallback
- writes to `payment_credential_access_log`

## Removed or Disabled
- Dejavoo online-ordering bootstrap behavior
- Dejavoo whitelist requirement in the online checkout path
- Dejavoo/iPOS online-ordering edge function path
- orphaned old helper:
  - `supabase/functions/create-online-order/ipospays.ts`
- orphaned order actions:
  - `app/actions/orders/process-refund.ts`
  - `app/actions/orders/void-order.ts`

Dejavoo terminal/in-store code outside online ordering was not changed.

## Files Changed

### Added
- `docs/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.md`
- `lib/payments/nmi.ts`
- `supabase/functions/_shared/nmi.ts`
- `app/manage/actions/admin-merchant/online-payment-reconciliation.ts`

### Modified
- `app/actions/orders/process-refund.ts`
- `app/actions/orders/void-order.ts`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/actions/upload-merchant-logo.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `app/manage/merchants/[merchantId]/page.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `lib/queries/use-admin-online-ordering.ts`
- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `supabase/functions/cancel-online-order/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/process-online-payment/index.ts`

### Deleted
- `app/actions/orders/process-refund.ts`
- `app/actions/orders/void-order.ts`
- `supabase/functions/create-online-order/ipospays.ts`
- `supabase/functions/dejavoo-whitelist-domain/index.ts`
- `supabase/functions/dejavoo-whitelist-domain/deno.json`

## Validation Performed
- package install completed for `@nmipayments/nmi-pay-react`
- targeted TypeScript scan on the touched NMI/admin/storefront files returned no matches
- repo-wide `tsc` still has unrelated existing errors outside this workstream

Not performed yet:
- migration apply on staging
- edge-function deploy
- Next app redeploy
- real NMI sandbox checkout
- real refund/void test

## Remaining Gaps
These are still open:

1. Scheduled reconciliation job
- on-demand reconciliation exists
- scheduled reconciliation is not implemented yet

2. Staging rollout
- migration still needs to be applied
- functions still need deployment
- app still needs redeploy

3. Runtime verification
- no real sandbox sale/decline/refund/void test has been executed yet

## Rollout Steps
1. Confirm the senior NMI migrations are already present in the target environment:
   - `20260502212427_nmi_extend_payment_method_enum.sql`
   - `20260502212446_nmi_generalize_location_payment_devices.sql`
   - `20260502212532_nmi_refactor_dejavoo_rpcs.sql`
   - `20260502212611_nmi_device_lifecycle_rpcs.sql`
   - `20260502212621_nmi_link_payment_device_to_payments_and_sites.sql`
   - `20260502212634_nmi_create_customer_payment_methods.sql`
2. Deploy edge functions:
   - `process-online-payment`
   - `create-online-order`
   - `cancel-online-order`
3. Redeploy Next app
4. Configure the target location's NMI tokenization key and private API key in HQ
5. Run sandbox verification

## Detailed Test Runbook
Use one of the two locations that already has an online store request/setup path complete.

### 1. Pick the location to test
- choose one active online-store location
- prefer a non-production-test merchant/location if both are available
- only one location should be your active NMI checkout test target at a time

### 2. Decide what to do with existing keys
If the location already has NMI keys saved:
- open HQ online-ordering settings for that location
- replace both values:
  - `nmiTokenizationKey`
  - `nmiPrivateApiKey`
- save them together in the same action

Why:
- the tokenization key is the browser/frontend key
- the private API key is the server-side sale/refund/void key
- they must belong to the same NMI account/context
- in the current senior activation RPC, updating the tokenization key without also resupplying the private key is not supported

If the location has no NMI device yet:
- save both keys once
- this should create the location's active `nmi` payment device and activate it

### 3. Verify device creation/activation in SQL
Run:

```sql
select
  id,
  location_id,
  provider,
  provider_public_key,
  provider_secret_id,
  use_for_online_ordering,
  status,
  environment,
  provider_merchant_id,
  provider_gateway_id,
  is_active,
  updated_at
from public.location_payment_devices
where location_id = '<LOCATION_ID>'
order by updated_at desc;
```

Expected:
- one `provider = 'nmi'` row for the target location
- `use_for_online_ordering = true`
- `status = 'active'`
- `provider_public_key` populated
- `provider_secret_id` populated

### 4. Verify storefront bootstrap
Open the storefront checkout for that location and inspect the network call to:
- `process-online-payment`

Expected response:

```json
{
  "success": true,
  "provider": "nmi",
  "tokenization_key": "...",
  "payment_device_id": "..."
}
```

Expected meaning:
- `tokenization_key` is the browser-safe key used by the NMI React component
- `payment_device_id` is the active location device that the backend will also use for the private key

### 5. Verify card tokenization
This is directly related to the tokenization key.

What happens:
- `PaymentCardForm` mounts the NMI React component
- the component uses `tokenization_key`
- when the card fields are complete, it emits a `payment_token`
- checkout sends that `payment_token` to `create-online-order`

If tokenization fails:
- the issue is usually the frontend tokenization key, allowed environment, or NMI account/setup
- it is not the private API key yet

### 6. Run a successful website payment
Place a normal card order through the storefront.

After success, verify:

```sql
select
  id,
  order_id,
  payment_method,
  status,
  processor_name,
  payment_device_id,
  transaction_id,
  authorization_code,
  auth_code,
  reference_number,
  card_type,
  card_last_four,
  result_code,
  result_message,
  gateway_fee,
  metadata,
  created_at
from public.order_payments
where order_id = '<ORDER_ID>';
```

Expected:
- `processor_name = 'nmi'`
- `payment_device_id` populated
- `transaction_id` populated
- `card_last_four` populated
- `status = 'captured'` or equivalent paid state

### 7. Run a decline test
Use the sandbox/test scenario from your NMI account and place a payment expected to fail.

Expected:
- checkout shows a user-facing decline/failure
- no order is created
- no successful `order_payments` row is written for a captured payment

### 8. Run cancellation / reversal
Create a successful order, then cancel it while still pending.

Expected:
- `cancel-online-order` uses the same `payment_device_id` path
- unsettled payment should void
- settled payment should refund

Check:

```sql
select
  id,
  order_id,
  status,
  payment_status,
  cancelled_at,
  voided_at,
  void_reason,
  updated_at
from public.orders
where id = '<ORDER_ID>';
```

and

```sql
select
  id,
  order_id,
  status,
  is_voided,
  is_settled,
  refunded_at,
  voided_at,
  transaction_id,
  payment_device_id,
  result_code,
  result_message,
  metadata
from public.order_payments
where order_id = '<ORDER_ID>';
```

### 9. Run reconciliation
Use the HQ reconciliation action on the payment row.

Expected:
- current NMI transaction is fetched by `transaction_id`
- local `order_payments` row updates from the gateway response
- access is logged in `payment_credential_access_log`

Check:

```sql
select
  id,
  device_id,
  function_name,
  store_config_id,
  actor_user_id,
  called_at,
  metadata
from public.payment_credential_access_log
where function_name in (
  'process-online-payment',
  'create-online-order',
  'cancel-online-order',
  'reconcile-nmi-order-payment'
)
order by called_at desc
limit 50;
```

## Test Checklist
1. Admin save flow
- save `nmiTokenizationKey`
- save `nmiPrivateApiKey`
- confirm private key is not readable back
- confirm a location `nmi` payment device is active

2. Storefront bootstrap
- call `process-online-payment`
- confirm:
  - `provider = 'nmi'`
  - `tokenization_key` exists
  - `payment_device_id` exists

3. Tokenization
- NMI React component loads
- card details complete successfully
- checkout receives a `payment_token`

4. Checkout success
- tokenize card successfully
- submit order
- confirm order is created once
- confirm `order_payments.processor_name = 'nmi'`
- confirm `order_payments.payment_device_id` exists

5. Decline path
- declined card returns user-facing failure
- no order created

6. Cancel/void/refund
- unsettled cancel uses void
- settled reversal uses refund
- local order/payment state updates correctly

7. Reconciliation
- HQ reconciliation lookup succeeds
- local payment row updates correctly
- `payment_credential_access_log` row is written

8. Regression
- cash-in-store still works
- inactive store still blocks payment bootstrap
- merchant dashboard still cannot edit payment credentials
- in-store POS payment flows remain untouched

## Current Status
Implementation is largely complete for the hard cut and has been refactored to the senior location-device NMI model.

Not ready to call fully done yet because:
- scheduled reconciliation is still pending
- real sandbox payment verification still needs to be run end-to-end
