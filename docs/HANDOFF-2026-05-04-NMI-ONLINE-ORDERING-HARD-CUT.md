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
The old client-side Dejavoo/FTD payment form was replaced with NMI Collect.js inline tokenization.

Files:
- `package.json`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/components/checkout/PlaceOrderButton.tsx`

Behavior:
- checkout requests NMI bootstrap config
- Collect.js tokenizes card details in-browser
- inline hosted fields are limited to:
  - card number
  - expiration
  - CVV
- checkout stores the latest `payment_token`
- order submission sends `payment_token`
- `payment_token_id` is still accepted as a legacy alias during cutover

Why:
- the `@nmipayments/nmi-pay-react` embedded component path produced runtime compatibility issues in this Next/Turbopack app
- Collect.js removed the Apple Pay / Google Pay initialization problems and gave a stable tokenization path

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

Important runtime corrections:
- NMI v5 payment calls for this merchant flow use:
  - host: `https://secure.nmi.com`
  - header: `Authorization: <privateApiKey>`
- this merchant is in NMI Test Mode; that is not the same thing as using `sandbox.nmi.com`
- the sale payload was reduced to the minimum working shape:
  - `amount`
  - `currency`
  - `industry: 'ecommerce'`
  - `payment_details.payment_token`
- Dexa remains the source of truth for tip breakout:
  - order/payment rows still store tip separately
  - NMI receives only the final total charge amount
  - no separate tip field is sent to NMI

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
- senior NMI location-device schema and RPCs were verified as already present on staging
- edge functions were deployed:
  - `process-online-payment`
  - `create-online-order`
  - `cancel-online-order`
- Next app was redeployed locally for test iteration
- Collect.js tokenization completed successfully in storefront checkout
- a real NMI test-mode website payment succeeded end-to-end
- Dexa `order_payments` amount matched the NMI transaction amount
- NMI dashboard showed the same:
  - amount
  - card brand
  - last four
- targeted TypeScript checks on touched NMI files were clean enough for this workstream

Known unrelated repo state:
- repo-wide `tsc` still has unrelated existing errors outside this workstream
- browser console may still show:
  - `Could not create PaymentRequestAbstraction. Please verify the provided options are valid.`
  - this did not block successful tokenization or successful sale processing in the current Collect.js flow

## Remaining Gaps
These are still open:

1. Scheduled reconciliation job
- on-demand reconciliation exists
- scheduled reconciliation is not implemented yet

2. Runtime coverage
- success path is verified
- decline path still needs explicit testing
- void/refund path still needs explicit testing

3. Payload enrichment
- the current working sale payload is intentionally minimal
- optional NMI fields should be reintroduced one group at a time only if needed:
  - tip
  - billing address
  - order details
  - merchant defined fields

4. Key rotation
- multiple test keys were exposed in local terminal output and screenshots during debugging
- rotate those NMI keys after validation is complete

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
3. Ensure edge-function env uses:
   - `NMI_API_BASE_URL=https://secure.nmi.com`
4. Redeploy Next app
5. Configure the target location's NMI tokenization key and private API key in HQ
6. Put the merchant account in NMI Test Mode
7. Run verification checkout

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
- `tokenization_key` is the browser-safe key used by Collect.js
- `payment_device_id` is the active location device that the backend will also use for the private key

### 5. Verify card tokenization
This is directly related to the tokenization key.

What happens:
- `PaymentCardForm` loads `https://secure.nmi.com/token/Collect.js`
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

Verified successful example:
- `order_id = '6053288a-4a0d-48cf-ab9b-5a378c503cb2'`
- HTTP response from `create-online-order` returned `success: true`
- Dexa stored amount matched NMI dashboard amount
- NMI dashboard showed matching Visa last four

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
- Collect.js inline fields load
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
Implementation is complete enough to process live test-mode storefront payments and is refactored to the senior location-device NMI model.

Working now:
- HQ can save location-scoped NMI keys
- storefront bootstrap returns NMI config
- Collect.js tokenizes successfully
- `create-online-order` charges and creates the order successfully

Still to finish:
- decline validation
- void/refund validation
- optional metadata/tip reintroduction if required

Not ready to call fully done yet because:
- scheduled reconciliation is still pending
- real sandbox payment verification still needs to be run end-to-end

## Cancel / Void Status
Current code status:
- implemented in `supabase/functions/cancel-online-order/index.ts`
- customer or timeout cancellation is supported only while the order is still `pending`
- card payments on NMI follow this branch:
  - not settled: NMI `void`
  - settled: NMI `refund`
- local persistence is updated through:
  - `apply_refund_to_payment`
  - `orders.status`
  - `orders.payment_status`
  - `orders.cancelled_at`
  - `orders.voided_at` when the reversal is a void
