# Category & Menu Flow — Bug Fixes & Changes Changelog

---

## Part 3 — Category & Menu Structure

**Commit:** `d495301` — *"category flow"*
**Author:** Haydar Saleh
**Date:** 2026-04-11

### Files Modified

- `supabase/migrations/20260410000000_fix_rpc_pricing_and_modifiers.sql` *(new)*
- `supabase/migrations/20260410230224_remote_schema.sql` *(patched — see §1C)*
- `components/dashboard/menu/AddCategoryToMenuWizard.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/dashboard/menu/categories/page.tsx`
- `app/sites/components/ItemDetailsModal.tsx`
- `app/sites/components/MenuBrowser.tsx`
- `app/sites/hooks/useCart.ts`

---

### 1. Database RPC Bugs (Migration)

#### 1A. `get_menu_with_categories` — Broken price cascade for location-owned menus

**Bug:** Location-owned menus were skipping L5/L4/L2 in the effective price cascade and
only applying L3 (category price) + L1 (base price). The full 5-level cascade was only
running for global menus.

**Fix:** Rebuilt the function to apply the full price cascade (L5 → L4 → L3 → L2 → L1)
for ALL menu types — both global and location-owned menus. This rebuild also laid the
foundation for L4 (global menu category pricing) introduced in Part 5.

#### 1B. `get_categories_for_location` — `modifier_groups` missing from item JSON

**Bug:** When fetching categories for a location, the item objects in the JSON response
did not include `modifier_groups`. This meant items loaded via this RPC had no modifier
data (e.g. on the storefront or tablet).

**Fix:** Added the same `modifier_groups` subquery used in `get_menu_with_categories` to
the `get_categories_for_location` function output.

#### 1C. `20260410230224_remote_schema.sql` — Migration blocking on staging

**Bug:** The remote schema migration file contained `DROP POLICY` and `CREATE INDEX` /
`CREATE UNIQUE INDEX` statements without `IF EXISTS` / `IF NOT EXISTS` guards. When
staging already had those policies or indexes, the migration failed with "already exists"
or "does not exist" errors, blocking all subsequent migrations.

**Fix:** Patched the file in-place using `sed` to add:
- `IF EXISTS` to all `DROP POLICY` statements
- `IF NOT EXISTS` to all `CREATE INDEX` statements
- `IF NOT EXISTS` to all `CREATE UNIQUE INDEX` statements

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

### Summary Table

| # | Area | Bug | Fix |
|---|------|-----|-----|
| 1A | DB RPC | Location-owned menus skip L2/L4/L5 price cascade | Rebuilt `get_menu_with_categories` to use full cascade for all menus |
| 1B | DB RPC | `modifier_groups` missing from `get_categories_for_location` item JSON | Added modifier_groups subquery to the function |
| 1C | DB Migration | Remote schema file blocks staging migrations | Added `IF EXISTS` / `IF NOT EXISTS` guards via patch |
| 2 | Storefront | Online store shows card price instead of delivery price | Use `delivery_price` everywhere in `MenuBrowser`, `ItemDetailsModal`, `useCart` |
| 3 | Dashboard | Category filter uses wrong role+location combos | Simplified to 3 menu-type-based rules |
| 4A | Dashboard | No way to navigate from inline sheet to full edit page | Added `onOpenGlobalEdit` prop to `NewEditItemFormSheet` + `DisabledFieldBanner` |
| 4B | Dashboard | Sizes/Addons sections shown in wrong context | Removed from inline form sheet |
| 5 | Dashboard | `onOpenGlobalEdit` not wired up on categories/menu pages | Passed the callback from both pages |
| 6 | Dashboard | `PriceInputGroup` in AddItemToCategoryWizard unaware of dual pricing | Forward `pricingStrategy` + `dualPricingPercentage` from `useEffectivePricing` |

---

---

## Part 4 — 5-Level Price Cascade Hierarchy UI

**Author:** Haydar Saleh
**Date:** 2026-04-13

### Files Modified

- `lib/menu/cascade-labels.ts`
- `components/dashboard/locations/PriceInputGroup.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`

---

### Overview

The 5-level price cascade is:

| UI Level | Scope | Storage |
|----------|-------|---------|
| L1 | Global item base | `menu_items` |
| L2 | Global category base | `category_items WHERE menu_id IS NULL` |
| L3 | Branch category base | `location_category_item_overrides` |
| L4 | Global menu category base | `category_items WHERE menu_id IS NOT NULL` |
| L5 | Branch menu category base | `location_menu_item_overrides` |

The goal of this work was to make the form sheet always show the full cascade ladder above the current editing level, and to make L4 discoverable in both global-menu and branch-menu contexts.

---

### 1. Cascade Labels Module

