-- =============================================================================
-- Modifier Reorder RPCs
-- Purpose:
--   Add display-order-only RPCs for modifier group, modifier option, and
--   per-item modifier-group reordering.
--
-- Safety:
--   - no schema redesign
--   - no RLS/policy rewrites
--   - no pricing/default-option/assignment semantic changes
-- =============================================================================

create or replace function public.reorder_modifier_groups(
  p_merchant_id uuid,
  p_group_orders jsonb
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_group record;
begin
  perform public.authorize_merchant_access(p_merchant_id);

  for v_group in
    select *
    from jsonb_to_recordset(p_group_orders) as x(modifier_group_id uuid, display_order integer)
  loop
    update public.modifier_groups
    set
      display_order = v_group.display_order,
      updated_at = now()
    where merchant_id = p_merchant_id
      and id = v_group.modifier_group_id;
  end loop;

  return json_build_object('success', true);
end;
$$;

grant all on function public.reorder_modifier_groups(uuid, jsonb) to anon;
grant all on function public.reorder_modifier_groups(uuid, jsonb) to authenticated;
grant all on function public.reorder_modifier_groups(uuid, jsonb) to service_role;


create or replace function public.reorder_modifier_group_items(
  p_location_id uuid,
  p_modifier_group_id uuid,
  p_item_orders jsonb
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item record;
  v_merchant_id uuid;
  v_valid_item_id uuid;
begin
  select merchant_id
  into v_merchant_id
  from public.modifier_groups
  where id = p_modifier_group_id;

  if v_merchant_id is null then
    raise exception 'Modifier group % not found', p_modifier_group_id
      using errcode = 'P0002';
  end if;

  if p_location_id is null then
    perform public.authorize_merchant_access(v_merchant_id);
  else
    perform public.authorize_location_access(p_location_id);
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_item_orders) as x(modifier_group_item_id uuid, display_order integer)
  loop
    select id
    into v_valid_item_id
    from public.modifier_group_items
    where id = v_item.modifier_group_item_id
      and modifier_group_id = p_modifier_group_id;

    if v_valid_item_id is null then
      raise exception 'Modifier item % does not belong to modifier group %',
        v_item.modifier_group_item_id,
        p_modifier_group_id
        using errcode = '22023';
    end if;

    if p_location_id is null then
      update public.modifier_group_items
      set
        display_order = v_item.display_order,
        updated_at = now()
      where id = v_item.modifier_group_item_id
        and modifier_group_id = p_modifier_group_id;
    else
      insert into public.location_modifier_item_overrides (
        location_id,
        modifier_group_item_id,
        merchant_id,
        display_order,
        updated_at
      )
      values (
        p_location_id,
        v_item.modifier_group_item_id,
        v_merchant_id,
        v_item.display_order,
        now()
      )
      on conflict (location_id, modifier_group_item_id)
      do update
      set
        display_order = excluded.display_order,
        updated_at = now();
    end if;
  end loop;

  return json_build_object('success', true);
end;
$$;

grant all on function public.reorder_modifier_group_items(uuid, uuid, jsonb) to anon;
grant all on function public.reorder_modifier_group_items(uuid, uuid, jsonb) to authenticated;
grant all on function public.reorder_modifier_group_items(uuid, uuid, jsonb) to service_role;


create or replace function public.reorder_menu_item_modifier_groups(
  p_menu_item_id uuid,
  p_group_orders jsonb
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item record;
  v_menu_item record;
begin
  select id, merchant_id, location_id
  into v_menu_item
  from public.menu_items
  where id = p_menu_item_id;

  if v_menu_item.id is null then
    raise exception 'Menu item % not found', p_menu_item_id
      using errcode = 'P0002';
  end if;

  if v_menu_item.location_id is not null then
    perform public.authorize_location_access(v_menu_item.location_id);
  else
    perform public.authorize_merchant_access(v_menu_item.merchant_id);
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_group_orders) as x(modifier_group_id uuid, display_order integer)
  loop
    update public.menu_item_modifier_groups
    set display_order = v_item.display_order
    where menu_item_id = p_menu_item_id
      and modifier_group_id = v_item.modifier_group_id;
  end loop;

  return json_build_object('success', true);
end;
$$;

grant all on function public.reorder_menu_item_modifier_groups(uuid, jsonb) to anon;
grant all on function public.reorder_menu_item_modifier_groups(uuid, jsonb) to authenticated;
grant all on function public.reorder_menu_item_modifier_groups(uuid, jsonb) to service_role;
