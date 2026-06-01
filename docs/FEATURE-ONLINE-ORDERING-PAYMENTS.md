# Feature: Online Ordering Payments

## Status

- payment rail: `nmi_only`
- storefront tokenization: `active`
- online-order charge path: `active`
- legacy Dejavoo storefront path: `removed`

## Scope

This document describes the active storefront and QR payment path only.

It does not describe in-store terminal processing. Dejavoo references that still exist elsewhere in the repo are POS or historical artifacts, not the live online-ordering payment rail.

## Active Payment Architecture

Storefront and QR checkout now use NMI only.

Active flow:
- bootstrap payment config through `supabase/functions/process-online-payment/index.ts`
- tokenize browser card details through NMI Collect.js
- create and charge the order through `supabase/functions/create-online-order/index.ts`
- cancel / void / refund through `supabase/functions/cancel-online-order/index.ts`

Active source of truth:
- `public.location_payment_devices`
- `provider = 'nmi'`
- NMI public key in `provider_public_key`
- NMI private key in Vault via `provider_secret_id`

## What Is Working

### Storefront bootstrap

The storefront requests payment bootstrap from:

- `supabase/functions/process-online-payment/index.ts`

Expected response contract:
- `success`
- `provider: 'nmi'`
- `tokenization_key`
- `payment_device_id`

### Browser tokenization

Checkout uses NMI Collect.js in:

- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`

Browser output:
- `payment_token`
- card brand metadata
- last four when available

### Order charge path

The online-order edge function:

- validates the selected location device
- charges NMI before the order reaches kitchen-bound state
- stores the selected `payment_device_id`
- persists NMI results into `order_payments`

Main file:
- `supabase/functions/create-online-order/index.ts`

### Domain whitelist sync

Storefront origin syncing now uses the generic/NMI-safe path:

- `lib/online-store/payment-domain-whitelist.ts`
- `supabase/functions/storefront-payment-domain-whitelist/index.ts`

This path:
- computes storefront origins from slug and custom domain
- merges them with existing stored origins
- persists them into `location_payment_devices.whitelist_origins`

Supported env inputs for default allow-list origins:
- `STOREFRONT_PAYMENT_DEFAULT_ALLOWED_ORIGINS`
- `PAYMENT_DEFAULT_ALLOWED_ORIGINS`
- `NMI_DEFAULT_ALLOWED_ORIGINS`

There is no active Dejavoo env fallback in this path anymore.

## What Was Removed From The Active Storefront Path

- Dejavoo/iPOS storefront bootstrap
- Dejavoo FTD tokenization
- Dejavoo-specific whitelist function path
- Dejavoo merchant/device bootstrap assumptions for online ordering

## Main Files

Storefront:
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/PlaceOrderButton.tsx`

Edge functions:
- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/cancel-online-order/index.ts`
- `supabase/functions/storefront-payment-domain-whitelist/index.ts`

Admin / merchant save flows:
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`

Helpers:
- `lib/online-store/payment-domain-whitelist.ts`

## Deploy / Runtime Notes

Deploy these storefront-payment functions when promoting active payment changes:

- `process-online-payment`
- `create-online-order`
- `cancel-online-order`
- `storefront-payment-domain-whitelist`

Relevant env:
- `NMI_API_BASE_URL`
- `NMI_DEFAULT_ALLOWED_ORIGINS` if you want shared defaults
- `STOREFRONT_PAYMENT_DEFAULT_ALLOWED_ORIGINS` if you want an app-specific shared default list

## What Is Not In Scope Here

- in-store terminal processing
- POS Dejavoo hardware flows
- historical Dejavoo transaction columns in reporting tables

Those may still exist elsewhere in the repo and schema. They do not mean storefront/QR checkout still depends on Dejavoo.

## Last Updated

- 2026-05-28
