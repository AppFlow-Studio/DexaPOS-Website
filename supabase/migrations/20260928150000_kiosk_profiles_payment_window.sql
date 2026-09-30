-- ============================================================================
-- kiosk_profiles.payment_window_seconds — CodePay kiosk card window
-- ============================================================================
-- How long CodePay Register keeps the card screen open on a kiosk sale (the
-- Register order `expires`). When the window lapses with no payment, the kiosk
-- asks the customer "Need more time?" and cancels the order after 30s with no
-- answer.
--
-- NULL = legacy behaviour (120s Register window, no prompt). The kiosk polls
-- its profile every ~3 min and applies changes when idle, so this column is
-- the remote canary / kill switch: set it on one cloned profile to canary, set
-- it back to NULL to roll back without an OTA or a kiosk restart.
--
-- Additive + nullable: older app builds ignore it.
-- ============================================================================

ALTER TABLE public.kiosk_profiles
  ADD COLUMN IF NOT EXISTS payment_window_seconds integer NULL;

ALTER TABLE public.kiosk_profiles
  DROP CONSTRAINT IF EXISTS kiosk_profiles_payment_window_seconds_check;

ALTER TABLE public.kiosk_profiles
  ADD CONSTRAINT kiosk_profiles_payment_window_seconds_check
  CHECK (
    payment_window_seconds IS NULL
    OR payment_window_seconds BETWEEN 45 AND 180
  );

COMMENT ON COLUMN public.kiosk_profiles.payment_window_seconds IS
  'CodePay kiosk card window in seconds (CodePay Register order expires). NULL = legacy 120s window with no "Need more time?" prompt.';
