# Saucy POS Menu Sync Investigation

Date: 2026-06-10

Owner: Ali Dika

## Ticket

POS menu sync reports success, but a newly created category and the new item inside it do not appear on the tablet for Saucy.

## Finding

Confirmed root cause in the website dashboard create flow.

When the merchant creates a category from the dashboard and selects a menu, the UI passes `menu_id` into `CreateCategory`, but the server action only:

1. validates that the menu exists
2. inserts into `categories`

It does not create the required `menu_categories` join row.

The POS sync path resolves menu content through `get_menu_with_categories`, and that RPC builds categories from `menu_categories`. A category that exists in `categories` but is not attached in `menu_categories` will never appear in the synced menu payload. Its item can exist in `menu_items` and `category_items` and still remain invisible because the parent category is excluded first.

## Why Sync Still Shows Success

This is not a sync transport failure. The sync can complete successfully while returning a payload that simply does not include the new category, because the menu resolution layer considers that category unattached.

## Code Evidence

Affected create flow:

1. `components/dashboard/menu/CategoryFormSheet.tsx`
2. `app/dashboard/actions/categories.ts`

Resolver path:

1. `supabase/migrations/20260604183502_modifier_display_order.sql`
2. `supabase/migrations/20260430120000_fix_pos_full_sync_search_path_regression.sql`

Relevant behavior:

1. `CategoryFormSheet` passes `menu_id` during create.
2. `CreateCategory` previously ignored that `menu_id` after validation.
3. `get_menu_with_categories` reads categories from `menu_categories`, not directly from `categories`.

## Fix Applied

Updated `app/dashboard/actions/categories.ts` so that when `menu_id` is provided during category creation, the action immediately attaches the new category to that menu through `AddCategoryToMenu`.

If the menu attachment fails, the create flow now:

1. logs the failure
2. rolls back the just-created category when possible
3. returns an explicit error instead of silently succeeding

## Expected Result After Fix

1. Create a category from the dashboard while selecting a menu.
2. The new category is inserted into `categories` and attached in `menu_categories`.
3. Create a new item inside that category.
4. POS sync pulls the menu again.
5. The category and item now appear on the tablet because `get_menu_with_categories` can resolve them.

## Manual QA

Use Saucy or any multi-location merchant with a tablet-bound location:

1. In the dashboard, create a brand new category while selecting the active menu.
2. Create a brand new item inside that category.
3. Confirm in DB or admin tools that:
   - a `categories` row exists
   - a `menu_categories` row exists for the selected menu
   - a `category_items` row exists for the new item/category pair
4. On the POS tablet, tap Sync.
5. Open the menu and verify the new category and item are visible.

Regression checks:

1. Create a category without selecting a menu and confirm it remains unattached by design.
2. Create a category on a location-specific menu and confirm it attaches correctly there as well.

## Validation Notes

I ran a repository-wide `npx tsc --noEmit` pass after the change. The repo has many pre-existing unrelated type errors, so it is not currently a clean validation signal for this ticket. No new issue from this change was identified in that pass.
