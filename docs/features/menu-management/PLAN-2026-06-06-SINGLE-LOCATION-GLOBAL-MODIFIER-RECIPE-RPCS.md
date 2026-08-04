# Single-Location Global Modifier And Recipe RPCs

## Ticket

Backend: global path for modifier and recipe RPCs, plus single-location overlay-row cleanup.

## Scope

- Website repo only
- Backend/RPC stream
- Single-location menu experience only
- No frontend redesign in this ticket
- No RLS/policy redesign beyond the changed RPC definitions

## Verified Against Repo

### Work item 1: `upsert_modifier_override`

- Confirmed.
- Current source requires `p_location_id uuid` and always upserts into `location_modifier_item_overrides`.
- There is no merchant-global branch when `location_id` is omitted.
- That breaks the single-location rule for modifier base edits.

### Work item 2: `upsert_menu_item_with_recipe`

- Partially confirmed.
- Current repo source already contains the canonical four-arg signature:
  - `upsert_menu_item_with_recipe(p_menu_item_id uuid, p_ingredients jsonb default null, p_recipe_items jsonb default null, p_location_id uuid default null)`
- Current repo client call still uses the legacy payload key:
  - `p_ingredients`
- So the source file is already on the right shape, but the live database may still contain stale overloads. This ticket should defensively drop those overloads and keep one canonical function.

### Work item 3: single-location overlay rows

- Confirmed as a real risk, with one important nuance.
- `location_item_overrides` now contains both:
  - fields that can be collapsed into `menu_items`
  - fields with no `menu_items` equivalent

### Base-collapsible overlay fields

- `custom_price` -> `menu_items.price`
- `custom_cash_price` -> `menu_items.cash_price`
- `is_available` -> `menu_items.availability`
- `tax_category` -> `menu_items.tax_category`
- `is_tax_exempt` -> `menu_items.is_tax_exempt`
- `available_channels` -> `menu_items.available_channels`
- `custom_delivery_price` -> `menu_items.delivery_price` and `menu_items.use_delivery_price = true`
- `stock_tracking_mode` -> `menu_items.stock_tracking_mode`
  - only when not `use_default`

### Overlay fields with no safe base target

- `price_modifier`
- `price_modifier_type`
- `current_stock`
- `low_stock_threshold`
- `prep_station_id`
- `is_popular`
- `is_new`

## Locked Decisions

1. Single-location rule
- `location_id = NULL` means write the global/base record.

2. Modifier safety boundary
- Global/base path may only write columns that actually exist on `modifier_group_items`.
- Location-only stock fields must not be silently dropped in the global path.

3. Recipe function cleanup
- Keep one canonical `upsert_menu_item_with_recipe(...)` signature.
- Drop stale overloads defensively.

4. Overlay cleanup discipline
- Do not ship an automatic prod-wide delete.
- Split rows into:
  - safe auto-collapse rows
  - manual-review rows with location-only fields

5. SQL house rule
- `SECURITY DEFINER`
- pinned `search_path = 'public', 'pg_temp'`

## Implementation Plan

### A. Modifier RPC

- Replace `upsert_modifier_override(...)` with a canonical signature:
  - `p_location_id uuid default null`
- Global path:
  - authorize merchant
  - update `modifier_group_items`
- Location path:
  - authorize location
  - validate location merchant matches modifier merchant
  - upsert `location_modifier_item_overrides`
- If the global path receives stock-only fields, fail loudly instead of pretending they were saved.

### B. Recipe RPC

- Drop stale overloads if they exist:
  - `(uuid, jsonb)`
  - `(uuid, uuid, jsonb)`
- Recreate the canonical four-arg function with the same behavior.
- Align web caller payload to `p_recipe_items`.

### C. App alignment

- Make the dashboard recipe action call the canonical argument name.
- Make the modifier helper accept nullable `locationId` and reject global stock-field writes explicitly.

### D. Overlay audit and cleanup runbook

- Run a prod audit in SQL editor.
- Separate:
  - safe rows containing only base-collapsible values
  - unsafe rows using location-only fields
- Stage safe cleanup first.
- Sequence Charcoal separately in prod.

## Audit SQL

### 1. Single-location merchants with override rows

