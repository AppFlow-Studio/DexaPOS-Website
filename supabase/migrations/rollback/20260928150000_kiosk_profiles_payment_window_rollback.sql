-- Rollback for 20260928150000_kiosk_profiles_payment_window.sql
-- Drops the CodePay kiosk payment window. Prefer setting the column to NULL
-- (legacy behaviour, no prompt) over running this: kiosks read NULL and a
-- missing column the same way, but NULL needs no DDL.

ALTER TABLE public.kiosk_profiles
  DROP CONSTRAINT IF EXISTS kiosk_profiles_payment_window_seconds_check;

ALTER TABLE public.kiosk_profiles
  DROP COLUMN IF EXISTS payment_window_seconds;