- storefront caller already exists:
  - `app/sites/order-actions.ts`

What still needs to happen:
- run a real cancel test on a freshly placed pending online order
- confirm the NMI dashboard shows a void for unsettled payments
- confirm Dexa order/payment rows move to the expected state

Conclusion:
- this is not a greenfield implementation anymore
- it is a runtime validation task unless the first real cancel test exposes a defect

## Next NMI Workstream: SaaS Subscription Billing
This is the next planned NMI-related workstream after online ordering.

Business goal:
- bill merchants monthly for Dexa SaaS using:
  - base monthly location fee
  - per-extra-station fee
  - 4% card surcharge when billing by card
- allow ACH or NMI customer-vault card token as the payment method

Status:
- not implemented
- schema is not in place
- should live in separate billing tables, not `public.invoices`

### Scope
Billing base tables:
- `merchant_subscriptions`
- `subscription_invoices`
- `subscription_invoice_sequences`

Service-catalog tables:
- `billable_services`
- `merchant_subscription_services`

Legacy compatibility:
- `subscription_plans` remains in place as a compatibility layer / placeholder
- `SERVICE_CATALOG` is the internal fallback plan code for service-based subscriptions

New edge functions:
- `billing-generate-monthly-invoices`
- `billing-charge-subscription`
- `billing-mark-paid`
- `billing-handle-failure`
- `billing-suspend-overdue`

New surfaces:
- merchant UI: `/dashboard/billing`
- HQ UI: `/hq/billing`

### Reuse from current NMI work
Reuse points from the online-ordering NMI implementation:
- `supabase/functions/_shared/nmi.ts`
- location/device-based NMI auth patterns where relevant
- idempotency and payment result persistence patterns from `create-online-order`

Billing-specific existing dependency:
- `merchant_billing_profiles`
- expected to hold the merchant billing method and the NMI vault token / ACH selection

Current architecture decision:
- Dexa is the billing source of truth
- NMI is the charge processor
- NMI recurring may help with future automation, but it is not the primary source of truth for:
  - which services are enabled
  - quantity changes
  - tiered pricing math
  - invoice composition

### Required business lock-ins before schema work
Temur needs to lock these before implementation starts:
- base monthly price per location
- per-extra-station price
- card surcharge percentage
- ACH discount rule, if any
- trial length
- carrier-tier pricing rules

### Recommended implementation order
Phase 1: schema + RPCs + HQ manual subscription creation
- create the billing base tables
- add the service-catalog tables
- add RLS
- add helper RPCs for:
  - create/update per-location subscription container
  - list billable services
  - replace service assignments for a location subscription
  - fetch current subscription
  - fetch merchant invoices
- do not build automatic charging yet

Phase 2: invoice generation + manual run path
- implement invoice-number sequencing
- generate immutable monthly invoice rows from assigned services + quantities
- keep station-count snapshot only as supporting metadata
- add manual HQ trigger first before cron

Phase 3: charging through NMI
- charge using the merchant billing profile payment method
- card path:
  - use NMI vault token as the payment source
  - authenticate with the location's active NMI device key
  - apply surcharge
- ACH path:
  - no card surcharge
- use idempotent invoice charge attempts

Phase 4: failure lifecycle
- mark invoice `failed`
- increment attempt counters
- retry on configured retry windows
- transition subscription:
  - `active` -> `past_due` -> `suspended`
- restore after successful repayment

Phase 5: merchant billing UI
- current subscription state
- enabled services for the location
- invoice history
- paid / failed / past-due status

Phase 6: HQ billing UI
- create and edit per-location service assignments
- manually generate invoices
- manually retry charge
- manually mark paid
- manually suspend / restore / cancel

### Pricing and invoice math
Current service catalog:
- `pos_tablet`
  - pricing model: `tiered`
  - `$50/mo` first, `$39/mo` each additional
- `kds`
  - pricing model: `per_unit`
  - `$25/mo` per device
- `loyalty`
  - pricing model: `flat`
  - `$75/mo`
- `online_ordering`
  - pricing model: `flat`
  - `$100/mo`
- `orderout`
  - pricing model: `flat`
  - `$79.99/mo`

Current quantity source:
- HQ manual assignment per location
- this is intentional for the first service-catalog implementation
- future automation can replace manual quantities where a stable system source exists

Line-item math now depends on the service pricing model:

```text
flat:
  subtotal = base_price_monthly

per_unit:
  subtotal = quantity * base_price_monthly

tiered:
  subtotal = base_price_monthly + max(0, quantity - included_quantity) * additional_unit_price

card_surcharge = (subtotal * surcharge_pct / 100) if billing_method = 'card' else 0
total_amount = subtotal + card_surcharge
```

Historical rule:
- invoice rows are immutable
- service quantities are snapshotted into invoice line items at invoice-generation time
- station count remains supporting metadata only

