# HQ Menu Management Parity

Date: 2026-03-28

## Scope

This document tracks HQ admin feature parity for menu management only.

Explicitly out of scope for this document:

1. Bunny CDN migration
2. popup redesign and modal standardization
3. unrelated menu bug fixes

Related work tracked separately:

1. Bunny CDN migration: `docs/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`
2. popup redesign pilot: `docs/SPRINT-2026-03-28-HQ-CATEGORY-POPUP-PILOT.md`
3. broader popup inventory: `docs/SPRINT-2026-03-28-POPUP-STANDARDIZATION.md`

## Requirement

Updated requirement from product review:

1. HQ admins must be able to do everything merchant owner/admin users can do in menu management
2. this applies across menus, categories, and items

## Gap Review

### Category Form

HQ gap identified in:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`

Owner/admin already had:

1. category schedule assignment
2. location-specific category prep station default

HQ was missing both of those controls in the form UI.

### Item Form

HQ item form in:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`

Current review:

1. already includes pricing, availability, tax, stock, channels, modifiers, recipe, and location override handling
2. no immediate parity blocker found in this pass

### Menu Form

HQ menu form in:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`

Current review:

1. base menu create/edit is present
2. HQ schedule management already exists, but in a separate sheet:
   - `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx`
3. no immediate blocker was patched in this pass

## This Pass

Implemented for HQ category form:

1. availability schedule assignment UI
2. category-level prep station default UI for location views
3. HQ-specific prep station action layer with HQ permission checks

Files changed:

1. `app/manage/actions/admin-merchant/prep-stations.ts`
2. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`
3. `lib/queries/admin-keys.ts`

## Notes

This pass intentionally targets the missing HQ category capabilities first because that was the clearest mismatch with merchant owner/admin behavior.

## Remaining Review Item

Still needs follow-up validation:

1. location-specific schedule override controls inside the HQ category form are not part of this pass
2. if product requires exact parity there as well, they should be added in a separate follow-up under this same parity track
