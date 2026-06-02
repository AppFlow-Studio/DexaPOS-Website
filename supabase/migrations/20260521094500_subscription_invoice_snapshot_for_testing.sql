-- Admin/testing helper: generate an additional invoice snapshot for the
-- current subscription period without advancing the subscription cycle.

create or replace function public.generate_subscription_invoice_snapshot(
  p_subscription_id uuid,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_billing_method text := 'card';
  v_station_count integer;
  v_calc record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_items jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_card_surcharge numeric(10,2) := 0;
  v_total_amount numeric(10,2) := 0;
  v_service_assignment_count integer := 0;
  v_plan_base_price numeric(10,2) := 0;
  v_plan_scope text := 'service_billing';
  v_tier_card_surcharge numeric(10,2) := 0;
  v_has_plan boolean := false;
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

  if v_subscription.plan_id is not null then
    select *
    into v_plan
    from public.subscription_plans sp
    where sp.id = v_subscription.plan_id;

    v_has_plan := found;

    if v_has_plan then
      v_plan_scope := coalesce(v_plan.plan_scope, 'service_billing');
      v_plan_base_price := case
        when v_plan_scope = 'merchant_tier'
          then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
        else v_plan.base_price_monthly
      end;
    end if;
  end if;

  v_station_count := public.get_active_station_count(v_subscription.location_id);

  select count(*)::integer
  into v_service_assignment_count
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

  if v_service_assignment_count > 0 then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'code', calc.service_code,
            'description', calc.display_name,
            'category', calc.service_category,
            'pricing_model', calc.pricing_model,
            'quantity', calc.quantity,
            'unit_label', bs.unit_label,
            'base_price_monthly', calc.base_price_monthly,
            'additional_unit_price', calc.additional_unit_price,
            'included_quantity', calc.included_quantity,
            'subtotal', calc.subtotal,
            'card_surcharge', calc.card_surcharge,
            'total_amount', calc.total_amount
          )
          order by bs.service_category asc, bs.display_name asc
        ),
        '[]'::jsonb
      ),
      coalesce(sum(calc.subtotal), 0)::numeric(10,2),
      coalesce(sum(calc.card_surcharge), 0)::numeric(10,2),
      coalesce(sum(calc.total_amount), 0)::numeric(10,2)
    into v_line_items, v_subtotal, v_card_surcharge, v_total_amount
    from public.merchant_subscription_services mss
    join public.billable_services bs on bs.id = mss.service_id
    join lateral public.calculate_billable_service_amounts(
      mss.service_id,
      mss.quantity,
      coalesce(v_billing_method, 'card')
    ) calc on true
    where mss.subscription_id = v_subscription.id
      and mss.is_enabled = true
      and mss.quantity > 0;
  else
    if v_subscription.plan_id is null or not v_has_plan then
      raise exception 'Subscription plan not found for subscription %', p_subscription_id;
    end if;
  end if;

  if v_plan_scope = 'merchant_tier' and v_subscription.plan_id is not null then
    v_tier_card_surcharge := case
      when coalesce(v_billing_method, 'card') = 'card'
        then round(v_plan_base_price * (coalesce(v_plan.card_surcharge_pct, 0) / 100.0), 2)
      else 0::numeric
    end;

    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', 'merchant_tier_base',
        'description', v_plan.display_name || ' monthly base',
        'quantity', 1,
        'unit_price', v_plan_base_price,
        'amount', v_plan_base_price
      )
    );

    if v_tier_card_surcharge > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'merchant_tier_card_surcharge',
          'description', 'Card surcharge baked into merchant tier price',
          'quantity', 1,
          'unit_price', v_tier_card_surcharge,
          'amount', v_tier_card_surcharge
        )
      );
    end if;

    v_subtotal := round(v_subtotal + v_plan_base_price, 2);
    v_card_surcharge := round(v_card_surcharge + v_tier_card_surcharge, 2);
    v_total_amount := round(v_subtotal + v_card_surcharge, 2);
  elsif v_service_assignment_count = 0 then
    select *
    into v_calc
    from public.calculate_subscription_amounts(
      v_subscription.plan_id,
      v_station_count,
      coalesce(v_billing_method, 'card')
    );

    v_subtotal := v_calc.subtotal;
    v_card_surcharge := v_calc.card_surcharge;
    v_total_amount := v_calc.total_amount;

    v_line_items := jsonb_build_array(
      jsonb_build_object(
        'code', 'base_monthly',
        'description', v_plan.display_name || ' monthly base',
        'quantity', 1,
        'unit_price', v_plan_base_price,
        'amount', v_plan_base_price
      )
    );

    if v_calc.station_overage > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'extra_stations',
          'description', 'Extra active stations beyond included count',
          'quantity', v_calc.station_overage,
          'unit_price', v_plan.per_extra_station_price,
          'amount', round(v_calc.station_overage * v_plan.per_extra_station_price, 2)
        )
      );
    end if;

    if v_calc.card_surcharge > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'card_surcharge',
          'description', 'Card surcharge baked into displayed price',
          'quantity', 1,
          'unit_price', v_calc.card_surcharge,
          'amount', v_calc.card_surcharge
        )
      );
    end if;
  end if;

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
    v_line_items,
    v_subtotal,
    v_card_surcharge,
    v_total_amount,
    'open',
    coalesce(p_due_date, v_subscription.next_billing_date),
    v_subscription.billing_profile_id,
    coalesce(v_subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'service_assignment_count', v_service_assignment_count,
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
      'subtotal', v_subtotal,
      'card_surcharge', v_card_surcharge,
      'total_amount', v_total_amount,
      'service_assignment_count', v_service_assignment_count,
      'test_duplicate', true
    ),
    jsonb_build_object('line_items', v_line_items)
  );

  return v_invoice_id;
end;
$function$;
revoke all on function public.generate_subscription_invoice_snapshot(uuid, date) from public;
grant execute on function public.generate_subscription_invoice_snapshot(uuid, date) to authenticated, service_role;
