# Sprint Plan: Stream C Device Registry Foundation

**Sprint focus date:** March 14, 2026  
**Scope:** Device registry Phase 1 schema foundation  
**Primary surfaces:** Supabase migrations, RLS, RPCs, admin helper views

## Summary

This ticket is a backend foundation ticket for physical device tracking.

It is not a billing ticket and it is not an iPOSPays ticket.

This pass should deliver the database layer required to:
- track every physical hardware unit
- track warehouse-to-merchant chain of custody
- track firmware/config changes
- track support and maintenance notes
- support safe lifecycle transitions through one RPC

## Repo Baseline

The repo already has `device_catalog` in `supabase/migrations/038_device_catalog.sql`.

That means this stream is not creating five new tables from scratch. In this repo, the normalized scope is:

1. Keep existing:
- `device_catalog`

2. Add:
- `device_inventory`
- `device_assignments`
- `device_config_history`
- `device_notes`

3. Add supporting database objects:
- `device_lifecycle_status` enum
- `assign_device(...)`
- `admin_device_inventory`
- `admin_device_summary`

## Locked Decisions

1. This ticket is schema-first only.
2. No admin UI is included in this pass.
3. No billing enforcement is included in this pass.
4. No iPOSPays work is included in this pass.
5. Existing `device_catalog` must be reused, not recreated.
6. RLS must use the repo's existing auth helpers, not a new auth model.

## In Scope

### Schema

1. Add `device_lifecycle_status`
2. Add `device_inventory`
3. Add `device_assignments`
4. Add `device_config_history`
5. Add `device_notes`
6. Add indexes and `updated_at` trigger coverage where appropriate

### Access Control

1. Enable RLS on new tables
2. HQ full access
3. Carrier read access to devices for their merchants
4. Merchant read access to their own devices

### Behavior Layer

1. Add `assign_device(...)`
2. Enforce valid state transitions
3. Create assignment audit rows atomically with inventory updates
4. Clear operational links automatically when recalled/retired

### Reporting Helpers

1. Add `admin_device_inventory`
2. Add `admin_device_summary`

## Out of Scope

1. Device registry admin pages
2. Bulk import UI
3. Billing tables and invoice logic
4. iPOSPays integration
5. Automatic linking from station/terminal/printer creation flows
6. Device activation subscription enforcement

## Repo-Safe Normalization

### 1. Reuse Existing `device_catalog`

Do not recreate `device_catalog`.

Use the existing table from `supabase/migrations/038_device_catalog.sql` and build around it.

### 2. Use Existing Auth Helpers

RLS should use:
- `is_dexapos_admin()`
- `get_my_carrier_id()`
- `is_merchant_admin(...)`

Do not introduce a second auth pattern based on `organization_members`.

### 3. Keep Operational Links Repo-Aligned

`device_inventory` should link to the existing operational tables:
- `stations`
- `payment_terminals`
- `printers`

Use one-link-only enforcement so a single physical device cannot be linked to multiple operational entities at once.

### 4. Keep Merchant Display Fields Repo-Aligned

Use actual repo merchant fields when building views.

Do not assume `m.business_name` exists in the live schema. Default to repo-safe merchant naming such as `merchants.name`.

## Phase 1 Objects

### Enum

- `public.device_lifecycle_status`

### Tables

- `public.device_inventory`
- `public.device_assignments`
- `public.device_config_history`
- `public.device_notes`

### RPC

- `public.assign_device(...)`

### Views

- `public.admin_device_inventory`
- `public.admin_device_summary`

## RLS Plan

### `device_catalog`

Do not widen current access unless explicitly approved later.

Existing repo behavior already limits catalog access to HQ. Preserve that.

### `device_inventory`

1. HQ: full CRUD
2. Carrier: read if device belongs to a merchant owned by that carrier
3. Merchant: read if device belongs to their merchant

### `device_assignments`, `device_config_history`, `device_notes`

Follow the same read scope as device inventory by joining through the device or merchant relationship.

## Acceptance Criteria

### Schema

1. The four new tables exist and reference repo tables correctly.
2. `device_catalog` remains intact and unchanged in role.
3. Operational link check constraint works.
4. Unique serial-per-catalog constraint works.

### RPC

1. Valid transitions succeed.
2. Invalid transitions fail with a clear error payload.
3. Assignment rows are written atomically with status updates.
4. Recalled/warehouse transitions clear operational links.

### RLS

1. HQ can fully manage the new tables.
2. Carrier can only read their merchants' devices.
3. Merchant can only read their own devices.
4. Cross-merchant access is blocked.

### Views

1. `admin_device_inventory` returns device + catalog + merchant + location context.
2. `admin_device_summary` returns grouped counts by category/model/status.

## Implementation Order

1. Create the migration for enum + tables
2. Add indexes and triggers
3. Add RLS policies
4. Add `assign_device(...)`
5. Add admin helper views
6. Validate with SQL test cases

