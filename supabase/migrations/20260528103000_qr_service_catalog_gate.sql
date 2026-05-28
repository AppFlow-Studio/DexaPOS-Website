-- QR Table Ordering billing gate
-- Adds QR Table Ordering to the existing service catalog so merchant/dashboard
-- gating can rely on the subscription service model without inventing a new flag.

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
) values (
  'qr_table_ordering',
  'QR Table Ordering',
  'service',
  'flat',
  0.00,
  null,
  1,
  4.00,
  'service',
  true,
  jsonb_build_object(
    'seeded_from', 'qr_billing_gate',
    'required_plan_code', 'multi_location',
    'required_plan_scope', 'merchant_tier',
    'allows_hq_override', true,
    'pricing_status', 'pending_finalization'
  )
)
on conflict (service_code) do update
set
  display_name = excluded.display_name,
  service_category = excluded.service_category,
  pricing_model = excluded.pricing_model,
  additional_unit_price = excluded.additional_unit_price,
  included_quantity = excluded.included_quantity,
  card_surcharge_pct = excluded.card_surcharge_pct,
  unit_label = excluded.unit_label,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();
