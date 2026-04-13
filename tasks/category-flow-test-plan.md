# Category Flow — Test Plan

**Tests for commit `d495301`**
**Prerequisite:** Dev server running (`npm run dev`) + Supabase running (`npx supabase start`)

---

## Setup: What you need before testing

- A merchant with **dual pricing enabled** (cash price ≠ card price)
- A merchant with at least **2 locations**
- At least one **global menu** and one **location-specific menu**
- At least one **global category** and one **location-specific category**, each with items
- A **public storefront** set up for one of the merchants
- Items that have **delivery_price set differently from price** (for fix #2 to be visible)
- Items that have **modifier groups** assigned

---

## Fix 1A — DB RPC: Full price cascade for location-owned menus

**What was broken:** Location-owned menus only applied L1 (base) + L3 (category) price.
L2 (location override), L4 (location+category), L5 (location+menu+category) were ignored.

**Steps:**
1. Go to `/dashboard/menu` and open a **location-specific menu** (not a global menu)
2. Open an item inside it that has a **location price override** (L2) set
3. Check the price shown on the menu detail page matches the L2 price — not the base price
4. Now set an L4 override (location+category) for that item and reload — price should update
5. Set an L5 override (location+menu+category) — this should take highest priority

**Pass:** Prices reflect the correct cascade level
**Fail:** Prices all show the base price (L1) regardless of overrides

---

## Fix 1B — DB RPC: modifier_groups included in get_categories_for_location

**What was broken:** Items fetched via `get_categories_for_location` had no modifier data.
This affects the categories page item view and the storefront category-based loading.

**Steps:**
1. Go to `/dashboard/menu/categories`
2. Open a category and click on an item that has modifier groups assigned
3. In the item form sheet, scroll to the **Modifiers** section
4. Verify modifier groups are listed (not empty)
5. On the storefront (`/sites/[slug]`), navigate to a category and click an item with modifiers
6. Verify the modifier options appear in the item modal

**Pass:** Modifiers are visible both in the dashboard category view and on the storefront
**Fail:** Modifiers section is empty / modifier options don't appear in the storefront modal

---

## Fix 2 — Storefront: Items show delivery_price, not card price

**What was broken:** `item.price` (card/POS price) was shown and used everywhere on the
online storefront instead of `item.delivery_price`.

**Steps:**
1. Pick an item that has a different `delivery_price` than `price`
   (e.g. price = $10.00, delivery_price = $11.50)
2. Open the public storefront for that merchant
3. **Check A:** Item card in the menu browser shows $11.50 (not $10.00)
4. **Check B:** Click the item — the detail modal header shows $11.50
5. **Check C:** Add the item to cart — cart line shows $11.50
6. Add a modifier — total calculation should be $11.50 + modifier price
7. **Check D:** Suggested items in the modal also show delivery_price

**Pass:** All prices on storefront show delivery_price
**Fail:** Prices show the lower/different card price

---

## Fix 3 — Dashboard: Category filter in AddCategoryToMenuWizard

**What was broken:** The category list when adding a category to a menu used a 6-branch
role+location+menu combo check that produced wrong results.

### Sub-test 3A: Global menu → only global categories visible
1. Go to a **global menu** (`/dashboard/menu/[menuId]`)
2. Click **"Add Category"**
3. In the wizard, verify the list shows **only global categories**
4. Location-specific categories should NOT appear in the list

### Sub-test 3B: Location menu + location selected → global + own location's categories
1. Switch location selector to a specific location (not "All Locations")
2. Go to a **location-specific menu** for that location
3. Click **"Add Category"**
4. Verify the list shows global categories + categories belonging to the selected location
5. Categories from OTHER locations should NOT appear

### Sub-test 3C: Location menu + All Locations → all categories visible
1. Switch location selector to **"All Locations"**
2. Open a location-specific menu
3. Click **"Add Category"**
4. All categories (global + all location-specific) should be visible (admin fallback)

**Pass:** Each sub-test shows the correct filtered set
**Fail:** Wrong categories appear (e.g. other locations' categories in 3B, or location-specific categories in a global menu)

---

## Fix 4A — Dashboard: "Open Global Edit" link in DisabledFieldBanner

**What was broken:** When editing a global item while scoped to a location, the
`DisabledFieldBanner` had no way to navigate to the full edit page.

**Steps:**
1. Switch location selector to a **specific location** (not All Locations)
2. Go to `/dashboard/menu/categories`
3. Click **Edit** on an item that is **global** (not owned by this location)
4. The item sheet should open with a `DisabledFieldBanner` at the top
5. Verify the banner has a clickable **"Open Global Edit"** link/button
6. Click it — the sheet should close and you should be navigated to
   `/dashboard/menu/items/[itemId]/edit`

**Pass:** Banner has the link and navigation works correctly
**Fail:** Banner shows without a link, or clicking does nothing

---

## Fix 4B — Dashboard: Sizes and Addons sections removed from inline sheet

**What was broken:** The inline item form sheet showed Sizes and Addons collapsible
sections that don't belong in the inline context.

**Steps:**
1. Go to `/dashboard/menu/categories` or a menu detail page
2. Click **Edit** on any item (global or location-owned)
3. Scroll through all sections of the form sheet
4. Verify there is **NO "Sizes" section** and **NO "Addons" section**
5. Open the dedicated edit page (`/dashboard/menu/items/[id]/edit`) and confirm those
   sections are present there (they belong there, not in the sheet)

**Pass:** Sizes/Addons are absent from the inline sheet, present on the dedicated page
**Fail:** Sizes or Addons section still appears in the inline sheet

---

## Fix 5 — Dashboard: onOpenGlobalEdit wired on both pages

**What was broken:** The "Open Global Edit" callback (Fix 4A) was only added to the
component but not passed from the parent pages, so clicking it would do nothing.

This tests that both pages correctly pass the callback.

### Sub-test 5A: Categories page
1. Switch to a specific location
2. Go to `/dashboard/menu/categories`
3. Edit a global item → banner appears → click "Open Global Edit"
4. Should navigate to `/dashboard/menu/items/[id]/edit`

### Sub-test 5B: Menu detail page
1. Switch to a specific location
2. Go to `/dashboard/menu` → open a menu → click Edit on a global item
3. Banner appears → click "Open Global Edit"
4. Should navigate to `/dashboard/menu/items/[id]/edit`

**Pass:** Navigation works from both the categories page and the menu detail page
**Fail:** Clicking does nothing on one of the pages (callback not wired)

---

## Fix 6 — Dashboard: Dual pricing in AddItemToCategoryWizard

**What was broken:** When creating a new item directly inside a category (via the
"Add Item" flow in the category wizard), the price input had no dual pricing awareness —
cash price auto-calculation did not work.

**Prerequisite:** Merchant must have **dual pricing enabled** with a percentage set.

**Steps:**
1. Go to `/dashboard/menu/categories`
2. Open a category and click **"Add Item"** (not selecting an existing item, but creating new)
3. In the item creation step, find the **Price input**
4. Enter a card price (e.g. $10.00)
5. If dual pricing is enabled, the **cash price** should **auto-calculate** based on the
   dual pricing percentage (e.g. 3% → $9.70)
6. Verify the cash price field updates automatically

**Pass:** Cash price auto-calculates when card price is entered
**Fail:** Cash price field stays empty or doesn't update (dual pricing not applied)

---

## Regression Checks (run after all fixes pass)

- [ ] Create a new item from the categories page — saves correctly
- [ ] Edit an item's price on a location menu — price updates in the menu view
- [ ] Add a category to a global menu — only global categories shown, assignment saves
- [ ] Add item to cart on storefront, checkout flow starts with correct total
- [ ] Open item sheet on menu detail page — no console errors