**File:** `lib/menu/cascade-labels.ts`

A single source of truth for all merchant-facing wording about pricing scope. Merchants should never see the word "Level" in the UI — all copy routes through this module.

**Exports:**
- `scopeLabel(ctx)` — short label for headers/badges (e.g. `"Morning Rush menu – Burgers"`)
- `affectsLabel(ctx)` — blast-radius label for Save buttons (e.g. `"Morning Rush menu – Burgers, all locations"`)
- `scopeDescription(ctx)` — verbose tooltip/banner text
- `scopeShortName(level)` — one-word name per level (Global, Global Category, Branch Category, Global Menu, Branch Menu)
- `scopeIcon(level)` — Lucide icon per level (Globe, Tag, Building2, BookOpen, Layers)
- `scopeColor(level)` — Tailwind color classes per level (emerald → violet → blue → amber → rose)
- `priceSourceToLevel(src)` — maps DB `price_source` string to a `CascadeLevel`
- `deriveScopeFromContext(args)` — derives a `ScopeContext` from location-store + URL signals

---

### 2. PriceInputGroup — Dual Pricing Loop Fix

**File:** `components/dashboard/locations/PriceInputGroup.tsx`

**Bug:** When editing a price at L5 (branch menu override), changing the cash price would
trigger a reverse-calculation that overwrote the existing card price. This caused an
infinite card↔cash recalc loop for items that already had a card price set.

**Fix:** The reverse-calculation (cash → card) now only runs when the card price is empty
or zero — i.e. only during initial entry of a new override, not when editing an existing one.

```typescript
// Only reverse-calc card from cash when card is empty/zero (new item entry).
// If the user already has a card price set, editing cash should NOT overwrite it.
if (isDual && !disabled && num !== null && (!price || price === 0)) { ... }
```

---

### 3. Item Form Sheet — Hierarchy Visibility & L4 Data

**File:** `components/dashboard/menu/NewEditItemFormSheet.tsx`

#### 3A. `PriceLevels` interface — Added L4 fields

```typescript
level_3_menu_category: number | null;           // UI L4: Global menu category price
level_3_menu_category_cash?: number | null;
level_3_menu_category_delivery?: number | null;
```

#### 3B. `PriceBreakdown` row visibility — Three fixes

**L2 row (Global Category):**

Previously hidden in global-menu context: `{categoryId && !(menuId && isAllLocations) && ...}`

Fixed to always show when a category is present: `{categoryId && ...}`

**Rationale:** L2 is always a prior-level baseline for both L4 and L5 contexts. Hiding it
meant users had no visual anchor when editing menu-scoped prices.

**L3 row (Branch Category):**

Previously hidden in global-menu context: `{categoryId && !isAllLocations && ...}`

Fixed to show in menu context too: `{categoryId && (!isAllLocations || menuId) && ...}`

**Rationale:** When browsing the menu globally (All Locations + Menu), branch overrides
still exist per-location and need to be visible in the cascade ladder.

**L4 row (Global Menu Category):**

Previously hidden in L5 context (branch menu): `{menuId && categoryId && isAllLocations && ...}`

Fixed to show in both L4 and L5 contexts: `{menuId && categoryId && ...}`

