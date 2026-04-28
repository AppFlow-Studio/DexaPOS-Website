# Feature: Online Ordering Dejavoo Device Model

## Purpose

This document defines the production payment-device layer for online ordering.

The key rule is:

- a branch can have many Dejavoo devices
- online ordering must use exactly one selected device
- that same selected device must be used for:
  - FTD tokenization
  - domain whitelist
  - downstream charge/void flow

## Why This Exists

The old implementation mixed scopes:

- `TPN` was branch-specific
- `DEJAVOO_FTD_ECOM_KEY` was global or stored in plaintext on `online_store_config`

That causes device mismatch:

- tokenization can use one device key
- charge/whitelist can target another device TPN

Typical symptom:

- `FTD_013 Requested Origin is Not Registered`

## Secure Model

### Data boundaries

- `TPN` is not treated as a secret
- `FTD Ecom/TOP key` is treated as a payment secret
- the FTD key is stored in Supabase Vault, not in a client-readable table column

### Main table

The secure source of truth is now:

- `public.location_payment_devices`

Important columns:

- `merchant_id`
- `carrier_id`
- `location_id`
- `device_label`
- `tpn`
- `ftd_ecom_key_secret_id`
- `is_active`
- `use_for_online_ordering`
- `last_synced_from_crm_at`

### One active online-ordering device per location

This is enforced in the database with a partial unique index:

- at most one row per location can have:
  - `use_for_online_ordering = true`
  - `is_active = true`

So the app cannot accidentally select multiple devices for the same branch.

## Runtime Flow

### 1. Admin saves payment config

Merchant dashboard and HQ admin both collect:

- `TPN`
- `FTD Ecom/TOP key`

They do not write the key directly to `online_store_config`.

Instead they call:

- `public.upsert_location_payment_device(...)`

That RPC:

- authorizes the caller
- stores or rotates the key in Vault
- upserts the device row
- marks it as the selected online-ordering device
- keeps `online_store_config.ipospays_tpn` in sync for compatibility

### 2. Checkout initializes payment

Storefront calls:

- `supabase/functions/process-online-payment/index.ts`

That function:

- receives `store_config_id`
- resolves `location_id`
- loads the selected row from `location_payment_devices`
- decrypts the FTD key from `vault.decrypted_secrets`
- returns:
  - `security_key`
  - `payment_device_id`
  - `tpn`

It also writes a credential-access audit row to:

- `public.payment_credential_access_log`

### 3. Checkout places order

Storefront now sends the selected device id with the order request:

- `payment_device_id`

`supabase/functions/create-online-order/index.ts` re-resolves the device by:

- exact `payment_device_id` if provided
- otherwise selected device for the location

That prevents tokenization on one device and charge metadata on another.

## Admin UX Rules

The UI still looks simple for now:

- enter `TPN`
- enter `FTD Ecom/TOP key`

But the behavior changed:

- the FTD key is written once
- after save, the UI reloads and does not show the key again
- the field becomes a rotation field only

Displayed back to the user:

- `TPN`
- readiness state
- whether a key is configured

Never displayed back:

- decrypted FTD key

## Whitelist Alignment

Whitelist should always use the selected device TPN.

Current code path:

- dashboard/admin whitelist actions resolve the selected device
- then call the Dejavoo whitelist function for that device TPN

Current whitelist credential path:

- automatic whitelist uses the standard `DEJAVOO_IPOS_API_KEY`
- no separate management API key is required for the intended flow

## Backward Compatibility

This implementation keeps a temporary compatibility path:

- `online_store_config.ipospays_tpn` still exists and is kept in sync
- `DEJAVOO_FTD_ECOM_KEY` can still act as a legacy fallback in `process-online-payment`

But the intended secure path is:

- selected device row
- Vault secret
- server-side secret resolution

The old plaintext `ipospays_ftd_ecom_key` values are migrated into Vault and nulled during migration.

## Current Verification State

What has been verified in the app:

- secure branches now return a non-null `payment_device_id` from `process-online-payment`
- selected device row, selected branch `TPN`, Vault secret, and `process-online-payment` response can be verified as aligned
- older branches may still show `payment_device_id = null` if they are using the temporary legacy fallback key

What that means:

- when a secure branch still returns `FTD_013 Requested Origin is Not Registered`, the remaining issue is no longer explained by the app-side branch/device lookup
- the remaining issue is consistent with Dejavoo-side device/key/origin registration in the same environment

## Related Storefront Access Guard

Storefront access control now also has a request-layer guard:

- inactive `online_store_config` branches are blocked in `middleware.ts`
- subdomain, custom-domain, and direct `/sites/[slug]` access should all return `404` for disabled stores

This is related because the public branch URL is now treated as a first-class runtime boundary:

- payment device selection is branch-specific
- branch storefront access is also enforced branch-specifically

## New Database Objects

Migration:

- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`

Main objects created:

- `public.location_payment_devices`
- `public.payment_credential_access_log`
- `public.list_location_payment_devices(uuid)`
- `public.upsert_location_payment_device(uuid, text, text, text, boolean)`

## Files To Read

Architecture:

- `docs/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md`

Practical payment flow:

- `docs/FEATURE-ONLINE-ORDERING-PAYMENTS.md`

Database:

- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`

Storefront init:

- `supabase/functions/process-online-payment/index.ts`

Order placement:

- `supabase/functions/create-online-order/index.ts`

Merchant dashboard save/load:

- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`

HQ admin save/load:

- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`

## Test Checklist

1. Run the migration.
2. Redeploy:
   - `process-online-payment`
   - `create-online-order`
3. Open merchant dashboard or HQ admin.
4. Save a branch `TPN` plus matching `FTD Ecom/TOP key`.
5. Confirm the page reload no longer shows the FTD key in plaintext.
6. Retry checkout on that branch.
7. Confirm `process-online-payment` returns a `payment_device_id`.
8. Confirm `create-online-order` receives and logs the same device id.

## Status

- secure device model implemented
- Vault-backed secret storage implemented
- selected payment-device resolution implemented
- checkout now passes `payment_device_id`
- order creation re-resolves the same device

## Last Updated

- 2026-04-11
