-- ============================================================================
-- kiosk_profiles.payment_window_seconds — on by default at 60s
-- ============================================================================
-- 20260928150000 added the CodePay kiosk card window as NULL (legacy 120s
-- Register window, no "Need more time?" prompt). This turns it on everywhere:
-- new profiles default to 60s and existing NULL profiles are backfilled to 60.
-- 60s is the merchant spec ("not completed within 1 minute → ask for more
-- time") and what CodePay Register does on the terminal (a 45s window still
-- closed at ~60s in the 2026-09-29 staging test). The CHECK stays 45–180.
--
-- NULL is still the per-profile kill switch: set a profile back to NULL to
-- return it to the legacy window (kiosks apply it when idle, no OTA). Only
-- CodePay kiosks read the value; other terminals ignore it.
--
-- Requires 20260928150000_kiosk_profiles_payment_window.sql.
-- ============================================================================

ALTER TABLE public.kiosk_profiles
  ALTER COLUMN payment_window_seconds SET DEFAULT 60;

UPDATE public.kiosk_profiles
   SET payment_window_seconds = 60
 WHERE payment_window_seconds IS NULL;

COMMENT ON COLUMN public.kiosk_profiles.payment_window_seconds IS
  'CodePay kiosk card window in seconds (CodePay Register order expires), 45-180, default 60. NULL = legacy 120s window with no "Need more time?" prompt (per-profile kill switch).';