Also corrected the data source: L4 row now reads from `level_3_menu_category` instead of
`level_3_category` (which is L2's field). Without this fix the L4 row was displaying the
L2 price as if it were an L4 override.

#### 3C. `getPriceForContext` — Updated cascade for cases 4 and 5

**Case 4 (Global Menu Category — L4):**
```typescript
price: levels?.level_3_menu_category  // L4 own value
    ?? levels?.level_3_category        // fall back to L2
    ?? levels?.level_1_base            // fall back to L1
    ?? editItem.effective_price
    ?? editItem.price,
```

**Case 5 (Branch Menu Category — L5):**
```typescript
price: levels?.level_5_location_menu   // L5 own value
    ?? levels?.level_3_menu_category   // fall back to L4
    ?? levels?.level_4_location_category // fall back to L3
    ?? levels?.level_3_category         // fall back to L2
    ?? levels?.level_1_base             // fall back to L1
    ?? editItem.effective_price
    ?? editItem.price,
```

---

### 4. Menu Page — `mapMenuCategoryItemToEdit` Updated

**File:** `app/dashboard/menu/[menuId]/page.tsx`

`mapMenuCategoryItemToEdit` now populates the three new L4 fields from `price_levels`:

```typescript
level_3_menu_category:          priceLevels.level_3_menu_category          ?? null,
level_3_menu_category_cash:     priceLevels.level_3_menu_category_cash     ?? null,
level_3_menu_category_delivery: priceLevels.level_3_menu_category_delivery ?? null,
```

The L2 fields were also corrected — they now read from `priceLevels.level_3_category`
(the RPC-returned value) rather than from `item.custom_price` directly, which previously
conflated L4 data (returned as `custom_price` from the menu JOIN) with L2.

---

### Summary Table

| # | Area | Bug | Fix |
|---|------|-----|-----|
| 1 | UI Labels | No consistent naming/color system for cascade levels | Created `cascade-labels.ts` as single source of truth |
| 2 | PriceInputGroup | Dual pricing cash→card recalc loop on L5 edits | Guard reverse-calc to new items only |
| 3A | Form Sheet | `PriceLevels` interface missing L4 fields | Added `level_3_menu_category_*` fields |
| 3B | Form Sheet | L2 hidden in L4 context; L3 hidden in menu context; L4 hidden in L5 context | Fixed three visibility conditions |
| 3C | Form Sheet | `getPriceForContext` didn't include L4 in cascade | Updated cases 4 and 5 with L4 fallback |
| 4 | Menu Page | `mapMenuCategoryItemToEdit` not populating L4 price fields | Added `level_3_menu_category_*` from `price_levels` |

---

---

## Part 5 — L4 Global Menu Category Pricing — Database & RPC

**Author:** Haydar Saleh
**Date:** 2026-04-13

### Files Modified

- `supabase/migrations/20260413000000_add_menu_id_to_category_items_l4_pricing.sql` *(new)*
- `supabase/migrations/20260413010000_fix_reset_l4_protects_l2.sql` *(new)*
- `supabase/migrations/20260413020000_fix_upsert_rpc_l4_correct_types.sql` *(new)*
- `supabase/migrations/20260413030000_drop_old_category_items_unique_constraint.sql` *(new)*
- `app/dashboard/actions/menu-items-rpc.ts`

> All migrations in this part were pushed to **staging only**
> (project `dfwqakoyittmrwbqvxgw` / `dexaposwebsite-preview` branch).

---

### Background

L4 (Global Menu Category pricing) stores a price for a specific item in a specific menu
globally (all locations). It lives alongside the L2 global category price in the same
`category_items` table, differentiated by whether `menu_id` is NULL (L2) or set (L4).

Before this work, `category_items` had no `menu_id` column, there was no RPC branch for
L4, and the upsert function had a silent fallthrough that returned success without writing
anything.

---

### 1. Schema — Add `menu_id` to `category_items`

**Migration:** `20260413000000`

```sql
ALTER TABLE public.category_items
  ADD COLUMN IF NOT EXISTS menu_id uuid REFERENCES public.menus(id) ON DELETE CASCADE;
```

Two partial unique indexes replace the old single unique constraint:

```sql
-- L2: one row per (item, category), no menu
CREATE UNIQUE INDEX IF NOT EXISTS category_items_item_cat_nomenu_idx
  ON public.category_items (menu_item_id, category_id) WHERE menu_id IS NULL;

-- L4: one row per (item, category, menu)
CREATE UNIQUE INDEX IF NOT EXISTS category_items_item_cat_menu_idx
  ON public.category_items (menu_item_id, category_id, menu_id) WHERE menu_id IS NOT NULL;
```

---

### 2. `get_menu_with_categories` — Expose L4 Price Fields

**Migration:** `20260413000000`

Added a second LEFT JOIN on `category_items` aliased as `ci_menu` to fetch the
menu-specific L4 row alongside the global L2 row (`ci`):

```sql
LEFT JOIN category_items ci_menu
    ON ci_menu.menu_item_id = ci.menu_item_id
    AND ci_menu.category_id = ci.category_id
    AND ci_menu.menu_id = m.id
```

`price_levels` now returns separate L4 fields:
```json
"level_3_menu_category":          ci_menu.custom_price,
"level_3_menu_category_cash":     ci_menu.custom_cash_price,
"level_3_menu_category_delivery": ci_menu.custom_delivery_price
```

Effective price cascade updated to: `lmio > ci_menu > lcio > ci > lio/mi`
(L5 > L4 > L3 > L2 > L1 with modifier logic at L1).

---

### 3. `upsert_category_item_override` — Add L4 Branch

**Migration:** `20260413000000` (initial) → superseded by `20260413020000` (correct types)

The RPC previously had no handler for the case `(p_location_id IS NULL, p_menu_id IS NOT NULL)`.
It fell through to the final `RETURN` with `level: null` and `table: null` — appearing to
succeed while writing nothing.

**L4 branch added:**
```sql
ELSIF p_location_id IS NULL AND p_menu_id IS NOT NULL THEN
    -- UI L4: Global menu category price
    -- INSERT or ON CONFLICT UPDATE into category_items WHERE menu_id = p_menu_id
    -- If all prices are NULL → DELETE the L4 row (reset to inheriting L2)
```

#### Bug: DECIMAL vs NUMERIC type mismatch (overload explosion)

**Root cause:** Migration `20260413000000` used `DECIMAL(10,2)` in the function signature.
The existing DB function used `NUMERIC`. In PostgreSQL, `DECIMAL(10,2)` and `NUMERIC` are
different signatures for overloading purposes. `CREATE OR REPLACE` therefore created a
**3rd overload** (14-param DECIMAL version) rather than replacing the existing
14-param NUMERIC version.

**Result:** Three versions of `upsert_category_item_override` coexisted:
1. 13-param NUMERIC (old, no L4 branch)
2. 14-param NUMERIC (no L4 branch — the one the SDK called)
3. 14-param DECIMAL (new L4 branch — never called because SDK matched NUMERIC)

**Fix (`20260413020000`):** Dropped all three overloads with `DROP FUNCTION IF EXISTS`
on each specific signature, then created a single clean 14-param `NUMERIC` version
containing the L4 branch.

---

### 4. `reset_category_item_to_level` — Protect L2 from Menu Context Reset

**Migration:** `20260413010000`

**Bug:** Resetting to base price from a menu context (L4 or L5) was clearing the L2
global category price row. L2 is a prior-level baseline from the menu context's
perspective and must not be cleared when the user resets within a menu.

**Fix:** Added `AND p_menu_id IS NULL` guard on the L2 reset block:

```sql
-- Only clear L2 when NOT in menu context.
IF p_target_level < 2 AND p_location_id IS NULL
   AND p_category_id IS NOT NULL AND p_menu_id IS NULL THEN
    UPDATE category_items SET custom_price = NULL ...
    WHERE menu_id IS NULL;
END IF;
```

---

### 5. Old Unique Constraint Blocking L4 Inserts

**Migration:** `20260413030000`

**Bug:** Even after `20260413000000` added the partial unique indexes, inserting an L4
row (with `menu_id`) for an item that already had an L2 row (with `menu_id IS NULL`) in
the same `(menu_item_id, category_id)` raised:

```
duplicate key value violates unique constraint
'menu_item_categories_menu_item_id_category_id_key'
```

**Root cause:** The original table had a non-partial `UNIQUE (menu_item_id, category_id)`
constraint (named with the old table name `menu_item_categories`). Migration `20260413000000`
created the new partial indexes but never dropped this old constraint. Since it covers
ALL rows regardless of `menu_id`, it conflicts whenever L2 and L4 rows share the same
`(menu_item_id, category_id)`.

**Fix:**
```sql
ALTER TABLE public.category_items
  DROP CONSTRAINT IF EXISTS menu_item_categories_menu_item_id_category_id_key;
```

---

### 6. `menu-items-rpc.ts` — Pass `menuId` to Upsert RPC

**File:** `app/dashboard/actions/menu-items-rpc.ts`

**Bug:** The server action was stripping `menuId` before calling the RPC, so the RPC
always received `p_menu_id = null` — forcing every save into the L2 branch (global
category) even when editing at L4 or L5.

**Fix:** Pass `menuId` unconditionally:
```typescript
p_menu_id: params.menuId || null,
p_location_id: locationId || null,
```

The four routing combinations the RPC now handles:
| `p_location_id` | `p_menu_id` | Branch | Table |
|---|---|---|---|
| null | null | UI L2 — Global category | `category_items WHERE menu_id IS NULL` |
| null | set | UI L4 — Global menu category | `category_items WHERE menu_id = p_menu_id` |
| set | null | UI L3 — Branch category | `location_category_item_overrides` |
| set | set | UI L5 — Branch menu category | `location_menu_item_overrides` |

---

### Summary Table

| # | Area | Bug | Fix |
|---|------|-----|-----|
| 1 | DB Schema | `category_items` has no `menu_id`; L2/L4 can't coexist | Added nullable `menu_id` column + two partial unique indexes |
| 2 | DB RPC | `get_menu_with_categories` doesn't expose L4 price | Added `ci_menu` LEFT JOIN; added `level_3_menu_category_*` to `price_levels` |
| 3 | DB RPC | `upsert_category_item_override` silently ignores L4 saves | Added L4 branch; fixed DECIMAL/NUMERIC overload; rebuilt with single NUMERIC version |
| 4 | DB RPC | `reset_category_item_to_level` clears L2 when resetting from menu context | Added `AND p_menu_id IS NULL` guard on L2 reset block |
| 5 | DB Schema | Old non-partial unique constraint blocks L4 insert when L2 row exists | Dropped `menu_item_categories_menu_item_id_category_id_key` constraint |
| 6 | Server Action | `menuId` stripped before RPC call; all saves route to L2 | Pass `p_menu_id: params.menuId \|\| null` unconditionally |
