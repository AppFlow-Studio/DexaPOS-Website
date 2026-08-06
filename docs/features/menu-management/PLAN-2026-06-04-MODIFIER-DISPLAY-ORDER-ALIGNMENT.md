# Modifier Display Order Alignment

## Ticket

Align modifier group and modifier option ordering across all menu-feed RPCs, and add the missing write path for global and per-location reordering.

## Scope

- Website repo only
- Backend migration first
- Merchant dashboard reorder callers only where needed
- No pricing, assignment, or policy redesign

## Ground Truth

### Schema already in play

- `menu_item_modifier_groups.display_order`
- `modifier_group_items.display_order`
- `location_modifier_item_overrides.display_order`
- `location_modifier_group_overrides`
  - missing `display_order` before this ticket

### RPCs in scope

- `get_menu_with_categories`
- `get_menu_for_location`
- `get_menu_item_details`
- `reorder_item_modifier_groups(...)`
- `reorder_modifier_group_items(...)`

### Important existing behavior

- `location_item_modifier_groups` already exists and older modifier-serving migrations already UNION it into feed RPCs.
- This ticket should preserve that location-scoped assignment behavior while fixing ordering drift.

## Locked Decisions

1. Ordering contract
- Groups sort by `COALESCE(lmgo.display_order, mimg.display_order), mg.name`
- Options sort by `COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name`
- `NULL` orders sort last naturally under ascending sort

2. Safety boundary
- Display-order-only changes
- No modifier assignment semantic rewrite
- No pricing/default-option changes
- No RLS rewrite unless blocked

3. SQL house rule
- All touched RPCs pin `search_path` to `'public', 'pg_temp'`

## Implementation Plan

### A. Schema

- Add `location_modifier_group_overrides.display_order integer`

### B. Read path

- Replace alphabetical or partially ordered modifier sorting in:
  - `get_menu_with_categories`
  - `get_menu_for_location`
  - `get_menu_item_details`
- Keep location-scoped modifier assignments in the feed path
- Make all three RPCs honor the same precedence rules

### C. Write path

- Add/finish:
  - `reorder_item_modifier_groups(p_menu_item_id uuid, p_group_orders jsonb, p_location_id uuid default null)`
  - `reorder_modifier_group_items(p_modifier_group_id uuid, p_item_orders jsonb, p_location_id uuid default null)`
- Keep backward-compatible wrapper:
  - `reorder_menu_item_modifier_groups(...)`

### D. App callers

- Route per-item reorder callers to `reorder_item_modifier_groups`
- Make dashboard reads aware of location-level display-order overrides where already surfaced

## Files

