-- ============================================================================
-- HQ self-service billing control - phase 1
-- ----------------------------------------------------------------------------
-- Adds the missing audited pricing/config RPC layer and unified calculator used
-- by HQ billing screens. POS app enforcement/gating remains a separate repo pass.
-- ============================================================================

-- Device POS ID is a display/ops identifier derived from serial number.
alter table public.device_inventory
  add column if not exists pos_id text generated always as (right(serial_number, 4)) stored;

create index if not exists idx_device_inventory_pos_id
  on public.device_inventory(pos_id);

drop view if exists public.admin_device_inventory;

create view public.admin_device_inventory
with (security_invoker = true)
as
  select
    di.id,
    di.catalog_id,
    di.serial_number,
    di.mac_address,
    di.status,
    di.condition,
    di.firmware_version,
    di.app_version,
    di.purchased_at,
    di.warranty_expires_at,
    di.purchase_order_number,
    di.last_config_at,
    di.created_at,
    di.updated_at,
    dc.device_category,
    dc.manufacturer,
    dc.model_name,
    dc.model_sku,
    dc.monthly_fee_cents,
    dc.monthly_fee,
    di.merchant_id,
    m.name as merchant_name,
    di.location_id,
    l.name as location_name,
    di.linked_station_id,
    di.linked_payment_terminal_id,
    di.linked_printer_id,
    di.pos_id
  from public.device_inventory di
  join public.device_catalog dc on dc.id = di.catalog_id
  left join public.merchants m on m.id = di.merchant_id
  left join public.locations l on l.id = di.location_id;

grant select on public.admin_device_inventory to anon, authenticated, service_role;

create table if not exists public.device_billing_service_mappings (
  id uuid primary key default gen_random_uuid(),
  device_category text not null unique,
  service_code text not null references public.billable_services(service_code),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists update_device_billing_service_mappings_updated_at
  on public.device_billing_service_mappings;
create trigger update_device_billing_service_mappings_updated_at
before update on public.device_billing_service_mappings
for each row execute function public.update_updated_at_column();

alter table public.device_billing_service_mappings enable row level security;
alter table public.device_billing_service_mappings force row level security;

drop policy if exists device_billing_service_mappings_read
  on public.device_billing_service_mappings;
create policy device_billing_service_mappings_read
on public.device_billing_service_mappings
for select
using (true);

drop policy if exists device_billing_service_mappings_manage_hq
  on public.device_billing_service_mappings;
create policy device_billing_service_mappings_manage_hq
on public.device_billing_service_mappings
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());

grant select on public.device_billing_service_mappings to authenticated, service_role;
grant all on public.device_billing_service_mappings to service_role;

-- Flagship seed values. These remain HQ-editable through the RPCs below.
insert into public.subscription_plans (
  plan_code,
  display_name,
  base_price_monthly,
  included_stations,
  per_extra_station_price,
  card_surcharge_pct,
  is_active,
  metadata,
  plan_scope,
  description,
  display_order
) values (
  'SERVICE_CATALOG',
  'Dexa POS Base',
  99.00,
  1,
  49.00,
  4.00,
  true,
  jsonb_build_object(
    'internal_placeholder', true,
    'pricing_model', 'service_catalog',
    'seeded_from', 'hq_self_service_billing_control_phase1'
  ),
  'service_billing',
  'First POS station with additional station pricing.',
  0
)
on conflict (plan_code) do update
set
  display_name = excluded.display_name,
  base_price_monthly = excluded.base_price_monthly,
  included_stations = excluded.included_stations,
  per_extra_station_price = excluded.per_extra_station_price,
  card_surcharge_pct = excluded.card_surcharge_pct,
  is_active = true,
  metadata = coalesce(public.subscription_plans.metadata, '{}'::jsonb)
    || excluded.metadata,
  plan_scope = 'service_billing',
  description = excluded.description,
  updated_at = now();

