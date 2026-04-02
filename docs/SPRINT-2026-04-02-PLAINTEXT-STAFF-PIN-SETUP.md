# April 2, 2026: Plaintext Staff PIN Setup

## Scope

This pass is separate from:

- Bunny CDN work
- popup redesign work
- HQ transactions / product responsiveness work

It covers the new staff PIN model:

1. move readable PIN storage to `location_members.pin_plain`
2. stop writing new values into the legacy hashed-only path
3. surface the PIN in merchant staff details instead of showing it only in a toast
4. keep POS login working for both new plaintext PINs and legacy hashed PINs during transition

## Merchant Dashboard Staff UI

Files:

- `components/dashboard/staff/StaffDetailSheet.tsx`
- `components/dashboard/staff/LocationAssignmentSheet.tsx`
- `components/dashboard/staff/StaffPinField.tsx`

Changes:

- Added a reusable PIN field with:
  - masked display by default
  - eye icon to reveal / hide
  - generate new PIN action beside the field
- Added the field to:
  - main staff detail view (primary location PIN)
  - per-location assignment sheet (location-specific PIN)
- Reset success toast still appears, but it no longer includes the PIN itself.

## Merchant Staff Server Actions

File:

- `app/dashboard/actions/unified-staff.ts`

Changes:

- New staff creation now stores readable PINs in `location_members.pin_plain`
- PIN reset now stores readable PINs in `location_members.pin_plain`
- Bulk PIN reset now stores readable PINs in `location_members.pin_plain`
- Clerk invite / direct-create metadata now carries plaintext PINs for webhook provisioning
- `pin_hashed` is cleared when a new PIN is generated
- `pin_code` is temporarily mirrored for compatibility with older paths still being phased out

## HQ Staff Server Actions

File:

- `app/manage/actions/admin-merchant/staff.ts`

Changes:

- HQ-created staff now store readable PINs in `location_members.pin_plain`
- HQ-created Clerk staff with POS access now store readable PINs in `location_members.pin_plain`
- HQ PIN reset RPC results remain unchanged, but the underlying storage is now plaintext

## Database / RPC Layer

Migration:

- `supabase/migrations/20260402_plaintext_staff_pins.sql`

Changes:

- Adds `pin_plain` and `pin_hashed` columns to `location_members`
- Backfills existing `pin_code` rows into:
  - `pin_plain` for 4-6 digit readable PINs
  - `pin_hashed` for legacy bcrypt values
- `get_unified_staff_view()` now exposes the revealable PIN through the existing `pin_code` payload field, sourced from `pin_plain` first
- `admin_get_unified_staff_view()` does the same
- `admin_reset_staff_pin()` now stores readable PINs in `pin_plain`
- `admin_bulk_reset_pins()` now stores readable PINs in `pin_plain`
- The website-side migration does not redefine the POS RPC yet.
- `pos_staff_login_v2` must be patched in a follow-up POS-aligned migration by
  cloning the current `pos_staff_login_v2(...) RETURNS json` contract and only
  changing the PIN lookup to support:
  - `pin_plain` values for newly updated records
  - `pin_hashed` values for older records still waiting to be regenerated
  - temporary `pin_code` fallback during transition

## Legacy Hashed PINs

Old hashed PINs cannot be reversed and displayed.

Behavior:

- if a staff member still has a legacy hashed PIN, the new field shows it as unavailable
- the UI tells the operator to generate a new PIN
- once regenerated, the new PIN is stored in `pin_plain` and becomes revealable in staff details

## Copy Updates

Files:

- `components/dashboard/staff/StaffDataTable.tsx`
- `app/manage/merchants/[merchantId]/components/PinResultDialog.tsx`
- `app/manage/merchants/[merchantId]/components/BulkPinResetDialog.tsx`

Changes:

- removed outdated "displayed once" / "cannot be retrieved later" copy where it no longer matches the new storage model
