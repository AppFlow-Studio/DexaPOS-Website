-- ============================================================================
-- A7 — FTD/ECOM key vaulting verification (READ-ONLY, run in SQL editor)
--
-- The migration 20260409170000_secure_online_ordering_payment_devices.sql
-- already vaulted ipospays_ftd_ecom_key → location_payment_devices.
-- No new migration is needed. Run these queries on prod to confirm.
-- ============================================================================

-- 1. All rows should have ipospays_ftd_ecom_key = NULL (nulled out by migration)
SELECT id, location_id, ipospays_ftd_ecom_key
FROM   public.online_store_config
WHERE  ipospays_ftd_ecom_key IS NOT NULL;
-- Expected: 0 rows

-- 2. Every store config with a TPN should have a matching vaulted device
SELECT
  osc.id            AS config_id,
  osc.location_id,
  osc.ipospays_tpn,
  lpd.id            AS device_id,
  lpd.ftd_ecom_key_secret_id
FROM public.online_store_config osc
LEFT JOIN public.location_payment_devices lpd
  ON lpd.location_id = osc.location_id
 AND lpd.tpn = osc.ipospays_tpn
WHERE osc.ipospays_tpn IS NOT NULL;
-- Expected: every row has a non-NULL device_id and ftd_ecom_key_secret_id

-- 3. All vault secrets for FTD keys are populated
SELECT COUNT(*) AS vaulted_ftd_count
FROM   public.location_payment_devices
WHERE  ftd_ecom_key_secret_id IS NOT NULL;
-- Expected: matches the number of active online-ordering devices
