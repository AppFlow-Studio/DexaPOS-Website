-- ============================================================================
-- OrderOut merchant channel self-confirmation
-- Adds per-platform self-attestation on orderout_restaurants so merchants can
-- unblock the "Push Menus to Connected Channels" flow BEFORE any webhook has
-- confirmed a real connection. The push-guard and UI both take the union of
--   (webhook-verified channels) ∪ (merchant-confirmed channels).
-- ============================================================================

ALTER TABLE public.orderout_restaurants
  ADD COLUMN IF NOT EXISTS channels_confirmed_by_merchant text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS channels_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS channels_confirmed_by_user_id text;

COMMENT ON COLUMN public.orderout_restaurants.channels_confirmed_by_merchant IS
  'Canonical UPPERCASE platform identifiers (UBEREATS, DOORDASH, GRUBHUB) the merchant has self-attested to connecting in the OrderOut dashboard. Unioned with connected_channels for push-guard and UI display.';

COMMENT ON COLUMN public.orderout_restaurants.channels_confirmed_at IS
  'Timestamp when the merchant last updated channels_confirmed_by_merchant.';

COMMENT ON COLUMN public.orderout_restaurants.channels_confirmed_by_user_id IS
  'Clerk user id of the merchant admin who last updated channels_confirmed_by_merchant.';

-- No new RLS policies needed — existing oo_restaurants_update_own
-- (USING is_merchant_admin(merchant_id)) already authorizes merchant admins
-- to UPDATE this row. The existing update_updated_at_column() trigger will
-- bump updated_at automatically.
