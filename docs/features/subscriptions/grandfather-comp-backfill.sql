-- Grandfather comp backfill for the phased FeaturePaywall rollout.
--
-- WHAT: entitles every existing (non-canceled) location subscription to the
-- paywall-gated feature services at $0 — a "comped" assignment. Comped rows make
-- get_subscription_entitlement return entitled=true (unlock) while the pricing
-- paths (recalc_subscription / generate_subscription_invoice) SKIP them, so the
-- merchant is never charged.
--
-- WHEN: run this at PHASE 2, immediately BEFORE flipping PAYWALL_ENABLED=true in
-- components/billing/FeaturePaywall.tsx. Running it at cutover (not earlier)
-- grandfathers everyone who exists when the gate goes live; merchants created
-- AFTER cutover are not comped and will pay when they enable a feature.
--
-- SCOPE: only the FeaturePaywall-gated services. The genuinely-metered services
-- (pos_tablet, kds, loyalty) are deliberately NOT comped.
--
-- SAFE: idempotent (NOT EXISTS guard) — re-running inserts nothing new.

INSERT INTO public.merchant_subscription_services
  (subscription_id, service_id, quantity, is_enabled, metadata)
SELECT
  s.id,
  bs.id,
  1,
  true,
  jsonb_build_object(
    'comped', true,
    'grandfathered', true,
    'reason', 'phase1_saas_billing_grandfather'
  )
FROM public.merchant_subscriptions s
CROSS JOIN public.billable_services bs
WHERE s.status <> 'canceled'
  AND bs.is_active
  AND bs.service_code IN (
    'fine_dining', 'website_builder', 'online_ordering', 'orderout', 'qr_table_ordering'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.merchant_subscription_services mss
    WHERE mss.subscription_id = s.id
      AND mss.service_id = bs.id
  );

-- Verify: count comped grandfather rows.
-- SELECT count(*) FROM public.merchant_subscription_services
-- WHERE metadata->>'reason' = 'phase1_saas_billing_grandfather';

-- Rollback (if ever needed): remove ONLY the grandfather rows.
-- DELETE FROM public.merchant_subscription_services
-- WHERE metadata->>'reason' = 'phase1_saas_billing_grandfather';