### Cron plan
- monthly invoice generation: 1st of month, 02:00 ET
- past-due retry pass 1: 3rd of month, 04:00 ET
- past-due retry pass 2: 7th of month, 04:00 ET
- suspension sweep: 14th of month, 03:00 ET

### Audit chain
Every state transition should write `audit_logs` rows with `action_category = 'billing'`.

Required actions:
- `subscription_created`
- `subscription_plan_changed`
- `invoice_generated`
- `invoice_charged`
- `invoice_payment_failed`
- `subscription_suspended`
- `subscription_restored`
- `subscription_canceled`

### Acceptance targets
- invoice generation is correct for 1, 2, and 3 stations
- surcharge math is correct:
  - `(base + station_overage) * 1.04 = total`
- NMI test-mode subscription charge succeeds end-to-end
- `past_due -> retry -> suspended` lifecycle works
- successful payment after suspension restores service
- merchant can see invoice history
- HQ has manual override and manual charge controls

### Practical starting point
Start with:
1. finalize pricing decisions with Temur
2. write schema migration for the 4 new billing tables
3. add HQ-only manual subscription creation
4. add manual invoice generation before any cron or automatic charging

### Implemented foundation in this pass
Files added:
- `supabase/migrations/20260507150000_subscription_billing_phase1.sql`
- `app/manage/actions/subscription-billing.ts`
- `supabase/functions/billing-generate-monthly-invoices/index.ts`
- `supabase/functions/billing-charge-subscription/index.ts`
- `supabase/functions/billing-mark-paid/index.ts`
- `supabase/functions/billing-handle-failure/index.ts`
- `supabase/functions/billing-suspend-overdue/index.ts`

What is implemented now:
- new billing tables:
  - `subscription_plans`
  - `merchant_subscriptions`
  - `subscription_invoices`
  - `subscription_invoice_sequences`
- RLS and HQ/manual management policies
- placeholder plan seed data:
  - `STANDARD`
  - `PRO`
  - `FRANCHISE`
- pricing math RPC:
  - `calculate_subscription_amounts(...)`
- station snapshot RPC:
  - `get_active_station_count(...)`
- HQ/manual RPCs:
  - `list_subscription_plans()`
  - `upsert_subscription_plan(...)`
  - `upsert_merchant_subscription(...)`
  - `list_merchant_subscriptions(...)`
  - `list_subscription_invoices(...)`
  - `generate_subscription_invoice_number(...)`
  - `generate_subscription_invoice(...)`
- billing audit helper:
  - `log_subscription_billing_event(...)`
- HQ server actions:
  - fetch plans
  - fetch merchant subscriptions
  - upsert merchant subscription
  - generate invoice manually
  - list merchant invoices
- edge-function foundation:
  - monthly/manual invoice generation
  - manual mark-paid
  - failure handler -> `past_due`
  - overdue suspension sweep

What is intentionally still not implemented:
- ACH debit execution
- merchant billing UI
- HQ billing automation / cron wiring

Billing charge status update:
- `supabase/functions/billing-charge-subscription/index.ts` is now implemented for
  manual HQ charging of card-based subscription invoices
- current behavior:
  - accepts `invoice_id`
  - resolves the invoice, subscription, and merchant billing profile
  - supports `billing_method = 'card'` only
  - uses the location's active NMI device private API key for authentication
  - uses `merchant_billing_profiles.card_token` as the NMI vault-token payment source
  - charges the full `subscription_invoices.total_amount`
  - marks invoice `processing -> paid` on success
  - marks invoice `processing -> failed` on failure
  - moves the subscription to `past_due` on failure
  - restores `past_due` / `suspended` subscriptions back to `active` on successful payment
  - writes billing audit events for both charge success and charge failure
- current limitation:
  - ACH remains unimplemented and returns an explicit unsupported-method error

HQ manual billing UI update:
- `components/billing/SubscriptionBillingAdminCard.tsx` now includes a manual
  `Charge` button for card invoices in `open` or `failed` status
- this calls `billing-charge-subscription` through
  `app/manage/actions/subscription-billing.ts`
- intended immediate validation flow:
  1. create subscription
  2. generate invoice
  3. click `Charge`
  4. verify invoice becomes `paid`
  5. verify audit log entry

Current pricing placeholders:
- `STANDARD`: $50.00 base, 1 included station, $79 extra station, 4% card surcharge
- `PRO`: $99.00 base, 2 included stations, $79 extra station, 4% card surcharge
- `FRANCHISE`: $149.00 base, 3 included stations, $79 extra station, 4% card surcharge

Important implementation decision:
- placeholders are in `subscription_plans`
- final pricing should be changed by updating plan rows, not by rewriting invoice math