- `supabase/migrations/20260603000000_modifier_display_order.sql`
- `app/dashboard/actions/modifier-groups.ts`
- `app/dashboard/actions/menu-items.ts`
- `app/dashboard/actions/location-modifier-overrides.ts`
- `types/db-modles.ts`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/ModifierGroupFormSheet.tsx`
- `app/dashboard/menu/modifiers/page.tsx`

## Status

- Backend migration applied in Supabase by Ali
- App-side caller and type updates are ready locally
- Item-level modifier group reorder is wired in `components/dashboard/menu/NewEditItemFormSheet.tsx`
- Modifier option reorder is wired in `components/dashboard/menu/ModifierGroupFormSheet.tsx`
- Modifier library group reorder is wired in `app/dashboard/menu/modifiers/page.tsx`
- Location-aware option reorder for global groups is supported from the modifier group sheet
- Library group reorder is intentionally guarded:
  - All Locations: only when filtered to `Global`
  - Location view: allowed when search is clear
- Manual QA not started

## Frontend Handoff

- `docs/features/menu-management/HANDOFF-2026-06-04-MODIFIER-DISPLAY-ORDER-FRONTEND.md`

## Current Merchant Flows

1. Reorder modifier groups on an item
- Open item edit
- Go to `Modifiers`
- Use up/down controls beside attached groups
- Save item

2. Reorder options inside a modifier group
- Open `Modifiers`
- Edit a group
- Use up/down controls beside options
- Save group

3. Reorder modifier library groups
- Open `Modifiers`
- Use arrow controls on each group card
- Respect the scope guard notes above

## QA Later

1. Reorder groups on an item globally, reopen detail
2. Reorder options in a modifier group globally, reopen detail
3. Apply per-location group override, verify only that location changes
4. Apply per-location option override, verify only that location changes
5. Confirm `get_menu_with_categories`, `get_menu_for_location`, and `get_menu_item_details` all return matching order

# Modifier Display Order Alignment

## Ticket

Align modifier group and modifier option ordering across all menu-feed RPCs, and add the missing write path for global and per-location reordering.

## Scope

- Website repo only
- Backend migration first
- Merchant dashboard reorder callers only where needed
- No pricing, assignment, or policy redesign

## Ground Truth

### Schema already in play

- `menu_item_modifier_groups.display_order`
- `modifier_group_items.display_order`
- `location_modifier_item_overrides.display_order`
- `location_modifier_group_overrides`
  - missing `display_order` before this ticket

### RPCs in scope

- `get_menu_with_categories`
- `get_menu_for_location`
- `get_menu_item_details`
- `reorder_item_modifier_groups(...)`
- `reorder_modifier_group_items(...)`

### Important existing behavior

- `location_item_modifier_groups` already exists and older modifier-serving migrations already UNION it into feed RPCs.
- This ticket should preserve that location-scoped assignment behavior while fixing ordering drift.

## Locked Decisions

1. Ordering contract
- Groups sort by `COALESCE(lmgo.display_order, mimg.display_order), mg.name`
- Options sort by `COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name`
- `NULL` orders sort last naturally under ascending sort

2. Safety boundary
- Display-order-only changes
- No modifier assignment semantic rewrite
- No pricing/default-option changes
- No RLS rewrite unless blocked

3. SQL house rule
- All touched RPCs pin `search_path` to `'public', 'pg_temp'`

## Implementation Plan

### A. Schema

- Add `location_modifier_group_overrides.display_order integer`

### B. Read path

- Replace alphabetical or partially ordered modifier sorting in:
  - `get_menu_with_categories`
  - `get_menu_for_location`
  - `get_menu_item_details`
- Keep location-scoped modifier assignments in the feed path
- Make all three RPCs honor the same precedence rules

### C. Write path

- Add/finish:
  - `reorder_item_modifier_groups(p_menu_item_id uuid, p_group_orders jsonb, p_location_id uuid default null)`
  - `reorder_modifier_group_items(p_modifier_group_id uuid, p_item_orders jsonb, p_location_id uuid default null)`
- Keep backward-compatible wrapper:
  - `reorder_menu_item_modifier_groups(...)`

### D. App callers

- Route per-item reorder callers to `reorder_item_modifier_groups`
- Make dashboard reads aware of location-level display-order overrides where already surfaced

## Files

- `supabase/migrations/20260603000000_modifier_display_order.sql`
- `app/dashboard/actions/modifier-groups.ts`
- `app/dashboard/actions/menu-items.ts`
- `app/dashboard/actions/location-modifier-overrides.ts`
- `types/db-modles.ts`

## Status

- Backend migration applied in Supabase by Ali
- App-side caller and type updates are ready locally
- Frontend reorder UI remains a separate handoff
- Manual QA not started

## Frontend Handoff

- `docs/features/menu-management/HANDOFF-2026-06-04-MODIFIER-DISPLAY-ORDER-FRONTEND.md`

## QA Later

1. Reorder groups on an item globally, reopen detail
2. Reorder options in a modifier group globally, reopen detail
3. Apply per-location group override, verify only that location changes
4. Apply per-location option override, verify only that location changes
5. Confirm `get_menu_with_categories`, `get_menu_for_location`, and `get_menu_item_details` all return matching order
