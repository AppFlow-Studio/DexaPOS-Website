-- POS Tablet is billed as a tiered device charge: the first tablet is $99, then
-- $49 for each additional tablet. This replaces the flat $39/tablet price and is
-- billed inline (explicit opt-in per location), not as an auto per-station charge.
-- Both calculate_billable_service_amounts and the HQ UI already support 'tiered'
-- pricing (base for the first `included_quantity`, then additional_unit_price each).

begin;

update public.billable_services
set pricing_model      = 'tiered',
    base_price_monthly = 99.00,
    additional_unit_price = 49.00,
    included_quantity  = 1,
    updated_at         = now()
where service_code = 'pos_tablet';

commit;
