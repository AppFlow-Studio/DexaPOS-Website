# Modifier Display Order Frontend Handoff

## Backend Status

Backend ordering contract is ready for frontend integration after applying:

- `supabase/migrations/20260603000000_modifier_display_order.sql`

Supporting app-side caller updates are also in progress locally in:

- `app/dashboard/actions/menu-items.ts`
- `app/dashboard/actions/modifier-groups.ts`
- `app/dashboard/actions/location-modifier-overrides.ts`
- `types/db-modles.ts`

## RPCs Available To Frontend

1. Per-item modifier group reorder
- `reorder_item_modifier_groups(p_menu_item_id uuid, p_group_orders jsonb, p_location_id uuid default null)`

2. Modifier option reorder
- `reorder_modifier_group_items(p_modifier_group_id uuid, p_item_orders jsonb, p_location_id uuid default null)`

3. Backward-compatible wrapper still exists
- `reorder_menu_item_modifier_groups(...)`

## Ordering Contract

1. Group order
- `COALESCE(lmgo.display_order, mimg.display_order), mg.name`

2. Option order
- `COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name`

3. Scope
- `p_location_id = null` means global order
- `p_location_id != null` means location override order

## Frontend Work For Haidar

1. Item library / item edit
- drag or move controls for modifier groups on an item
- call `reorder_item_modifier_groups(...)`

2. Modifier group editor
- drag or move controls for options inside a modifier group
- call `reorder_modifier_group_items(...)`

3. Location-aware reorder
- when operating in a specific location context, pass `locationId`
- when in global context, pass `null`

## Acceptance For Frontend

1. Reorder modifier groups on an item
- save
- reopen item
- order persists

2. Reorder options inside a modifier group
- save
- reopen group
- order persists

3. Location override
- change order in one location
- other locations keep global order

## Notes

- This stream is display-order-only.
- Do not change assignment semantics, pricing, defaults, or category propagation in the frontend pass.
