-- Rollback for 20260929120000_kiosk_profiles_payment_window_default_60.sql
-- Drops the 60s default and returns 60s profiles to NULL (legacy window, no
-- prompt). Backfilled rows can't be told apart from profiles set to 60 on
-- purpose, so every 60s profile goes back to NULL; other values are kept.

ALTER TABLE public.kiosk_profiles
  ALTER COLUMN payment_window_seconds DROP DEFAULT;

UPDATE public.kiosk_profiles
   SET payment_window_seconds = NULL
 WHERE payment_window_seconds = 60;

COMMENT ON COLUMN public.kiosk_profiles.payment_window_seconds IS
  'CodePay kiosk card window in seconds (CodePay Register order expires). NULL = legacy 120s window with no "Need more time?" prompt.';
