-- Refresh the merchant-visible tier catalog without changing referenced plan
-- IDs or legacy plan codes. Existing subscriptions and feature gates continue
-- to resolve basic, multi_location, and franchise internally.

do $migration$
declare
  v_updated_count integer;
begin
  with requested_catalog(
    plan_code,
    display_name,
    monthly_price_cents,
    description,
    display_order,
    billing_unit
  ) as (
    values
      (
        'basic'::text,
        'Quick-Service (First Station)'::text,
        5999::integer,
        'Built for fast-paced quick-service restaurants.'::text,
        1::integer,
        'first_quick_service_station'::text
      ),
      (
        'multi_location'::text,
        'Fine Dining (First Station)'::text,
        9999::integer,
        'Built for full-service and fine-dining restaurants.'::text,
        2::integer,
        'first_fine_dining_station'::text
      ),
      (
        'franchise'::text,
        'Additional Station'::text,
        4999::integer,
        'Every register after the first station.'::text,
        3::integer,
        'additional_station'::text
      )
  )
  update public.subscription_plans as plans
  set
    display_name = requested.display_name,
    monthly_price_cents = requested.monthly_price_cents,
    base_price_monthly = round(requested.monthly_price_cents::numeric / 100, 2),
    description = requested.description,
    display_order = requested.display_order,
    is_active = true,
    metadata = coalesce(plans.metadata, '{}'::jsonb) || jsonb_build_object(
      'billing_presentation', requested.billing_unit,
      'legacy_plan_code', plans.plan_code,
      'catalog_refreshed_at', '2026-08-16'
    ),
    updated_at = now()
  from requested_catalog as requested
  where plans.plan_scope = 'merchant_tier'
    and plans.plan_code = requested.plan_code;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 3 then
    raise exception
      'Expected to refresh 3 merchant tier rows, refreshed % instead.',
      v_updated_count;
  end if;
end;
$migration$;
