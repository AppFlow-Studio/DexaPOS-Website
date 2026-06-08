-- ============================================================================
-- Single-location global modifier + recipe RPC cleanup
-- Ticket: Backend global path for modifier & recipe RPCs + overlay-row cleanup
-- Scope in this migration:
--   1) Add NULL/global path to upsert_modifier_override(...)
--   2) Drop stale upsert_menu_item_with_recipe overloads and keep one canonical signature
-- Notes:
--   - Overlay-row cleanup is intentionally staged separately after live-data audit
--   - Stock fields remain location-only for modifier overrides
-- ============================================================================

begin;

drop function if exists public.upsert_modifier_override(
  uuid,
  uuid,
  numeric,
  boolean,
  text,
  integer
);

create or replace function public.upsert_modifier_override(
  p_location_id uuid default null,
  p_modifier_item_id uuid default null,
  p_price_modifier numeric default null,
  p_is_active boolean default null,
  p_stock_tracking_mode text default null,
  p_current_stock integer default null
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_merchant_id uuid;
  v_location_merchant_id uuid;
begin
  if p_modifier_item_id is null then
    raise exception 'p_modifier_item_id is required';
  end if;

  select mgi.merchant_id
  into v_merchant_id
  from public.modifier_group_items mgi
  where mgi.id = p_modifier_item_id;

  if v_merchant_id is null then
    raise exception 'Modifier item % not found', p_modifier_item_id;
  end if;

  if p_location_id is null then
    perform public.authorize_merchant_access(v_merchant_id);

    if p_stock_tracking_mode is not null or p_current_stock is not null then
      raise exception
        'Global modifier edits cannot set stock fields. Use a location override.'
        using errcode = '22023';
    end if;

    update public.modifier_group_items
    set
      price_modifier = coalesce(p_price_modifier, price_modifier),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
    where id = p_modifier_item_id;

    return json_build_object(
      'success', true,
      'level', 'global',
      'table', 'modifier_group_items'
    );
  end if;

  perform public.authorize_location_access(p_location_id);

  select l.merchant_id
  into v_location_merchant_id
  from public.locations l
  where l.id = p_location_id;

  if v_location_merchant_id is null then
    raise exception 'Location % not found', p_location_id;
  end if;

  if v_location_merchant_id <> v_merchant_id then
    raise exception
      'Modifier item % does not belong to location % merchant',
      p_modifier_item_id,
      p_location_id
      using errcode = '23514';
  end if;

  insert into public.location_modifier_item_overrides (
    location_id,
    modifier_group_item_id,
    merchant_id,
    price_modifier,
    is_active,
    stock_tracking_mode,
    current_stock,
    updated_at
  ) values (
    p_location_id,
    p_modifier_item_id,
    v_merchant_id,
    p_price_modifier,
    p_is_active,
    p_stock_tracking_mode,
    p_current_stock,
    now()
  )
  on conflict (location_id, modifier_group_item_id)
  do update set
    price_modifier = coalesce(excluded.price_modifier, public.location_modifier_item_overrides.price_modifier),
    is_active = coalesce(excluded.is_active, public.location_modifier_item_overrides.is_active),
    stock_tracking_mode = coalesce(excluded.stock_tracking_mode, public.location_modifier_item_overrides.stock_tracking_mode),
    current_stock = coalesce(excluded.current_stock, public.location_modifier_item_overrides.current_stock),
    updated_at = now();

  return json_build_object(
    'success', true,
    'level', 'location',
    'table', 'location_modifier_item_overrides'
  );
end;
$$;

alter function public.upsert_modifier_override(
  uuid,
  uuid,
  numeric,
  boolean,
  text,
  integer
) owner to postgres;

grant all on function public.upsert_modifier_override(
  uuid,
  uuid,
  numeric,
  boolean,
  text,
  integer
) to anon;

grant all on function public.upsert_modifier_override(
  uuid,
  uuid,
  numeric,
  boolean,
  text,
  integer
) to authenticated;

grant all on function public.upsert_modifier_override(
  uuid,
  uuid,
  numeric,
  boolean,
  text,
  integer
) to service_role;

comment on function public.upsert_modifier_override(
  uuid,
  uuid,
  numeric,
  boolean,
  text,
  integer
) is 'Single-location aware modifier override writer. NULL location_id updates modifier_group_items base; non-NULL location_id upserts location_modifier_item_overrides.';

drop function if exists public.upsert_menu_item_with_recipe(uuid, jsonb);
drop function if exists public.upsert_menu_item_with_recipe(uuid, uuid, jsonb);

create or replace function public.upsert_menu_item_with_recipe(
  p_menu_item_id uuid,
  p_ingredients jsonb default null,
  p_recipe_items jsonb default null,
  p_location_id uuid default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_merchant_id uuid;
  v_items jsonb;
  v_item jsonb;
begin
  select merchant_id
  into v_merchant_id
  from public.menu_items
  where id = p_menu_item_id;

  if v_merchant_id is null then
    raise exception 'Menu item % not found', p_menu_item_id;
  end if;

  perform public.authorize_merchant_access(v_merchant_id);

  v_items := coalesce(p_recipe_items, p_ingredients);

  if v_items is null then
    return;
  end if;

  delete from public.menu_item_recipes
  where menu_item_id = p_menu_item_id
    and merchant_id = v_merchant_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    insert into public.menu_item_recipes (
      menu_item_id,
      merchant_id,
      inventory_item_id,
      recipe_id,
      quantity_used,
      quantity_multiplier
    ) values (
      p_menu_item_id,
      v_merchant_id,
      nullif((v_item->>'inventory_item_id'), '')::uuid,
      nullif((v_item->>'recipe_id'), '')::uuid,
      coalesce(
        (v_item->>'quantity_used')::numeric,
        (v_item->>'quantity')::numeric,
        1
      ),
      coalesce((v_item->>'quantity_multiplier')::numeric, 1)
    );
  end loop;
end;
$$;

alter function public.upsert_menu_item_with_recipe(
  uuid,
  jsonb,
  jsonb,
  uuid
) owner to postgres;

grant all on function public.upsert_menu_item_with_recipe(
  uuid,
  jsonb,
  jsonb,
  uuid
) to anon;

grant all on function public.upsert_menu_item_with_recipe(
  uuid,
  jsonb,
  jsonb,
  uuid
) to authenticated;

grant all on function public.upsert_menu_item_with_recipe(
  uuid,
  jsonb,
  jsonb,
  uuid
) to service_role;

comment on function public.upsert_menu_item_with_recipe(
  uuid,
  jsonb,
  jsonb,
  uuid
) is 'Canonical recipe link function. p_recipe_items takes precedence over p_ingredients. p_location_id is accepted for single-location parity but base writes remain merchant-scoped.';

commit;
