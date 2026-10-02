-- Rollback for 20260930130000_uniform_card_surcharge.sql
--
-- Restores the three functions to the definitions that were live before it and
-- removes the helper. Per-service rates that were normalised by the migration
-- are NOT restored (the previous values are not recorded); every service was at
-- 4% on staging, and only `loyalty` differed on prod (0%, set during a test).

CREATE OR REPLACE FUNCTION public.calculate_billable_service_amounts(p_service_id uuid, p_quantity integer, p_billing_method text DEFAULT 'card'::text)
 RETURNS TABLE(service_code text, display_name text, service_category text, pricing_model text, quantity integer, base_price_monthly numeric, additional_unit_price numeric, included_quantity integer, card_surcharge_pct numeric, subtotal numeric, card_surcharge numeric, total_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_service public.billable_services%rowtype;
  v_quantity integer := greatest(coalesce(p_quantity, 0), 0);
  v_subtotal numeric(10,2) := 0;
  v_surcharge numeric(10,2) := 0;
  v_included integer;
begin
  select *
  into v_service
  from public.billable_services bs
  where bs.id = p_service_id;

  if not found then
    raise exception 'Billable service not found: %', p_service_id;
  end if;

  v_included := greatest(coalesce(v_service.included_quantity, 1), 0);

  case v_service.pricing_model
    when 'flat' then
      v_subtotal := case when v_quantity > 0 then round(v_service.base_price_monthly, 2) else 0::numeric end;
    when 'per_unit' then
      v_subtotal := round(v_service.base_price_monthly * v_quantity, 2);
    when 'tiered' then
      v_subtotal := case
        when v_quantity <= 0 then 0::numeric
        when v_quantity <= v_included then round(v_service.base_price_monthly, 2)
        else round(
          v_service.base_price_monthly
          + ((v_quantity - v_included) * coalesce(v_service.additional_unit_price, 0)),
          2
        )
      end;
    else
      raise exception 'Unsupported pricing model: %', v_service.pricing_model;
  end case;

  v_surcharge := case
    when coalesce(p_billing_method, 'card') = 'card'
      then round(v_subtotal * (v_service.card_surcharge_pct / 100.0), 2)
    else 0::numeric
  end;

  return query
  select
    v_service.service_code,
    v_service.display_name,
    v_service.service_category,
    v_service.pricing_model,
    v_quantity,
    v_service.base_price_monthly,
    v_service.additional_unit_price,
    v_service.included_quantity,
    v_service.card_surcharge_pct,
    v_subtotal,
    v_surcharge,
    round(v_subtotal + v_surcharge, 2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_subscription_total(p_plan_id uuid DEFAULT NULL::uuid, p_station_count integer DEFAULT 0, p_services jsonb DEFAULT '[]'::jsonb, p_billing_method text DEFAULT 'card'::text)
 RETURNS TABLE(station_count integer, billing_method text, line_items jsonb, subtotal numeric, card_surcharge numeric, total_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    if v_plan_scope = 'merchant_tier' then
      -- Merchant tier is priced by location count (passed in as p_station_count);
      -- it must never carry location services.
      if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) > 0 then
        raise exception 'Merchant tier pricing cannot include location services';
      end if;
    end if;
    v_base_price := case
      when v_plan_scope = 'merchant_tier'
        then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
      -- Location/service-billing scope: no base line. The merchant tier is the
      -- only place a base is charged; locations bill devices + add-ons only.
      else 0
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
          'code', case when v_plan_scope = 'merchant_tier' then 'additional_locations' else 'extra_stations' end,
          'description', case when v_plan_scope = 'merchant_tier'
            then 'Additional locations beyond the first'
            else 'Extra active stations beyond included count' end,
          'category', 'plan',
          'pricing_model', 'per_unit',
          'quantity', v_overage,
          'unit_label', case when v_plan_scope = 'merchant_tier' then 'location' else 'station' end,
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

CREATE OR REPLACE FUNCTION public.upsert_billable_service(p_service_id uuid DEFAULT NULL::uuid, p_service_code text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_service_category text DEFAULT 'service'::text, p_pricing_model text DEFAULT 'flat'::text, p_base_price_monthly numeric DEFAULT 0, p_additional_unit_price numeric DEFAULT NULL::numeric, p_included_quantity integer DEFAULT 0, p_card_surcharge_pct numeric DEFAULT 4.00, p_unit_label text DEFAULT 'unit'::text, p_is_active boolean DEFAULT true, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

comment on column public.billable_services.card_surcharge_pct is null;

drop function if exists public.platform_card_surcharge_pct();