insert into public.billable_services (
  service_code,
  display_name,
  service_category,
  pricing_model,
  base_price_monthly,
  additional_unit_price,
  included_quantity,
  card_surcharge_pct,
  unit_label,
  is_active,
  metadata
) values
  ('pos_tablet', 'POS Tablet', 'hardware', 'per_unit', 39.00, null, 0, 4.00, 'tablet', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1')),
  ('kds', 'Kitchen Display (KDS)', 'hardware', 'per_unit', 29.00, null, 0, 4.00, 'display', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1')),
  ('online_ordering', 'Online Ordering', 'software', 'flat', 100.00, null, 1, 4.00, 'location', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1')),
  ('loyalty', 'Loyalty Program', 'software', 'flat', 79.00, null, 1, 4.00, 'location', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1')),
  ('delivery_app_integration', 'Delivery App Integration', 'software', 'flat', 79.00, null, 1, 4.00, 'location', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1')),
  ('franchise', 'Franchise Package', 'service', 'flat', 399.00, null, 1, 4.00, 'merchant', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1'))
on conflict (service_code) do update
set
  display_name = excluded.display_name,
  service_category = excluded.service_category,
  pricing_model = excluded.pricing_model,
  base_price_monthly = excluded.base_price_monthly,
  additional_unit_price = excluded.additional_unit_price,
  included_quantity = excluded.included_quantity,
  card_surcharge_pct = excluded.card_surcharge_pct,
  unit_label = excluded.unit_label,
  is_active = true,
  metadata = coalesce(public.billable_services.metadata, '{}'::jsonb)
    || excluded.metadata,
  updated_at = now();

insert into public.device_billing_service_mappings (
  device_category,
  service_code,
  is_active,
  metadata
) values
  ('pos_tablet', 'pos_tablet', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1')),
  ('kds', 'kds', true, jsonb_build_object('seeded_from', 'hq_self_service_billing_control_phase1'))
on conflict (device_category) do update
set
  service_code = excluded.service_code,
  is_active = true,
  metadata = coalesce(public.device_billing_service_mappings.metadata, '{}'::jsonb)
    || excluded.metadata,
  updated_at = now();

create or replace function public.calculate_subscription_total(
  p_plan_id uuid default null,
  p_station_count integer default 0,
  p_services jsonb default '[]'::jsonb,
  p_billing_method text default 'card'
)
returns table (
  station_count integer,
  billing_method text,
  line_items jsonb,
  subtotal numeric(12,2),
  card_surcharge numeric(12,2),
  total_amount numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_plan public.subscription_plans%rowtype;
  v_has_plan boolean := false;
  v_plan_scope text := 'service_billing';
  v_base_price numeric(12,2) := 0;
  v_station_count integer := greatest(coalesce(p_station_count, 0), 0);
  v_overage integer := 0;
  v_line_items jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_surcharge_pct numeric(5,2) := 4.00;
  v_card_surcharge numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_service_item jsonb;
  v_service_id uuid;
  v_service_code text;
  v_quantity integer;
  v_service public.billable_services%rowtype;
  v_service_calc record;
begin
  if coalesce(p_billing_method, 'card') not in ('ach', 'card') then
    raise exception 'Unsupported billing method: %', p_billing_method;
  end if;

  if p_plan_id is not null then
    select *
    into v_plan
    from public.subscription_plans sp
    where sp.id = p_plan_id;

    v_has_plan := found;

    if not v_has_plan then
      raise exception 'Subscription plan not found: %', p_plan_id;
    end if;

    v_plan_scope := coalesce(v_plan.plan_scope, 'service_billing');
    v_base_price := case
      when v_plan_scope = 'merchant_tier'
        then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
      else round(coalesce(v_plan.base_price_monthly, 0), 2)
    end;
    v_surcharge_pct := coalesce(v_plan.card_surcharge_pct, v_surcharge_pct);

    if v_base_price > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', case when v_plan_scope = 'merchant_tier' then 'merchant_tier_base' else 'base_monthly' end,
          'description', coalesce(v_plan.display_name, 'Subscription') || ' monthly base',
          'category', 'plan',
          'pricing_model', 'flat',
          'quantity', 1,
          'unit_label', 'month',
          'unit_price', v_base_price,
          'subtotal', v_base_price,
          'amount', v_base_price
        )
      );
      v_subtotal := round(v_subtotal + v_base_price, 2);
    end if;

    v_overage := greatest(v_station_count - greatest(coalesce(v_plan.included_stations, 0), 0), 0);

    if v_overage > 0 and coalesce(v_plan.per_extra_station_price, 0) > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'extra_stations',
          'description', 'Extra active stations beyond included count',
          'category', 'plan',
          'pricing_model', 'per_unit',
          'quantity', v_overage,
          'unit_label', 'station',
          'unit_price', round(v_plan.per_extra_station_price, 2),
          'subtotal', round(v_overage * v_plan.per_extra_station_price, 2),
          'amount', round(v_overage * v_plan.per_extra_station_price, 2)
        )
      );
      v_subtotal := round(v_subtotal + (v_overage * v_plan.per_extra_station_price), 2);
    end if;
  end if;

  for v_service_item in
    select value
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_id := null;
    v_service_code := nullif(btrim(coalesce(v_service_item->>'service_code', v_service_item->>'code', '')), '');

    if nullif(btrim(coalesce(v_service_item->>'service_id', '')), '') is not null then
      begin
        v_service_id := (v_service_item->>'service_id')::uuid;
      exception when others then
        raise exception 'Invalid service_id in subscription calculator payload';
      end;
    end if;

    if v_service_id is null and v_service_code is not null then
      select bs.id
      into v_service_id
      from public.billable_services bs
      where bs.service_code = lower(regexp_replace(v_service_code, '[^a-zA-Z0-9]+', '_', 'g'))
      limit 1;
    end if;

    if v_service_id is null then
      continue;
    end if;

    select *
    into v_service
    from public.billable_services bs
    where bs.id = v_service_id;

    if not found or not coalesce(v_service.is_active, false) then
      continue;
    end if;

    v_quantity := greatest(coalesce(nullif(v_service_item->>'quantity', '')::integer, 1), 0);
    if v_quantity <= 0 then
      continue;
    end if;

    select *
    into v_service_calc
    from public.calculate_billable_service_amounts(v_service.id, v_quantity, 'ach');

    v_surcharge_pct := greatest(v_surcharge_pct, coalesce(v_service.card_surcharge_pct, 0));
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', v_service.service_code,
        'description', v_service.display_name,
        'category', v_service.service_category,
        'pricing_model', v_service.pricing_model,
        'quantity', v_quantity,
        'unit_label', v_service.unit_label,
        'unit_price', case
          when v_service.pricing_model = 'per_unit' then v_service.base_price_monthly
          else v_service_calc.subtotal
        end,
        'base_price_monthly', v_service.base_price_monthly,
        'additional_unit_price', v_service.additional_unit_price,
        'included_quantity', v_service.included_quantity,
        'subtotal', v_service_calc.subtotal,
        'amount', v_service_calc.subtotal
      )
    );
    v_subtotal := round(v_subtotal + v_service_calc.subtotal, 2);
  end loop;

  v_card_surcharge := case
    when coalesce(p_billing_method, 'card') = 'card'
      then round(v_subtotal * (v_surcharge_pct / 100.0), 2)
    else 0::numeric
  end;
  v_total := round(v_subtotal + v_card_surcharge, 2);

  if v_card_surcharge > 0 then
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', 'card_surcharge',
        'description', 'Card billing surcharge',
        'category', 'billing',
        'pricing_model', 'percent',
        'quantity', 1,
        'unit_label', 'charge',
        'unit_price', v_card_surcharge,
        'subtotal', v_card_surcharge,
        'amount', v_card_surcharge,
        'surcharge_pct', v_surcharge_pct
      )
    );
  end if;

  return query
  select
    v_station_count,
    coalesce(p_billing_method, 'card'),
    v_line_items,
    v_subtotal,
    v_card_surcharge,
    v_total;