```sql
with single_location_merchants as (
  select l.merchant_id
  from public.locations l
  group by l.merchant_id
  having count(*) = 1
),
single_location_rows as (
  select
    lio.id,
    lio.location_id,
    lio.menu_item_id,
    lio.custom_price,
    lio.custom_cash_price,
    lio.price_modifier,
    lio.price_modifier_type,
    lio.is_available,
    lio.stock_tracking_mode,
    lio.current_stock,
    lio.low_stock_threshold,
    lio.tax_category,
    lio.is_tax_exempt,
    lio.available_channels,
    lio.prep_station_id,
    lio.custom_delivery_price,
    lio.is_popular,
    lio.is_new
  from public.location_item_overrides lio
  join public.locations loc on loc.id = lio.location_id
  join single_location_merchants slm on slm.merchant_id = loc.merchant_id
)
select
  count(*) as total_rows,
  count(*) filter (
    where coalesce(price_modifier, 0) = 0
      and price_modifier_type is null
      and current_stock is null
      and low_stock_threshold is null
      and prep_station_id is null
      and coalesce(is_popular, false) = false
      and coalesce(is_new, false) = false
  ) as safe_auto_collapse_rows,
  count(*) filter (
    where not (
      coalesce(price_modifier, 0) = 0
      and price_modifier_type is null
      and current_stock is null
      and low_stock_threshold is null
      and prep_station_id is null
      and coalesce(is_popular, false) = false
      and coalesce(is_new, false) = false
    )
  ) as manual_review_rows
from single_location_rows;
```

### 2. Manual-review row detail

```sql
with single_location_merchants as (
  select l.merchant_id
  from public.locations l
  group by l.merchant_id
  having count(*) = 1
)
select
  m.name as merchant_name,
  loc.name as location_name,
  mi.name as item_name,
  lio.*
from public.location_item_overrides lio
join public.locations loc on loc.id = lio.location_id
join public.merchants m on m.id = loc.merchant_id
join public.menu_items mi on mi.id = lio.menu_item_id
join single_location_merchants slm on slm.merchant_id = loc.merchant_id
where not (
  coalesce(lio.price_modifier, 0) = 0
  and lio.price_modifier_type is null
  and lio.current_stock is null
  and lio.low_stock_threshold is null
  and lio.prep_station_id is null
  and coalesce(lio.is_popular, false) = false
  and coalesce(lio.is_new, false) = false
)
order by m.name, loc.name, mi.name;
```

### 3. Safe staging cleanup template

```sql
begin;

with single_location_merchants as (
  select l.merchant_id
  from public.locations l
  group by l.merchant_id
  having count(*) = 1
),
safe_rows as (
  select lio.*
  from public.location_item_overrides lio
  join public.locations loc on loc.id = lio.location_id
  join single_location_merchants slm on slm.merchant_id = loc.merchant_id
  where coalesce(lio.price_modifier, 0) = 0
    and lio.price_modifier_type is null
    and lio.current_stock is null
    and lio.low_stock_threshold is null
    and lio.prep_station_id is null
    and coalesce(lio.is_popular, false) = false
    and coalesce(lio.is_new, false) = false
),
updated as (
  update public.menu_items mi
  set
    price = coalesce(sr.custom_price, mi.price),
    cash_price = coalesce(sr.custom_cash_price, mi.cash_price),
    availability = coalesce(sr.is_available, mi.availability),
    stock_tracking_mode = case
      when sr.stock_tracking_mode is null or sr.stock_tracking_mode = 'use_default' then mi.stock_tracking_mode
      else sr.stock_tracking_mode
    end,
    tax_category = coalesce(sr.tax_category, mi.tax_category),
    is_tax_exempt = coalesce(sr.is_tax_exempt, mi.is_tax_exempt),
    available_channels = coalesce(sr.available_channels, mi.available_channels),
    delivery_price = coalesce(sr.custom_delivery_price, mi.delivery_price),
    use_delivery_price = case
      when sr.custom_delivery_price is not null then true
      else mi.use_delivery_price
    end,
    updated_at = now()
  from safe_rows sr
  where mi.id = sr.menu_item_id
  returning sr.id as override_id
)
delete from public.location_item_overrides lio
using updated u
where lio.id = u.override_id;

rollback;
```

## Files

- `supabase/migrations/20260606143000_single_location_global_modifier_recipe_rpcs.sql`
- `app/dashboard/actions/menu-items-rpc.ts`
- `app/dashboard/actions/recipes.ts`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
- `docs/features/menu-management/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md`

## Status

- Repo verification complete
- Modifier RPC issue confirmed
- Recipe overload issue needs defensive cleanup, not a source rewrite
- Overlay cleanup requires safe/manual split because the table now contains non-base fields
- Migration and app alignment started locally
- Prod audit still pending manual SQL editor run
