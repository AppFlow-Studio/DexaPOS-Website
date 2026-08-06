-- [C1] Processor-agnostic merchant payment account foundation.
--
-- This migration is additive. Existing NMI rows and checkout behavior remain
-- unchanged until a later cutover ticket explicitly links and activates an
-- account for a payment purpose.

CREATE TABLE IF NOT EXISTS public.merchant_processor_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL
    REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid
    REFERENCES public.locations(id) ON DELETE CASCADE,
  processor text NOT NULL,
  purpose text NOT NULL,

  -- Valor ISO-owned identifiers.
  valor_merchant_id text,
  valor_store_id text,
  valor_epi text,
  valor_appid text,
  valor_appkey_encrypted text,
  valor_customer_profile_id text,
  valor_payment_profile_id text,

  -- DEXA-owned ISO pricing.
  fee_schedule_id text,
  disc_rate_percent numeric(5,4),
  residual_bps integer,
  surcharge_percent numeric(5,4),
  pricing_owner text NOT NULL DEFAULT 'dexa',

  -- NMI identifiers retained for rollback during gradual cutover.
  nmi_merchant_id text,
  nmi_customer_vault_id text,

  webhook_secret_encrypted text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT merchant_processor_accounts_processor_check
    CHECK (processor IN ('nmi', 'valor')),
  CONSTRAINT merchant_processor_accounts_purpose_check
    CHECK (purpose IN ('online_order', 'subscription', 'invoice')),
  CONSTRAINT merchant_processor_accounts_pricing_owner_check
    CHECK (pricing_owner = 'dexa'),
  CONSTRAINT merchant_processor_accounts_disc_rate_range_check
    CHECK (disc_rate_percent IS NULL OR disc_rate_percent BETWEEN 0 AND 100),
  CONSTRAINT merchant_processor_accounts_residual_bps_range_check
    CHECK (residual_bps IS NULL OR residual_bps >= 0),
  CONSTRAINT merchant_processor_accounts_surcharge_range_check
    CHECK (surcharge_percent IS NULL OR surcharge_percent BETWEEN 0 AND 100),
  CONSTRAINT fee_schedule_required_for_merchant_purposes
    CHECK (
      processor <> 'valor'
      OR purpose NOT IN ('online_order', 'invoice')
      OR NOT is_active
      OR (
        fee_schedule_id IS NOT NULL
        AND disc_rate_percent IS NOT NULL
        AND residual_bps IS NOT NULL
        AND surcharge_percent IS NOT NULL
      )
    ),
  -- NULLS NOT DISTINCT prevents duplicate merchant-global account rows.
  CONSTRAINT merchant_processor_accounts_scope_key
    UNIQUE NULLS NOT DISTINCT (merchant_id, location_id, processor, purpose),
  CONSTRAINT merchant_processor_accounts_id_merchant_key
    UNIQUE (id, merchant_id)
);

COMMENT ON TABLE public.merchant_processor_accounts IS
  'Processor-agnostic merchant/location payment account references for online orders, subscriptions, and invoices.';
COMMENT ON COLUMN public.merchant_processor_accounts.location_id IS
  'Optional location scope. NULL identifies a merchant-global processor account.';
COMMENT ON COLUMN public.merchant_processor_accounts.valor_appkey_encrypted IS
  'Encrypted Valor APP key payload. Never store the plaintext APP key here.';
COMMENT ON COLUMN public.merchant_processor_accounts.webhook_secret_encrypted IS
  'Encrypted processor webhook secret. Never store a plaintext secret here.';

CREATE OR REPLACE FUNCTION public.enforce_mpa_location_merchant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.locations l
    WHERE l.id = NEW.location_id
      AND l.merchant_id = NEW.merchant_id
  ) THEN
    RAISE EXCEPTION 'Processor account location does not belong to merchant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.enforce_mpa_location_merchant()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_mpa_location_merchant
  ON public.merchant_processor_accounts;
CREATE TRIGGER enforce_mpa_location_merchant
  BEFORE INSERT OR UPDATE OF merchant_id, location_id
  ON public.merchant_processor_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mpa_location_merchant();

DROP TRIGGER IF EXISTS update_merchant_processor_accounts_updated_at
  ON public.merchant_processor_accounts;
CREATE TRIGGER update_merchant_processor_accounts_updated_at
  BEFORE UPDATE ON public.merchant_processor_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.merchant_billing_profiles
  ADD COLUMN IF NOT EXISTS processor text NOT NULL DEFAULT 'nmi';

DO $$
BEGIN
  ALTER TABLE public.merchant_billing_profiles
    ADD CONSTRAINT merchant_billing_profiles_processor_check
    CHECK (processor IN ('nmi', 'valor'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.merchant_billing_profiles.processor IS
  'Payment processor discriminator. Existing billing profiles remain on NMI until explicitly migrated.';

ALTER TABLE public.online_order_payment_intents
  ADD COLUMN IF NOT EXISTS merchant_processor_account_id uuid;

DO $$
BEGIN
  ALTER TABLE public.online_order_payment_intents
    ADD CONSTRAINT online_order_payment_intents_processor_account_fkey
    FOREIGN KEY (merchant_processor_account_id, merchant_id)
    REFERENCES public.merchant_processor_accounts(id, merchant_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.online_order_payment_intents.merchant_processor_account_id IS
  'Processor account used for this intent. Nullable until per-merchant cutover/backfill.';

-- The architecture cutover contract publishes the selected online-order
-- account through the storefront config. Keep this nullable during migration.
ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS merchant_processor_account_id uuid;

DO $$
BEGIN
  ALTER TABLE public.online_store_config
    ADD CONSTRAINT online_store_config_processor_account_fkey
    FOREIGN KEY (merchant_processor_account_id, merchant_id)
    REFERENCES public.merchant_processor_accounts(id, merchant_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.online_store_config.merchant_processor_account_id IS
  'Active online-order processor account for this storefront. NULL preserves the legacy NMI resolution path.';
