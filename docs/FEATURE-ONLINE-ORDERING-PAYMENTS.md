# Feature: Online Ordering + Payments

## Status

- feature status: `demo_mode`
- tokenization path: `working`
- secure credential model: `implemented`
- live processor capture: `still deferred`

## What Is Working

### Embedded checkout bootstrap

The storefront initializes Dejavoo checkout through:

- `supabase/functions/process-online-payment/index.ts`

Current behavior:

- resolves the branch from `store_config_id`
- resolves the selected online-ordering payment device for that location
- decrypts the FTD key from Supabase Vault
- returns:
  - `security_key`
  - `payment_device_id`
  - `tpn`

### Checkout validation

The checkout page blocks empty or incomplete card submits before tokenization.

Main file:

- `app/sites/components/checkout/CheckoutPage.tsx`

### Tokenization metadata

Checkout sends:

- `payment_token_id`
- `payment_device_id`
- `payment_card_type`
- `payment_card_last_four`

That lets backend keep the selected device and card-display metadata aligned.

### Order creation path

`create-online-order` currently remains in demo/fake-success sale mode, but it now:

- resolves the same payment device used during checkout
- validates that the device belongs to the same location
- stores payment-device metadata with the order payment record

Main file:

- `supabase/functions/create-online-order/index.ts`

### Cancellation behavior

Current expected behavior:

- demo card order cancellation -> `void`
- cash order cancellation -> `cancelled`

## What Is Not Live Yet

Live Dejavoo sale capture is still not the active path.

Reason:

- sandbox processor sale attempts previously returned `91 / HOST NO RESPONSE`

So the current objective is:

- keep the flow realistic
- keep tokenization/device pairing correct
- keep order/payment metadata correct
- keep cancellation behavior correct

## Secure Credential Model

Payment secrets are no longer meant to live on `online_store_config`.

The secure source of truth is now:

- `public.location_payment_devices`

The FTD key is stored in:

- Supabase Vault

The UI only stores it through:

- `public.upsert_location_payment_device(...)`

The UI does not read the secret back.

Detailed architecture:

- `docs/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md`

## Main Files

Storefront:

- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/components/checkout/PaymentCardForm.tsx`

Edge functions:

- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/create-online-order/ipospays.ts`
- `supabase/functions/cancel-online-order/index.ts`

Merchant dashboard:

- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`

HQ admin:

- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`

Database:

- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`

## Deploy / Migration Steps

### Database

Run:

- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`

This creates:

- `location_payment_devices`
- `payment_credential_access_log`
- secure RPCs
- Vault-backed migration of any existing plaintext FTD keys

### Edge functions

Redeploy:

- `process-online-payment`
- `create-online-order`

### Required secrets

Still required in Supabase:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DEJAVOO_IPOS_API_KEY`
- `DEJAVOO_IPOS_SECRET_KEY`

Legacy fallback still supported:

- `DEJAVOO_FTD_ECOM_KEY`

Whitelist automation only if available:

- `DEJAVOO_MANAGEMENT_API_KEY`
- `DEJAVOO_MANAGEMENT_API_URL`

## How To Test

### Merchant/HQ config test

1. Open the branch online-ordering settings.
2. Enter:
   - `TPN`
   - matching `FTD Ecom/TOP key`
3. Save.
4. Confirm the page reloads and the FTD field no longer shows the saved key.
5. Confirm the whitelist action uses the selected device TPN.

### Checkout test

1. Open the storefront checkout page.
2. Confirm `process-online-payment` returns `200`.
3. Confirm response includes:
   - `security_key`
   - `payment_device_id`
4. Enter demo card details.
5. Confirm tokenization succeeds.
6. Place order.
7. Confirm order is created and payment metadata includes:
   - card type
   - last 4
   - payment device id / TPN in metadata

### Cancellation test

1. Place demo card order.
2. Let it cancel or cancel manually.
3. Confirm status becomes `void`.

## Known Limits

- automatic whitelist still depends on the Dejavoo Management API key
- live capture is still not the active path
- real refund flow is still deferred

## Related Docs

- `docs/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md`
- `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`

## Last Updated

- 2026-04-09
