-- Merge "Delivery App Integration" into "Orderout" — they are the same feature
-- (third-party delivery marketplaces flowing straight into the POS). Keep
-- `orderout` as the single canonical billable service, retitle it, and retire
-- the duplicate `delivery_app_integration`.
--
--   * `orderout` gates the OrderOut dashboard tab (FeaturePaywall
--     serviceCode="orderout") and already carries every live assignment;
--     `delivery_app_integration` was a duplicate catalog entry (0 assignments on
--     staging) that showed up as a second "Delivery App Integration" feature.
--   * The feature list (HqSubscriptionsWorkspace, MerchantBillingSetupCard) and
--     the paywall header both read straight from billable_services, so renaming
--     display_name + deactivating the duplicate is all that's needed on the UI.
--   * Re-point any lingering delivery_app_integration assignments onto orderout
--     (skipping subscriptions that already have orderout, to respect the
--     UNIQUE(subscription_id, service_id) constraint), then delete the leftovers,
--     so no location loses the entitlement on any environment (prod may differ
--     from staging).

begin;

-- 1. Re-point assignments: delivery_app_integration -> orderout, only where the
--    subscription does not already have an orderout assignment.
update public.merchant_subscription_services mss
set service_id = (select id from public.billable_services where service_code = 'orderout'),
    updated_at = now()
where mss.service_id = (select id from public.billable_services where service_code = 'delivery_app_integration')
  and not exists (
    select 1
    from public.merchant_subscription_services other
    where other.subscription_id = mss.subscription_id
      and other.service_id = (select id from public.billable_services where service_code = 'orderout')
  );

-- 2. Drop any remaining delivery_app_integration assignments (their subscription
--    already carried orderout — the entitlement is preserved).
delete from public.merchant_subscription_services
where service_id = (select id from public.billable_services where service_code = 'delivery_app_integration');

-- 3. Retitle the canonical OrderOut service.
update public.billable_services
set display_name = 'OrderOut ( Grubhub, Ubereats, Doordash ) right into your POS',
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('merged_delivery_app_integration', true),
    updated_at = now()
where service_code = 'orderout';

-- 4. Retire the duplicate so it no longer appears in the catalog / feature list.
update public.billable_services
set is_active = false,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('merged_into', 'orderout'),
    updated_at = now()
where service_code = 'delivery_app_integration';

commit;
