-- =============================================================================
-- Migration: Add external_merchant_id to public.merchants
--
-- Why:
--   The Dejavoo / iPOSpays "Edit Merchant" Management API (POST
--   /v2/merchant/add-on) keys whitelist-domain configuration off a 12-char
--   merchantId issued by Dejavoo. That id is per-merchant (not per-store, not
--   per-payment-device) and is supplied by the merchant out-of-band; it has no
--   relationship to public.merchants.id (UUID) or public.merchants.clerk_org_id.
--
--   Until this column exists, the dejavoo-whitelist-domain edge function has no
--   way to identify the target merchant against the Dejavoo API, which is why
--   the function currently returns 401.
-- =============================================================================

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS external_merchant_id text;

COMMENT ON COLUMN public.merchants.external_merchant_id IS
  'Dejavoo/iPOSpays-supplied merchantId (12-char alphanumeric). One per merchant. '
  'Required for the /v2/merchant/add-on whitelist-domain call. '
  'Distinct from public.merchants.id (UUID) and public.merchants.clerk_org_id.';

-- 12-char alphanumeric per the docs example ("merchId-12-chars").
-- Nullable so existing rows are unaffected; HQ populates per-merchant via UI.
ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_external_merchant_id_format;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_external_merchant_id_format
  CHECK (
    external_merchant_id IS NULL
    OR external_merchant_id ~ '^[A-Za-z0-9]{12}$'
  );
