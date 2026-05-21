-- Product override for staging/demo: assign visible prices to merchant tiers.

update public.subscription_plans
set
  monthly_price_cents = case plan_code
    when 'basic' then 9900
    when 'multi_location' then 19900
    when 'franchise' then 29900
    else monthly_price_cents
  end,
  base_price_monthly = case plan_code
    when 'basic' then 99
    when 'multi_location' then 199
    when 'franchise' then 299
    else base_price_monthly
  end,
  updated_at = now()
where coalesce(plan_scope, 'service_billing') = 'merchant_tier';
