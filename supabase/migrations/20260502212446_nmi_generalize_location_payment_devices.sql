-- Pulled from Supabase staging branch (project dfwqakoyittmrwbqvxgw) on 2026-05-03 to reconcile local migration history.
-- Idempotent: safe to re-run.

-- 1. Rename the secret-id column to be provider-agnostic
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'location_payment_devices'
      AND column_name = 'ftd_ecom_key_secret_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'location_payment_devices'
      AND column_name = 'provider_secret_id'
  ) THEN
    ALTER TABLE public.location_payment_devices
      RENAME COLUMN ftd_ecom_key_secret_id TO provider_secret_id;
  END IF;
END $$;

-- 2. Provider-specific columns become nullable
ALTER TABLE public.location_payment_devices
  ALTER COLUMN tpn DROP NOT NULL,
  ALTER COLUMN provider_secret_id DROP NOT NULL;

-- 3. Allow 'nmi' as a provider
ALTER TABLE public.location_payment_devices
  DROP CONSTRAINT IF EXISTS location_payment_devices_provider_check;

ALTER TABLE public.location_payment_devices
  ADD CONSTRAINT location_payment_devices_provider_check
  CHECK (provider = ANY (ARRAY['dejavoo'::text, 'ipospays'::text, 'nmi'::text]));

-- 4. New columns
ALTER TABLE public.location_payment_devices
  ADD COLUMN IF NOT EXISTS provider_merchant_id        text,
  ADD COLUMN IF NOT EXISTS provider_gateway_id         text,
  ADD COLUMN IF NOT EXISTS provider_public_key         text,
  ADD COLUMN IF NOT EXISTS webhook_secret_id           uuid,
  ADD COLUMN IF NOT EXISTS environment                 text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS status                      text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS supports_customer_vault     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_apple_pay          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_google_pay         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_health_check_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check_status    text,
  ADD COLUMN IF NOT EXISTS activated_at                timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at                timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason            text,
  ADD COLUMN IF NOT EXISTS metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. (Re)create check constraints
ALTER TABLE public.location_payment_devices
  DROP CONSTRAINT IF EXISTS location_payment_devices_environment_check,
  DROP CONSTRAINT IF EXISTS location_payment_devices_status_check,
  DROP CONSTRAINT IF EXISTS lpd_dejavoo_integrity,
  DROP CONSTRAINT IF EXISTS lpd_nmi_active_integrity;

ALTER TABLE public.location_payment_devices
  ADD CONSTRAINT location_payment_devices_environment_check
    CHECK (environment IN ('sandbox', 'production')),
  ADD CONSTRAINT location_payment_devices_status_check
    CHECK (status IN ('pending_creation','pending_processor_setup','active','suspended','closed')),
  ADD CONSTRAINT lpd_dejavoo_integrity CHECK (
    provider NOT IN ('dejavoo', 'ipospays')
    OR (tpn IS NOT NULL AND provider_secret_id IS NOT NULL)
  ),
  ADD CONSTRAINT lpd_nmi_active_integrity CHECK (
    provider != 'nmi'
    OR status != 'active'
    OR (
      provider_public_key IS NOT NULL
      AND provider_secret_id IS NOT NULL
      AND provider_merchant_id IS NOT NULL
    )
  );

-- 6. Backfill existing Dejavoo/iPosPays rows
UPDATE public.location_payment_devices
   SET status = 'active', environment = 'production'
 WHERE provider IN ('dejavoo', 'ipospays')
   AND (status IS DISTINCT FROM 'active' OR environment IS DISTINCT FROM 'production');

-- 7. Lock down secret-id columns from anon/authenticated SELECTs
REVOKE SELECT (provider_secret_id, webhook_secret_id)
  ON public.location_payment_devices FROM anon, authenticated;
