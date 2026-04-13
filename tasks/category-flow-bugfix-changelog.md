# Category Flow — Bug Fixes & Changes Changelog

**Commit:** `d495301` — "category flow"
**Author:** Haydar Saleh
**Date:** 2026-04-11

## Files Modified

- `supabase/migrations/20260410000000_fix_rpc_pricing_and_modifiers.sql` *(new)*
- `components/dashboard/menu/AddCategoryToMenuWizard.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/dashboard/menu/categories/page.tsx`
- `app/sites/components/ItemDetailsModal.tsx`
- `app/sites/components/MenuBrowser.tsx`
- `app/sites/hooks/useCart.ts`

---

## Changes by Category

### 1. Database RPC Bugs (Migration)

#### 1A. `get_menu_with_categories` — Broken price cascade for location-owned menus
**Bug:** Location-owned menus were skipping L5/L4/L2 in the effective price cascade and
only applying L3 (category price) + L1 (base price). The full 5-level cascade was only
running for global menus.

**Fix:** Rebuilt the function to apply the full price cascade (L5 → L4 → L3 → L2 → L1)
for ALL menu types — both global and location-owned menus.

#### 1B. `get_categories_for_location` — `modifier_groups` missing from item JSON
**Bug:** When fetching categories for a location, the item objects in the JSON response
did not include `modifier_groups`. This meant items loaded via this RPC had no modifier
data (e.g. on the storefront or tablet).

**Fix:** Added the same `modifier_groups` subquery used in `get_menu_with_categories` to
the `get_categories_for_location` function output.

---

### 2. Storefront — Wrong Price Shown (Online Ordering)

**Affected files:**
- `app/sites/components/MenuBrowser.tsx`
- `app/sites/components/ItemDetailsModal.tsx`
- `app/sites/hooks/useCart.ts`

**Bug:** All item prices on the public storefront (online ordering) were displaying and
using `item.price` (the card/POS price) instead of `item.delivery_price` (the online
delivery price). This caused incorrect prices in:
- Item cards in the menu browser
- Item detail modal header and suggestions list
- Cart total calculation

**Fix:**
- `MenuBrowser.tsx`: Replaced all `item.price.toFixed(2)` with `item.delivery_price.toFixed(2)` in `ItemCard` (all 4 card layout variants) and in the inline item buttons
- `ItemDetailsModal.tsx`: Used `item.delivery_price ?? item.price` in `calculateTotal()` and in price display (falls back to card price if delivery price not set)
- `useCart.ts`: Changed base price for cart line items to `item.delivery_price ?? item.price`

---

### 3. Category Filter Logic — AddCategoryToMenuWizard

**File:** `components/dashboard/menu/AddCategoryToMenuWizard.tsx`

**Bug:** The available categories filter used a complex decision tree branching on 6
combinations of `isMerchantOwner`, `isMerchantManager`, `isAllLocations`, `isGlobalMenu`,
and `isLocationMenu`. This was brittle and incorrect — location scope and role logic were
conflated, causing wrong categories to appear for some combinations.

**Fix:** Replaced the 6-branch tree with 3 clear rules driven by menu type alone:
- **Rule 1:** Global menus → only show global categories (regardless of role/location)
- **Rule 2:** Location menus + location selected → global + this location's categories only
- **Rule 2 (fallback):** Location menus + all locations → show all (admin view)
- **Rule 3:** Unknown menu type + location selected → global + location categories (defensive)

Also removed `isMerchantOwner` and `isMerchantManager` from the `useMemo` dependency
array as they are no longer used in the filter logic.

---

### 4. Item Form Sheet — Inline Edit Redirect & Section Cleanup

**File:** `components/dashboard/menu/NewEditItemFormSheet.tsx`

#### 4A. Added `onOpenGlobalEdit` prop
Items in some contexts (categories page, menu detail page) open in a read-limited inline
sheet when the item is global but the user is scoped to a location. Added an
`onOpenGlobalEdit?: () => void` prop that, when provided, is passed to `DisabledFieldBanner`
so users can click through to the full dedicated edit page
(`/dashboard/menu/items/[id]/edit`) directly from the banner.

#### 4B. Removed Sizes and Addons sections
Removed the **Sizes** (`ItemSizesManager`) and **Addons** (`ItemAddonsManager`) collapsible
sections from the inline form sheet. These sections belong on the dedicated item edit page
only and were causing confusion in the inline context. Also removed the unused `Ruler` and
`Package` icon imports and collapsed `sizes`/`addons` from `expandedSections` state.

---

### 5. Categories Page — Inline Edit → Full Edit Navigation

**Files:**
- `app/dashboard/menu/categories/page.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`

**Fix:** Both pages now pass `onOpenGlobalEdit` to `NewEditItemFormSheet`. When an item
is being edited in the inline sheet and the user clicks the "Open Global Edit" link in the
`DisabledFieldBanner`, the sheet closes and the router navigates to
`/dashboard/menu/items/[editingItem.id]/edit`.

The menu detail page additionally passes `isMenuLocationOwned={!!menu?.is_location_owned}`
which was previously missing.

---

### 6. AddItemToCategoryWizard — Missing Pricing Context

**File:** `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`

**Bug:** The `PriceInputGroup` inside the "create item" step of the wizard was not
receiving `pricingStrategy` or `dualPricingPercentage`. This caused the price input to
render without dual pricing awareness (e.g. cash price auto-calculation would not work
when dual pricing is enabled for the merchant).

**Fix:** Called `useEffectivePricing()` at the component level and forwarded
`pricingStrategy` and `dualPricingPercentage` to the `PriceInputGroup` component.

---

## Summary Table

| # | Area | Bug | Fix |
|---|------|-----|-----|
| 1A | DB RPC | Location-owned menus skip L2/L4/L5 price cascade | Rebuilt `get_menu_with_categories` to use full cascade for all menus |
| 1B | DB RPC | `modifier_groups` missing from `get_categories_for_location` item JSON | Added modifier_groups subquery to the function |
| 2 | Storefront | Online store shows card price instead of delivery price | Use `delivery_price` everywhere in `MenuBrowser`, `ItemDetailsModal`, `useCart` |
| 3 | Dashboard | Category filter uses wrong role+location combos | Simplified to 3 menu-type-based rules |
| 4A | Dashboard | No way to navigate from inline sheet to full edit page | Added `onOpenGlobalEdit` prop to `NewEditItemFormSheet` + `DisabledFieldBanner` |
| 4B | Dashboard | Sizes/Addons sections shown in wrong context | Removed from inline form sheet |
| 5 | Dashboard | `onOpenGlobalEdit` not wired up on categories/menu pages | Passed the callback from both pages |
| 6 | Dashboard | `PriceInputGroup` in AddItemToCategoryWizard unaware of dual pricing | Forward `pricingStrategy` + `dualPricingPercentage` from `useEffectivePricing` |