end;
$function$;

revoke all on function public.calculate_subscription_total(uuid, integer, jsonb, text) from public;
grant execute on function public.calculate_subscription_total(uuid, integer, jsonb, text) to authenticated, service_role;

create or replace function public.recalc_subscription(
  p_subscription_id uuid
)
returns table (
  subscription_id uuid,
  station_count integer,
  monthly_amount numeric(12,2),
  subtotal numeric(12,2),
  card_surcharge numeric(12,2),
  line_items jsonb
)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_billing_method text := 'card';
  v_station_count integer := 0;
  v_services jsonb := '[]'::jsonb;
  v_calc record;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can recalculate subscriptions';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  v_station_count := public.get_active_station_count(v_subscription.location_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'service_id', mss.service_id,
        'quantity', mss.quantity
      )
      order by bs.service_category asc, bs.display_name asc
    ),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  join public.billable_services bs on bs.id = mss.service_id
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

  select *
  into v_calc
  from public.calculate_subscription_total(
    v_subscription.plan_id,
    v_station_count,
    v_services,
    coalesce(v_billing_method, 'card')
  );

  update public.merchant_subscriptions
  set
    station_count = v_station_count,
    monthly_amount = v_calc.total_amount,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_model', 'unified_calculator',
      'pricing_last_recalculated_at', now(),
      'pricing_subtotal', v_calc.subtotal,
      'pricing_card_surcharge', v_calc.card_surcharge
    ),
    updated_at = now()
  where id = v_subscription.id;

  perform public.log_subscription_billing_event(
    'subscription_recalculated',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'merchant_subscription',
    null,
    v_subscription.id,
    jsonb_build_object(
      'old_monthly_amount', v_subscription.monthly_amount,
      'new_monthly_amount', v_calc.total_amount,
      'old_station_count', v_subscription.station_count,
      'new_station_count', v_station_count,
      'subtotal', v_calc.subtotal,
      'card_surcharge', v_calc.card_surcharge
    ),
    jsonb_build_object(
      'source', 'recalc_subscription',
      'line_items', v_calc.line_items
    )
  );

  return query
  select
    v_subscription.id,
    v_station_count,
    v_calc.total_amount::numeric(12,2),
    v_calc.subtotal::numeric(12,2),
    v_calc.card_surcharge::numeric(12,2),
    v_calc.line_items::jsonb;
