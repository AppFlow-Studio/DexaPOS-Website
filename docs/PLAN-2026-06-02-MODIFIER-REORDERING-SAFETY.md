# Modifier Reordering Safety Rollout

## Ticket

Merchant/admin modifier reordering is currently incomplete and risky because modifiers feed item edit, menu RPCs, storefront reads, and location override flows.

This ticket is being implemented as a phased rollout to avoid breaking modifier assignment, pricing, or downstream menu consumers.

## Repo Scope

- Website repo only
- Merchant dashboard/menu flows in this phase
- No POS implementation in this repo

## Non-Negotiable Safety Rules

1. Display-order-only changes
- Only touch `display_order` behavior
- Do not change modifier assignment semantics

2. No schema redesign
- Reuse existing columns:
  - `modifier_groups.display_order`
  - `modifier_group_items.display_order`
  - `menu_item_modifier_groups.display_order`
  - `location_item_modifier_groups.display_order`
  - `location_modifier_item_overrides.display_order`

3. No policy rewrites
- Do not change existing modifier RLS unless a concrete blocker appears

4. No pricing/default-option behavior changes
- Do not change:
  - `price_modifier`
  - `delivery_price_modifier`
  - `is_default`
  - stock tracking behavior

5. Read-path changes must be ordering-only
- Sort by `display_order`
- Preserve current scope/override precedence rules

## Current Ground Truth

### Already present in schema

- `modifier_groups.display_order`
- `modifier_group_items.display_order`
- `menu_item_modifier_groups.display_order`
- `location_item_modifier_groups.display_order`
- `location_modifier_item_overrides.display_order`

### Current gap

- Item save paths currently reinsert `menu_item_modifier_groups` without `display_order`
- Some modifier reads do not explicitly sort nested items
- Per-item modifier order exists in state/UI but is not preserved reliably on save
- Library group reorder and full drag-and-drop are still missing

## Phase Plan

### Phase 1: Ordering Contract + Order Preservation

Goal:
- Make current ordering deterministic without changing modifier semantics

Planned work:
- Add reorder RPCs:
  - `reorder_modifier_groups(...)`
  - `reorder_modifier_group_items(...)`
  - `reorder_menu_item_modifier_groups(...)`
- Preserve `display_order` when saving item modifier assignments
- Sort current read paths by `display_order`
- Add a minimal per-item reorder control in the item editor if it can reuse the existing ordered ID array safely

Success criteria:
- Modifier order no longer collapses on item save
- Existing modifier option order is read back consistently
- No consumer payload shape changes

### Phase 2: Merchant Dashboard UI Adoption

Goal:
- Expose the new ordering contract on dashboard surfaces deliberately

Planned work:
- Library modifier group reorder UI
- Library modifier option reorder UI review/adoption
- Per-item attached modifier-group reorder UI refinement

Success criteria:
- Merchant can change order intentionally from dashboard
- Save paths only mutate order, not assignment semantics

### Phase 3: Consumer Read Audit

Goal:
- Verify menu-serving and storefront consumers respect intended order

Audit targets:
- dashboard modifier/item views
- menu RPC payloads
- storefront menu rendering
- location override reads

Success criteria:
- No mismatched ordering between editor and consumer surfaces

## Files In Scope For Phase 1

- `supabase/migrations/*modifier_reorder*.sql`
- `app/dashboard/actions/modifier-groups.ts`
- `app/dashboard/actions/menu-items.ts`
- `app/dashboard/actions/menu-items-rpc.ts`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`

## Explicitly Out Of Scope In Phase 1

- POS changes
- Prep/KDS routing changes
- Modifier assignment model changes
- Category propagation logic changes
- Price cascade logic changes
- Storefront RPC redesign

## QA Focus For Phase 1

1. Edit item with existing modifiers
- Save without reordering
- Order should remain stable

2. Edit item and reorder modifier groups
- Save and reopen
- Order should persist

3. Edit modifier group with existing options
- Option order should load in the expected order

4. Add/remove a modifier group on an item
- Existing relative order should stay stable
- New additions should append predictably

5. Regression check
- Modifier assignments still appear correctly in dashboard
- No missing modifiers on item reopen

## Status

- Phase 1 in progress
