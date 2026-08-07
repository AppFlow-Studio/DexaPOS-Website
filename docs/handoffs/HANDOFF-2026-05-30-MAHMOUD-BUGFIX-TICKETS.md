# Bugfix Ticket Alignment

This branch has been aligned to the four formal bug tickets below:

- `T-20` Delivery Address Mapper Drops Fields on Selection
- `T-21` Modifier Price Cannot Clear to Zero
- `T-22` Category-Assignment Checkbox Not Toggling
- `Modifier Reordering` ticket for modifier ordering behavior

The goal of this document is to record exactly what is included in this branch, what was intentionally removed to keep the branch aligned to the tickets, and what remains partial.

## Repo Scope

This repository is the website/web-admin repo.

For these four tickets:

- `T-22` is **web-admin**, not POS
- `T-20` is **storefront web checkout**, not POS
- `T-21` is **merchant admin web**, not POS
- `Modifier Reordering` ticket is **merchant admin web** in this repo

POS notes that appear in ticket wording are downstream validation concerns only. They are **not** implemented in this repo as part of this branch.

## Included In This Branch

### `T-22` Category-Assignment Checkbox Not Toggling
File:
- `components/dashboard/menu/modifiers/AssignModifierToCategoryDialog.tsx`

What changed:
- the checkbox now stops click propagation before the row click handler fires
- checkbox taps and row/name taps now update the same toggle state without double-firing

Why:
- the dialog already had both:
  - row `onClick`
  - checkbox `onCheckedChange`
- direct checkbox taps could fire both paths and cancel themselves out

Expected result:
- tapping the checkbox toggles the category
- tapping the category name/row also toggles it
- visual state stays in sync

### `T-20` Delivery Address Mapper Drops Fields on Selection
File:
- `app/sites/components/checkout/CheckoutPage.tsx`

What changed:
- saved-address checkout mapping now translates the saved-address shape into the persisted order shape explicitly

Old behavior:
- `addressLine1` and `addressLine2` were concatenated into `street`
- `unit` was dropped

New behavior:
- `addressLine1 -> street`
- `addressLine2 -> unit`
- `city -> city`
- `state -> state`
- `postalCode -> zip`
- `deliveryNotes -> delivery_notes`

Expected result:
- persisted `delivery_address` keeps street, unit, city, state, zip, and notes correctly

### `T-21` Modifier Price Cannot Clear to Zero
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx`

What changed:
- modifier option price input now allows an empty string while the user is editing
- empty is coerced back to `0` on blur/submit instead of on every keystroke

Old behavior:
- `parseFloat(value) || 0` ran on every change
- backspace could never reach empty
- the field got stuck at `0`

New behavior:
- the user can fully clear the field
- blur/save resolves empty to `0`

Expected result:
- backspace reaches empty
- retyping a fresh value works normally
- saving an empty modifier price commits zero

### Modifier Reordering Ticket
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx`

What is included:
- reorder of modifier **options inside a group** in the admin modifier sheet
- up/down controls
- persisted `display_order`
- visible ordering sorted by `display_order`
- save path writes normalized contiguous `display_order`

What this covers:
- library-level option ordering inside one modifier group

Repo scope:
- web-admin only
- no POS implementation in this branch

What this does **not** cover:
- library-level modifier group reorder
- per-item modifier group reorder
- location-level modifier-item override reorder RPCs
- drag-and-drop UI

Status:
- partial alignment only

## Explicitly Removed From This Branch

These changes were removed from the branch because they are not part of the four formal tickets above:

- local/global menu item creation scope fix
- local/global quick-create modifier-group scope fix
- order assign-customer phone-input normalization fix

Those were valid Mahmoud-session fixes, but they are not represented by the four formal tickets and were removed to keep this PR scoped cleanly.

## Net Branch Scope

After alignment, the branch should only contain code changes in:

- `components/dashboard/menu/modifiers/AssignModifierToCategoryDialog.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx`

Plus this document:

- `docs/handoffs/HANDOFF-2026-05-30-MAHMOUD-BUGFIX-TICKETS.md`

## QA Checklist

### `T-22`
- open modifier group category-assignment dialog
- tap checkbox glyph directly
- confirm it toggles
- tap category name/row
- confirm it toggles identically

### `T-20`
- choose a saved delivery address with line1, line2, city, state, zip, notes
- place a delivery order
- inspect persisted `orders.delivery_address`
- confirm:
  - `street` = line1
  - `unit` = line2
  - `city` = city
  - `state` = state
  - `zip` = postal code
  - `delivery_notes` = notes

### `T-21`
- open modifier option edit
- backspace price from non-zero value
- confirm field reaches empty
- leave empty and blur/save
- confirm it resolves to zero
- clear and type a fresh number
- confirm value saves cleanly

### Modifier Reordering
- reorder options inside a modifier group
- save
- reopen
- confirm order persists

## Remaining Gaps

- no full numeric-input audit delivered yet for `T-21 Part 2`
- no shared `MoneyInput` / `NumberInput` abstraction introduced yet
- no full modifier-group reorder feature across library and per-item surfaces