end;
$function$;

revoke all on function public.recalc_subscription(uuid) from public;
grant execute on function public.recalc_subscription(uuid) to authenticated, service_role;

create or replace function public.upsert_billable_service(
  p_service_id uuid default null,
  p_service_code text default null,
  p_display_name text default null,
  p_service_category text default 'service',
  p_pricing_model text default 'flat',
  p_base_price_monthly numeric default 0,
  p_additional_unit_price numeric default null,
  p_included_quantity integer default 0,
  p_card_surcharge_pct numeric default 4.00,
  p_unit_label text default 'unit',
  p_is_active boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_service_id uuid;
  v_service_code text := lower(regexp_replace(btrim(coalesce(p_service_code, '')), '[^a-zA-Z0-9]+', '_', 'g'));
  v_existing public.billable_services%rowtype;
  v_subscription_id uuid;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can manage billable services';
  end if;

  if v_service_code = '' then
    raise exception 'Service code is required';
  end if;

  if coalesce(btrim(p_display_name), '') = '' then
    raise exception 'Display name is required';
  end if;

  if p_service_category not in ('hardware', 'software', 'service') then
    raise exception 'Unsupported service category: %', p_service_category;
  end if;

  if p_pricing_model not in ('flat', 'per_unit', 'tiered') then
    raise exception 'Unsupported pricing model: %', p_pricing_model;
  end if;

  if coalesce(p_base_price_monthly, 0) < 0
     or coalesce(p_additional_unit_price, 0) < 0
     or coalesce(p_included_quantity, 0) < 0 then
    raise exception 'Prices and included quantity must be non-negative';
  end if;

  if coalesce(p_card_surcharge_pct, 0) < 0 or coalesce(p_card_surcharge_pct, 0) > 100 then
    raise exception 'Card surcharge must be between 0 and 100';
  end if;

  select *
  into v_existing
  from public.billable_services bs
  where (p_service_id is not null and bs.id = p_service_id)
     or bs.service_code = v_service_code
  order by case when p_service_id is not null and bs.id = p_service_id then 0 else 1 end
  limit 1;

  insert into public.billable_services (
    id,
    service_code,
    display_name,
    service_category,
    pricing_model,
    base_price_monthly,
    additional_unit_price,
    included_quantity,
    card_surcharge_pct,
    unit_label,
    is_active,
    metadata
  ) values (
    coalesce(v_existing.id, p_service_id, gen_random_uuid()),
    v_service_code,
    btrim(p_display_name),
    p_service_category,
    p_pricing_model,
    round(coalesce(p_base_price_monthly, 0), 2),
    case when p_additional_unit_price is null then null else round(p_additional_unit_price, 2) end,
    greatest(coalesce(p_included_quantity, 0), 0),
    round(coalesce(p_card_surcharge_pct, 4.00), 2),
    coalesce(nullif(btrim(p_unit_label), ''), 'unit'),
    coalesce(p_is_active, true),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (service_code) do update
  set
    display_name = excluded.display_name,
    service_category = excluded.service_category,
    pricing_model = excluded.pricing_model,
    base_price_monthly = excluded.base_price_monthly,
    additional_unit_price = excluded.additional_unit_price,
    included_quantity = excluded.included_quantity,
    card_surcharge_pct = excluded.card_surcharge_pct,
    unit_label = excluded.unit_label,
    is_active = excluded.is_active,
    metadata = coalesce(public.billable_services.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now()
  returning id into v_service_id;

  perform public.log_subscription_billing_event(
    'billable_service_upserted',
    null,
    null,
    'billable_service',
    v_service_code,
    v_service_id,
    jsonb_build_object(
      'before', to_jsonb(v_existing),
      'after', jsonb_build_object(
        'service_code', v_service_code,
        'display_name', btrim(p_display_name),
        'service_category', p_service_category,
        'pricing_model', p_pricing_model,
        'base_price_monthly', round(coalesce(p_base_price_monthly, 0), 2),
        'additional_unit_price', p_additional_unit_price,
        'included_quantity', greatest(coalesce(p_included_quantity, 0), 0),
        'card_surcharge_pct', round(coalesce(p_card_surcharge_pct, 4.00), 2),
        'is_active', coalesce(p_is_active, true)
      )
    ),
    jsonb_build_object('source', 'upsert_billable_service')
  );

  for v_subscription_id in
    select distinct mss.subscription_id
    from public.merchant_subscription_services mss
    where mss.service_id = v_service_id
  loop
    perform public.recalc_subscription(v_subscription_id);
  end loop;

  return v_service_id;
end;
$function$;

revoke all on function public.upsert_billable_service(uuid, text, text, text, text, numeric, numeric, integer, numeric, text, boolean, jsonb) from public;
grant execute on function public.upsert_billable_service(uuid, text, text, text, text, numeric, numeric, integer, numeric, text, boolean, jsonb) to authenticated, service_role;

drop function if exists public.list_billable_services();
create or replace function public.list_billable_services(
  p_include_inactive boolean default false
)
returns setof public.billable_services
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
  select bs.*
  from public.billable_services bs
  where p_include_inactive or bs.is_active = true
  order by bs.service_category asc, bs.display_name asc;
$function$;

revoke all on function public.list_billable_services(boolean) from public;
grant execute on function public.list_billable_services(boolean) to authenticated, service_role;

create or replace function public.upsert_device_catalog(
  p_device_id uuid default null,
  p_device_category text default null,
  p_manufacturer text default null,
  p_model_name text default null,
  p_model_sku text default null,
  p_hardware_revision text default null,
  p_specs jsonb default '{}'::jsonb,
  p_unit_cost numeric default null,
  p_monthly_fee numeric default null,
  p_is_active boolean default true,
  p_image_url text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_device_id uuid;
  v_existing public.device_catalog%rowtype;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can manage device catalog';
  end if;

  if p_device_category not in (
    'pos_tablet',
    'cfd',
    'kds',
    'payment_terminal',
    'receipt_printer',
    'kitchen_printer',
    'cash_drawer'
  ) then
    raise exception 'Unsupported device category: %', p_device_category;
  end if;

  if coalesce(btrim(p_manufacturer), '') = '' then
    raise exception 'Manufacturer is required';
  end if;

  if coalesce(btrim(p_model_name), '') = '' then
    raise exception 'Model name is required';
  end if;

  if coalesce(p_unit_cost, 0) < 0 or coalesce(p_monthly_fee, 0) < 0 then
    raise exception 'Device catalog prices must be non-negative';
  end if;

  select *
  into v_existing
  from public.device_catalog dc
  where (p_device_id is not null and dc.id = p_device_id)
     or (
       nullif(btrim(coalesce(p_model_sku, '')), '') is not null
       and dc.model_sku = nullif(btrim(p_model_sku), '')
     )
  order by case when p_device_id is not null and dc.id = p_device_id then 0 else 1 end
  limit 1;

  if v_existing.id is not null then
    update public.device_catalog
    set
      device_category = p_device_category,
      manufacturer = btrim(p_manufacturer),
      model_name = btrim(p_model_name),
      model_sku = nullif(btrim(coalesce(p_model_sku, '')), ''),
      hardware_revision = nullif(btrim(coalesce(p_hardware_revision, '')), ''),
      specs = coalesce(p_specs, '{}'::jsonb),
      unit_cost = case when p_unit_cost is null then null else round(p_unit_cost, 2) end,
      unit_cost_cents = case when p_unit_cost is null then null else round(p_unit_cost * 100)::integer end,
      monthly_fee = case when p_monthly_fee is null then null else round(p_monthly_fee, 2) end,
      monthly_fee_cents = case when p_monthly_fee is null then null else round(p_monthly_fee * 100)::integer end,
      is_active = coalesce(p_is_active, true),
      discontinued_at = case when coalesce(p_is_active, true) then null else coalesce(discontinued_at, now()) end,
      image_url = nullif(btrim(coalesce(p_image_url, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
    where id = v_existing.id
    returning id into v_device_id;
  else
    insert into public.device_catalog (
      device_category,
      manufacturer,
      model_name,
      model_sku,
      hardware_revision,
      specs,
      unit_cost,
      unit_cost_cents,
      monthly_fee,
      monthly_fee_cents,
      is_active,
      discontinued_at,
      image_url,
      notes
    ) values (
      p_device_category,
      btrim(p_manufacturer),
      btrim(p_model_name),
      nullif(btrim(coalesce(p_model_sku, '')), ''),
      nullif(btrim(coalesce(p_hardware_revision, '')), ''),
      coalesce(p_specs, '{}'::jsonb),
      case when p_unit_cost is null then null else round(p_unit_cost, 2) end,
      case when p_unit_cost is null then null else round(p_unit_cost * 100)::integer end,
      case when p_monthly_fee is null then null else round(p_monthly_fee, 2) end,
      case when p_monthly_fee is null then null else round(p_monthly_fee * 100)::integer end,
      coalesce(p_is_active, true),
      case when coalesce(p_is_active, true) then null else now() end,
      nullif(btrim(coalesce(p_image_url, '')), ''),
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id into v_device_id;
  end if;

  perform public.log_subscription_billing_event(
    'device_catalog_upserted',
    null,
    null,
    'device_catalog',
    concat_ws(' ', btrim(p_manufacturer), btrim(p_model_name)),
    v_device_id,
    jsonb_build_object(
      'before', to_jsonb(v_existing),
      'after', jsonb_build_object(
        'device_category', p_device_category,
        'manufacturer', btrim(p_manufacturer),
        'model_name', btrim(p_model_name),
        'model_sku', nullif(btrim(coalesce(p_model_sku, '')), ''),
        'unit_cost', p_unit_cost,
        'monthly_fee', p_monthly_fee,
        'is_active', coalesce(p_is_active, true)
      )
    ),
    jsonb_build_object('source', 'upsert_device_catalog')
  );

  return v_device_id;
end;
$function$;

revoke all on function public.upsert_device_catalog(uuid, text, text, text, text, text, jsonb, numeric, numeric, boolean, text, text) from public;
grant execute on function public.upsert_device_catalog(uuid, text, text, text, text, text, jsonb, numeric, numeric, boolean, text, text) to authenticated, service_role;

create or replace function public.upsert_subscription_plan(
  p_plan_id uuid default null,
  p_plan_code text default null,
  p_display_name text default null,
  p_base_price_monthly numeric default null,
  p_included_stations integer default 1,
  p_per_extra_station_price numeric default 79.00,
  p_card_surcharge_pct numeric default 4.00,
  p_is_active boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_plan_id uuid;
  v_plan_code text := upper(btrim(coalesce(p_plan_code, '')));
  v_existing public.subscription_plans%rowtype;
  v_subscription_id uuid;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can manage subscription plans';
  end if;

  if v_plan_code = '' then
    raise exception 'Plan code is required';
  end if;

  if coalesce(btrim(p_display_name), '') = '' then
    raise exception 'Display name is required';
  end if;

  if coalesce(p_base_price_monthly, 0) < 0
     or coalesce(p_included_stations, 0) < 0
     or coalesce(p_per_extra_station_price, 0) < 0 then
    raise exception 'Plan prices and included stations must be non-negative';
  end if;

  if coalesce(p_card_surcharge_pct, 0) < 0 or coalesce(p_card_surcharge_pct, 0) > 100 then
    raise exception 'Card surcharge must be between 0 and 100';
  end if;

  select *
  into v_existing
  from public.subscription_plans sp
  where (p_plan_id is not null and sp.id = p_plan_id)
     or sp.plan_code = v_plan_code
  order by case when p_plan_id is not null and sp.id = p_plan_id then 0 else 1 end
  limit 1;

  insert into public.subscription_plans (
    id,
    plan_code,
    display_name,
    base_price_monthly,
    included_stations,
    per_extra_station_price,
    card_surcharge_pct,
    is_active,
    metadata
  ) values (
    coalesce(v_existing.id, p_plan_id, gen_random_uuid()),
    v_plan_code,
    btrim(p_display_name),
    round(coalesce(p_base_price_monthly, 0), 2),
    greatest(coalesce(p_included_stations, 1), 0),
    round(coalesce(p_per_extra_station_price, 0), 2),
    round(coalesce(p_card_surcharge_pct, 4.00), 2),
    coalesce(p_is_active, true),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (plan_code) do update
  set
    display_name = excluded.display_name,
    base_price_monthly = excluded.base_price_monthly,
    included_stations = excluded.included_stations,
    per_extra_station_price = excluded.per_extra_station_price,
    card_surcharge_pct = excluded.card_surcharge_pct,
    is_active = excluded.is_active,
    metadata = coalesce(public.subscription_plans.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now()
  returning id into v_plan_id;

  perform public.log_subscription_billing_event(
    'subscription_plan_upserted',
    null,
    null,
    'subscription_plan',
    v_plan_code,
    v_plan_id,
    jsonb_build_object(
      'before', to_jsonb(v_existing),
      'after', jsonb_build_object(
        'plan_code', v_plan_code,
        'display_name', btrim(p_display_name),
        'base_price_monthly', round(coalesce(p_base_price_monthly, 0), 2),
        'included_stations', greatest(coalesce(p_included_stations, 1), 0),
        'per_extra_station_price', round(coalesce(p_per_extra_station_price, 0), 2),
        'card_surcharge_pct', round(coalesce(p_card_surcharge_pct, 4.00), 2),
        'is_active', coalesce(p_is_active, true)
      )
    ),
    jsonb_build_object('source', 'upsert_subscription_plan')
  );

  for v_subscription_id in
    select ms.id
    from public.merchant_subscriptions ms
    where ms.plan_id = v_plan_id
      and ms.status <> 'canceled'
  loop
    perform public.recalc_subscription(v_subscription_id);
  end loop;

  return v_plan_id;
end;
$function$;

revoke all on function public.upsert_subscription_plan(uuid, text, text, numeric, integer, numeric, numeric, boolean, jsonb) from public;
grant execute on function public.upsert_subscription_plan(uuid, text, text, numeric, integer, numeric, numeric, boolean, jsonb) to authenticated, service_role;

create or replace function public.replace_merchant_subscription_services(
  p_subscription_id uuid,
  p_services jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_service_item jsonb;
  v_service_id uuid;
  v_quantity integer;
  v_enabled boolean;
  v_recalc record;
  v_service_count integer := 0;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can manage subscription service assignments';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  delete from public.merchant_subscription_services
  where subscription_id = p_subscription_id;

  for v_service_item in
    select value
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    begin
      v_service_id := nullif(btrim(v_service_item->>'service_id'), '')::uuid;
    exception when others then
      raise exception 'Invalid service_id in assignment payload';
    end;

    v_quantity := greatest(coalesce(nullif(v_service_item->>'quantity', '')::integer, 1), 0);
    v_enabled := coalesce((v_service_item->>'enabled')::boolean, true);

    if v_service_id is null or not v_enabled or v_quantity <= 0 then
      continue;
    end if;

    insert into public.merchant_subscription_services (
      subscription_id,
      service_id,
      quantity,
      is_enabled,
      metadata
    ) values (
      p_subscription_id,
      v_service_id,
      v_quantity,
      true,
      coalesce(v_service_item->'metadata', '{}'::jsonb)
    );

    v_service_count := v_service_count + 1;
  end loop;

  select *
  into v_recalc
  from public.recalc_subscription(p_subscription_id);

  perform public.log_subscription_billing_event(
    'subscription_services_replaced',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'merchant_subscription',
    null,
    p_subscription_id,
    jsonb_build_object(
      'assigned_service_count', v_service_count,
      'monthly_amount', v_recalc.monthly_amount,
      'subtotal', v_recalc.subtotal,
      'card_surcharge', v_recalc.card_surcharge
    ),
    jsonb_build_object(
      'source', 'replace_merchant_subscription_services',
      'line_items', v_recalc.line_items
    )
  );
end;
$function$;

revoke all on function public.replace_merchant_subscription_services(uuid, jsonb) from public;
grant execute on function public.replace_merchant_subscription_services(uuid, jsonb) to authenticated, service_role;

create or replace function public.generate_subscription_invoice_snapshot(
  p_subscription_id uuid,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_billing_method text := 'card';
  v_station_count integer := 0;
  v_services jsonb := '[]'::jsonb;
  v_calc record;
  v_invoice_id uuid;
  v_invoice_number text;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can generate subscription invoice snapshots';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.status = 'canceled' then
    raise exception 'Cannot generate invoice for canceled subscription %', p_subscription_id;
  end if;

  if v_subscription.status = 'trial'
     and v_subscription.trial_ends_at is not null
     and v_subscription.trial_ends_at::date > current_date then
    raise exception 'Subscription % is still in trial', p_subscription_id;
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  v_station_count := public.get_active_station_count(v_subscription.location_id);

  select coalesce(
    jsonb_agg(jsonb_build_object('service_id', mss.service_id, 'quantity', mss.quantity)),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

  select *
  into v_calc
  from public.calculate_subscription_total(
    v_subscription.plan_id,
    v_station_count,
    v_services,
    coalesce(v_billing_method, 'card')
  );

  v_invoice_number := public.generate_subscription_invoice_number(coalesce(p_due_date, v_subscription.next_billing_date));

  insert into public.subscription_invoices (
    subscription_id,
    merchant_id,
    location_id,
    invoice_number,
    billing_period_start,
    billing_period_end,
    station_count_snapshot,
    billing_method,
    line_items,
    subtotal,
    card_surcharge,
    total_amount,
    status,
    due_date,
    billing_profile_id,
    metadata
  ) values (
    v_subscription.id,
    v_subscription.merchant_id,
    v_subscription.location_id,
    v_invoice_number,
    v_subscription.current_period_start,
    v_subscription.current_period_end,
    v_station_count,
    coalesce(v_billing_method, 'card'),
    v_calc.line_items,
    v_calc.subtotal,
    v_calc.card_surcharge,
    v_calc.total_amount,
    'open',
    coalesce(p_due_date, v_subscription.next_billing_date),
    v_subscription.billing_profile_id,
    coalesce(v_subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_model', 'unified_calculator',
      'test_duplicate', true
    )
  )
  returning id into v_invoice_id;

  perform public.log_subscription_billing_event(
    'invoice_generated',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'subscription_invoice',
    v_invoice_number,
    v_invoice_id,
    jsonb_build_object(
      'subscription_id', v_subscription.id,
      'billing_period_start', v_subscription.current_period_start,
      'billing_period_end', v_subscription.current_period_end,
      'station_count_snapshot', v_station_count,
      'billing_method', coalesce(v_billing_method, 'card'),
      'subtotal', v_calc.subtotal,
      'card_surcharge', v_calc.card_surcharge,
      'total_amount', v_calc.total_amount,
      'test_duplicate', true
    ),
    jsonb_build_object('line_items', v_calc.line_items)
  );

  return v_invoice_id;
end;
$function$;

revoke all on function public.generate_subscription_invoice_snapshot(uuid, date) from public;
grant execute on function public.generate_subscription_invoice_snapshot(uuid, date) to authenticated, service_role;

create or replace function public.generate_subscription_invoice(
  p_subscription_id uuid,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_billing_method text := 'card';
  v_station_count integer := 0;
  v_services jsonb := '[]'::jsonb;
  v_calc record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_new_period_start date;
  v_new_period_end date;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can generate subscription invoices';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.status = 'canceled' then
    raise exception 'Cannot generate invoice for canceled subscription %', p_subscription_id;
  end if;

  if v_subscription.status = 'trial'
     and v_subscription.trial_ends_at is not null
     and v_subscription.trial_ends_at::date > current_date then
    raise exception 'Subscription % is still in trial', p_subscription_id;
  end if;

  if exists (
    select 1
    from public.subscription_invoices si
    where si.subscription_id = p_subscription_id
      and si.billing_period_start = v_subscription.current_period_start
  ) then
    raise exception 'Invoice already exists for subscription % and period %', p_subscription_id, v_subscription.current_period_start;
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  v_station_count := public.get_active_station_count(v_subscription.location_id);

  select coalesce(
    jsonb_agg(jsonb_build_object('service_id', mss.service_id, 'quantity', mss.quantity)),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

  select *
  into v_calc
  from public.calculate_subscription_total(
    v_subscription.plan_id,
    v_station_count,
    v_services,
    coalesce(v_billing_method, 'card')
  );

  v_invoice_number := public.generate_subscription_invoice_number(coalesce(p_due_date, v_subscription.next_billing_date));

  insert into public.subscription_invoices (
    subscription_id,
    merchant_id,
    location_id,
    invoice_number,
    billing_period_start,
    billing_period_end,
    station_count_snapshot,
    billing_method,
    line_items,
    subtotal,
    card_surcharge,
    total_amount,
    status,
    due_date,
    billing_profile_id,
    metadata
  ) values (
    v_subscription.id,
    v_subscription.merchant_id,
    v_subscription.location_id,
    v_invoice_number,
    v_subscription.current_period_start,
    v_subscription.current_period_end,
    v_station_count,
    coalesce(v_billing_method, 'card'),
    v_calc.line_items,
    v_calc.subtotal,
    v_calc.card_surcharge,
    v_calc.total_amount,
    'open',
    coalesce(p_due_date, v_subscription.next_billing_date),
    v_subscription.billing_profile_id,
    coalesce(v_subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_model', 'unified_calculator'
    )
  )
  returning id into v_invoice_id;

  v_new_period_start := v_subscription.current_period_end + 1;
  v_new_period_end := (v_new_period_start + interval '1 month' - interval '1 day')::date;

  update public.merchant_subscriptions
  set
    station_count = v_station_count,
    monthly_amount = v_calc.total_amount,
    current_period_start = v_new_period_start,
    current_period_end = v_new_period_end,
    next_billing_date = v_new_period_start,
    updated_at = now()
  where id = v_subscription.id;

  perform public.log_subscription_billing_event(
    'subscription_invoice',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'subscription_invoice',
    v_invoice_number,
    v_invoice_id,
    jsonb_build_object(
      'subscription_id', v_subscription.id,
      'billing_period_start', v_subscription.current_period_start,
      'billing_period_end', v_subscription.current_period_end,
      'station_count_snapshot', v_station_count,
      'billing_method', coalesce(v_billing_method, 'card'),
      'subtotal', v_calc.subtotal,
      'card_surcharge', v_calc.card_surcharge,
      'total_amount', v_calc.total_amount
    ),
    jsonb_build_object('line_items', v_calc.line_items)
  );

  return v_invoice_id;
end;
$function$;

revoke all on function public.generate_subscription_invoice(uuid, date) from public;
grant execute on function public.generate_subscription_invoice(uuid, date) to authenticated, service_role;
