-- Pulled from Supabase staging branch (project dfwqakoyittmrwbqvxgw) on 2026-05-03 to reconcile local migration history.


-- 1. Rename the secret-id column to be provider-agnostic
ALTER TABLE public.location_payment_devices
  RENAME COLUMN ftd_ecom_key_secret_id TO provider_secret_id;

-- 2. Provider-specific columns become nullable
--    (NMI has no TPN; pending devices have no secret yet)
ALTER TABLE public.location_payment_devices
  ALTER COLUMN tpn DROP NOT NULL,
  ALTER COLUMN provider_secret_id DROP NOT NULL;

-- 3. Allow 'nmi' as a provider
ALTER TABLE public.location_payment_devices
  DROP CONSTRAINT location_payment_devices_provider_check;

ALTER TABLE public.location_payment_devices
  ADD CONSTRAINT location_payment_devices_provider_check
  CHECK (provider = ANY (ARRAY['dejavoo'::text, 'ipospays'::text, 'nmi'::text]));

-- 4. New columns
ALTER TABLE public.location_payment_devices
  ADD COLUMN provider_merchant_id          text,
  ADD COLUMN provider_gateway_id           text,
  ADD COLUMN provider_public_key           text,
  ADD COLUMN webhook_secret_id             uuid,
  ADD COLUMN environment                   text NOT NULL DEFAULT 'production',
  ADD COLUMN status                        text NOT NULL DEFAULT 'active',
  ADD COLUMN supports_customer_vault       boolean NOT NULL DEFAULT false,
  ADD COLUMN supports_apple_pay            boolean NOT NULL DEFAULT false,
  ADD COLUMN supports_google_pay           boolean NOT NULL DEFAULT false,
  ADD COLUMN last_health_check_at          timestamptz,
  ADD COLUMN last_health_check_status     text,
  ADD COLUMN activated_at                  timestamptz,
  ADD COLUMN suspended_at                  timestamptz,
  ADD COLUMN suspended_reason              text,
  ADD COLUMN metadata                      jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.location_payment_devices
  ADD CONSTRAINT location_payment_devices_environment_check
    CHECK (environment IN ('sandbox', 'production')),
  ADD CONSTRAINT location_payment_devices_status_check
    CHECK (status IN ('pending_creation','pending_processor_setup','active','suspended','closed'));

-- 5. Provider-aware integrity:
--    Dejavoo/iPosPays rows must have tpn + provider_secret_id (existing invariant)
--    NMI rows in 'active' status must have public key + secret + provider_merchant_id
ALTER TABLE public.location_payment_devices
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

-- 6. Backfill existing 5 Dejavoo rows
UPDATE public.location_payment_devices
   SET status = 'active', environment = 'production'
 WHERE provider IN ('dejavoo', 'ipospays');

-- 7. Lock down secret-id columns from anon/authenticated SELECTs
REVOKE SELECT (provider_secret_id, webhook_secret_id)
  ON public.location_payment_devices FROM anon, authenticated;
