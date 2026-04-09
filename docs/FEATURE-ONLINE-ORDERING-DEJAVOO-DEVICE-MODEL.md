# Feature: Online Ordering Dejavoo Device Model

## Purpose

This document defines the missing payment-configuration layer for online ordering:

- a branch can have multiple Dejavoo/iPOS devices
- online ordering must use one explicit device configuration
- the storefront must always use a matched pair:
  - `TPN`
  - `FTD Ecom/TOP key`

This was not fully documented in the original online-ordering payment notes and became visible during branch-level testing.

## Problem

Current behavior mixes two different scopes:

- `TPN` is being treated as branch-specific
- `DEJAVOO_FTD_ECOM_KEY` is currently global

That works only if every branch uses the same device/key pair, which is not a safe assumption.

Failure mode:

- branch A works because the global FTD key belongs to branch A's device
- branch B fails even after updating its `TPN`
- domain whitelist can also appear inconsistent because whitelist updates are applied to one device while tokenization is still using another device's FTD key

Typical symptom:

- `FTD_013 Requested Origin is Not Registered`

## Correct Model

The system must distinguish between these levels:

1. Merchant
2. Branch / location
3. Payment device

For online ordering, each branch selects one payment device as its active online-ordering device.

That device owns:

- `TPN`
- `FTD Ecom/TOP key`
- Dejavoo domain whitelist entries

The storefront should not guess or mix devices. It should use the branch's selected online-ordering payment device only.

## Recommended Data Model

Minimum pragmatic model:

- `online_store_config.ipospays_tpn`
- `online_store_config.ipospays_ftd_ecom_key`
- optional `online_store_config.ipospays_device_label`
- optional `online_store_config.ipospays_device_id`

Better long-term model:

- separate branch payment-device table
- `online_store_config.online_ordering_payment_device_id` references the selected device

Example long-term shape:

```sql
create table public.location_payment_devices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  location_id uuid not null references public.locations(id),
  provider text not null default 'dejavoo',
  device_label text,
  tpn text not null,
  ftd_ecom_key text not null,
  is_active boolean not null default true,
  use_for_online_ordering boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Rules:

- one location can have many payment devices
- at most one active device should be marked `use_for_online_ordering = true`
- the storefront should always resolve to that one selected device

## Required Runtime Behavior

### `process-online-payment`

Current limitation:

- returns one global `DEJAVOO_FTD_ECOM_KEY`

Required behavior:

- receive `store_config_id`
- load the selected online-ordering device for that branch
- return that branch/device's FTD key as `security_key`

That means:

- branch A checkout uses branch A FTD key
- branch B checkout uses branch B FTD key

### `create-online-order`

Required behavior:

- charge using the same branch/device `TPN` that matches the FTD key used in tokenization

No cross-device mismatch is allowed.

### Domain whitelist

Whitelist must be applied to the same selected online-ordering device.

If a branch changes its online-ordering payment device, the system must:

1. save the new device's `TPN`
2. save the new device's `FTD key`
3. update whitelist for that same device
4. use that same device for tokenization and charging

## Admin UX Requirement

The admin flow should not ask only for a `TPN`.

It should support one of these:

1. Simple version
   - `TPN`
   - `FTD Ecom/TOP key`
   - optional label like `Front counter terminal`

2. Better version
   - list branch devices
   - choose one as `Use for online ordering`
   - surface current whitelist status

Minimum required admin fields:

- `TPN`
- `FTD Ecom/TOP key`

Without both values, branch-specific checkout is incomplete.

## Current Interim Workaround

Until per-branch FTD keys are implemented:

- only one branch/device can be reliably tested at a time with the global `DEJAVOO_FTD_ECOM_KEY`
- to test a different branch, temporarily replace the global FTD key with that branch's generated Ecom/TOP key

This is a test workaround only. It is not the correct production architecture.

## Localhost / Domain Notes

Dejavoo whitelist entries must use the origin only, not the full page path.

Correct:

- `http://ein-l-mirasi.localhost:3000`

Incorrect:

- `http://ein-l-mirasi.localhost:3000/checkout`

Even with the correct origin, tokenization still fails if the FTD key belongs to a different device than the selected branch `TPN`.

## Decision

Recommended next implementation:

1. add branch-level storage for `ipospays_ftd_ecom_key`
2. update admin UI to save both `TPN` and `FTD key`
3. update `process-online-payment` to return branch-specific FTD key
4. keep domain whitelist aligned to that same branch/device pair

## Related Files

- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `app/dashboard/online-ordering/actions.ts`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `docs/FEATURE-ONLINE-ORDERING-PAYMENTS.md`
- `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`

## Status

- documented
- not fully implemented yet

## Last Updated

- 2026-04-09
