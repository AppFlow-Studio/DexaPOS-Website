-- Location subscriptions are devices-only, so their plan_id is NULL. The previous
-- INNER JOIN to subscription_plans dropped every plan-less location subscription
-- from list_merchant_subscriptions, so they vanished from the HQ workspace
-- ("No subscription yet for this location") and the overview counts read 0.
-- LEFT JOIN the plan so plan-less location subscriptions are still returned
-- (plan_code / display_name are simply NULL for them).

begin;

create or replace function public.list_merchant_subscriptions(p_merchant_id uuid default null::uuid)
returns table(
  id uuid, merchant_id uuid, location_id uuid, location_name text, plan_id uuid,
  plan_code text, display_name text, current_period_start date, current_period_end date,
  next_billing_date date, station_count integer, monthly_amount numeric, status text,
  trial_ends_at timestamp with time zone, canceled_at timestamp with time zone,
  cancel_reason text, billing_profile_id uuid, billing_method text, metadata jsonb,
  created_at timestamp with time zone, updated_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (
       public.is_dexapos_admin()
       or coalesce(auth.jwt()->>'role', '') = 'service_role'
       or (p_merchant_id is not null and public.user_belongs_to_merchant(p_merchant_id))
     ) then
    raise exception 'Unauthorized merchant access';
  end if;

  return query
  select
    ms.id,
    ms.merchant_id,
    ms.location_id,
    l.name as location_name,
    ms.plan_id,
    sp.plan_code,
    sp.display_name,
    ms.current_period_start,
    ms.current_period_end,
    ms.next_billing_date,
    ms.station_count,
    ms.monthly_amount,
    ms.status,
    ms.trial_ends_at,
    ms.canceled_at,
    ms.cancel_reason,
    ms.billing_profile_id,
    linked_profile.billing_method,
    ms.metadata,
    ms.created_at,
    ms.updated_at
  from public.merchant_subscriptions ms
  left join public.subscription_plans sp on sp.id = ms.plan_id
  join public.locations l on l.id = ms.location_id
  left join public.merchant_billing_profiles linked_profile on linked_profile.id = ms.billing_profile_id
  where (p_merchant_id is null or ms.merchant_id = p_merchant_id)
    and ms.metadata->>'billing_scope' <> 'legacy'
  order by l.name asc, ms.created_at desc;
end;
$function$;

commit;
