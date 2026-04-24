# Feature: Online Ordering + Payments

## Status

- feature status: `demo_mode`
- tokenization path: `working on legacy branch / secure branch path aligned`
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

Current interpretation:

- `payment_device_id = null` means the branch is still using the temporary legacy fallback key
- non-null `payment_device_id` means the branch is using the secure selected-device flow

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

## Storefront Access Control

Disabled storefronts are now blocked at the request layer.

Current behavior:

- if `online_store_config.is_active = false`, middleware returns `404`
- this applies to:
  - subdomain storefront access
  - custom-domain storefront access
  - direct `/sites/[slug]` access
- `app/sites/actions.ts` also treats inactive stores as not found as a server-side fallback

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

Whitelist automation:

- prefers `DEJAVOO_MANAGEMENT_API_KEY` when present
- otherwise falls back to `DEJAVOO_IPOS_API_KEY` for the external whitelist API header
- optional override:
  - `DEJAVOO_MANAGEMENT_API_URL`
  - `DEJAVOO_DEFAULT_ALLOWED_DOMAINS`

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

### Disabled-store middleware test

1. Turn a branch store off in admin.
2. Open the storefront by:
   - branch subdomain / `slug.localhost`
   - direct `/sites/[slug]`
   - custom domain if configured
3. Confirm request returns `404`.
4. Turn the branch back on.
5. Confirm storefront loads again.

### Tokenization troubleshooting note

If secure branch tokenization still fails with `FTD_013` after `process-online-payment` returns the correct:

- `payment_device_id`
- `tpn`
- `security_key`

then the remaining issue is consistent with Dejavoo-side origin/device/key registration, not a missing Dexa DB migration or missing `create-online-order` update.

### Whitelist synchronization note

Automatic whitelist sync now needs to preserve the existing/default allowed origins instead of replacing them with only the current store origin.

Current expected behavior:

- normalize the storefront URL to its browser origin
- merge that origin with:
  - any previously-synced device whitelist origins
  - default Dejavoo payment origins
  - any optional `DEJAVOO_DEFAULT_ALLOWED_DOMAINS`
- persist the merged list back into `location_payment_devices.whitelist_origins`
- update `location_payment_devices.whitelist_synced_at`

### Cancellation test

1. Place demo card order.
2. Let it cancel or cancel manually.
3. Confirm status becomes `void`.

## Known Limits

- live capture is still not the active path
- real refund flow is still deferred

## Related Docs

- `docs/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md`
- `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`

## Last Updated

- 2026-04-11
