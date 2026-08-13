# Single-Location Menu - Admin Web Core Scope

## Ticket

Single-location menu: remove `All Locations` / `Global` framing and write menu
edits to the merchant core.

Related Notion tickets:

- Admin Web: `3778280c-1b1d-81c3-ba2a-e179acbb9769`
- Backend modifier/recipe fast-follow: `3778280c-1b1d-814d-95b8-fb2153707145`
- POS framing follow-up: `3778280c-1b1d-81ff-acc3-c11496f8317e`

## Scope

- Website repository only.
- Merchant dashboard menu, item, category, modifier, recipe, and menu-schedule
  surfaces.
- Exactly one active, accessible location is treated as a single-location
  merchant.
- No POS application changes.
- No package or lockfile changes.
- No new database migration. The existing modifier/recipe RPC migration remains
  `supabase/migrations/20260606143000_single_location_global_modifier_recipe_rpcs.sql`.

## Contract

For a single-location merchant:

1. The dashboard does not present a location picker, `All Locations`, `Global`,
   location override, or cascade framing in the menu-management flow.
2. Menu structure, item, category, modifier, recipe, and display-order writes
   omit `location_id` where the shared contract uses `NULL` for the core/base.
3. Controls that are inherently physical-location operations, including stock,
   popular/new flags, and prep-station routing, resolve the one concrete active
   location through the gated-location hooks.
4. Multi-location merchants retain the existing global-versus-location controls
   and override behavior.

## Existing Foundation

The preview branch already contained the main single-location model:

- `stores/location-store.ts` exposes single-location and gated-location hooks.
- `app/dashboard/layout.tsx` keeps menu-management writes on the internal
  `all`/core scope for one-location merchants.
- Primary menu, item, and category screens already hid several top-level scope
  controls.
- The modifier/recipe RPC migration and nullable recipe caller were already in
  the repository.

## Website Completion Work

- Removed remaining single-location scope badges and wording from menu headers,
  settings, schedules, category views, item cards/lists/details, modifier lists,
  assignments, and recipe rows.
- Made modifier-library group reordering available in the single-location core
  view while preserving search and multi-location reorder guards.
- Combined modifier assignment counts and linked-item rendering into neutral
  single-location output.
- Made item/category creation, editing, deletion, availability, and ordering
  messages neutral for single-location merchants.
- Hid base-versus-location selectors in item and menu bulk price dialogs for
  single-location merchants and forced item bulk writes to use a `NULL`
  location ID.
- Kept physical location operations on the gated concrete location.

## Main Files

- `app/dashboard/menu/page.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/dashboard/menu/items/page.tsx`
- `app/dashboard/menu/items/[itemId]/page.tsx`
- `app/dashboard/menu/categories/page.tsx`
- `app/dashboard/menu/modifiers/page.tsx`
- `app/dashboard/menu/components/RecipeManager.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/AddCategoryToMenuWizard.tsx`
- `components/dashboard/menu/items/BulkPriceAdjustDialog.tsx`
- `components/dashboard/menu/items/BulkDeliveryPriceAdjustDialog.tsx`
- `components/dashboard/menu/menuId/*`
- `components/dashboard/menu/modifiers/*`
- `lib/menu/modifier-library-scope.ts`

## Verification

Automated:

- `npm test -- lib/menu/__tests__/modifier-library-scope.test.ts`
- `git diff --check`
- Targeted ESLint/parser check for changed menu files.

Repository-wide TypeScript validation currently has unrelated baseline failures;
those must not be reported as regressions from this ticket without a changed-file
match.

## Manual QA

### Single active location

1. Sign in as a merchant with exactly one active accessible location.
2. Open `/dashboard/menu`, `/dashboard/menu/items`,
   `/dashboard/menu/categories`, and `/dashboard/menu/modifiers`.
3. Confirm no location picker, `All Locations`, `Global`, or override framing is
   visible in normal pages, dialogs, filters, badges, tooltips, or toast copy.
4. Create and edit a menu, item, category, and modifier group; reload after each
   save and confirm persistence.
5. Reorder categories, category items, modifier groups, modifier options, and
   item-attached modifier groups; reload and confirm order persistence.
6. Assign a modifier to an item and category; confirm the neutral `Assigned`
   state and linked-item count.
7. Add, edit, and remove an item recipe; reload and confirm persistence.
8. Bulk-adjust item card and delivery prices; confirm no scope selector appears
   and the base values persist.
9. Toggle stock/86, popular/new, and prep-station routing; confirm those changes
   affect the one physical location.

### Multi-location regression

1. Sign in as a merchant with at least two active accessible locations.
2. Confirm the location picker, global/location filters, scope badges, and
   override controls remain visible.
3. Edit once in the global view and once in a selected location.
4. Confirm the selected-location override does not change sibling locations or
   the global base.

## Status

- Website implementation: complete in working tree.
- Automated targeted checks: complete.
- Single-location and multi-location manual QA: pending.
- POS ticket: intentionally not implemented in this repository.
- Database migration execution: intentionally not part of this branch.

