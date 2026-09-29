-- ============================================================================
-- kiosk_profiles.payment_window_seconds — on by default at 45s
-- ============================================================================
-- 20260928150000 added the CodePay kiosk card window as NULL (legacy 120s
-- Register window, no "Need more time?" prompt). This turns it on everywhere:
-- new profiles default to 45s and existing NULL profiles are backfilled to 45.
-- 45 is the CHECK minimum and the POS clamp's lower bound
-- (types/kiosk.ts asPaymentWindowSeconds).
--
-- NULL is still the per-profile kill switch: set a profile back to NULL to
-- return it to the legacy window (kiosks apply it when idle, no OTA). Only
-- CodePay kiosks read the value; other terminals ignore it.
--
-- Requires 20260928150000_kiosk_profiles_payment_window.sql.
-- ============================================================================

ALTER TABLE public.kiosk_profiles
  ALTER COLUMN payment_window_seconds SET DEFAULT 45;

UPDATE public.kiosk_profiles
   SET payment_window_seconds = 45
 WHERE payment_window_seconds IS NULL;

COMMENT ON COLUMN public.kiosk_profiles.payment_window_seconds IS
  'CodePay kiosk card window in seconds (CodePay Register order expires), 45-180, default 45. NULL = legacy 120s window with no "Need more time?" prompt (per-profile kill switch).';
