-- ============================================================================
-- Migration 033: DM-013-01 Merchant Onboarding Fields + Billing Profiles
-- ============================================================================
-- Scope:
-- 1) Expand public.merchants with onboarding/business fields.
-- 2) Add constraints/indexes for onboarding and business data quality.
-- 3) Create public.merchant_billing_profiles for sensitive billing metadata.
-- 4) Enforce strict RLS:
--    - HQ admins: full access
--    - Carrier admins: read-only (their carrier merchants only)
--    - Merchant owners: read/write (their own merchant only)
--
-- Security:
-- - Store only last-4 values for EIN/account/routing display fields.
-- - Full bank/account data must stay tokenized in external processor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Expand merchants table
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS business_legal_name text,
  ADD COLUMN IF NOT EXISTS dba_name text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS owner_first_name text,
  ADD COLUMN IF NOT EXISTS owner_last_name text,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS ein_last_four text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_address_line1 text,
  ADD COLUMN IF NOT EXISTS business_address_line2 text,
  ADD COLUMN IF NOT EXISTS business_city text,
  ADD COLUMN IF NOT EXISTS business_state text,
  ADD COLUMN IF NOT EXISTS business_postal_code text,
  ADD COLUMN IF NOT EXISTS business_country text DEFAULT 'US';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchants_onboarding_status_check'
      AND conrelid = 'public.merchants'::regclass
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT merchants_onboarding_status_check
      CHECK (
        onboarding_status IN ('created', 'onboarding', 'active', 'suspended', 'cancelled')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchants_business_type_check'
      AND conrelid = 'public.merchants'::regclass
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT merchants_business_type_check
      CHECK (
        business_type IS NULL
        OR business_type IN ('llc', 'corporation', 'sole_proprietor', 'partnership', 'nonprofit')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchants_ein_last_four_check'
      AND conrelid = 'public.merchants'::regclass
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT merchants_ein_last_four_check
      CHECK (ein_last_four IS NULL OR ein_last_four ~ '^[0-9]{4}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_status
  ON public.merchants(onboarding_status);

-- ---------------------------------------------------------------------------
-- 2) merchant_billing_profiles table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  billing_method text NOT NULL DEFAULT 'ach',

  -- ACH (last-4 display values + tokenized references only)
  bank_name text,
  account_holder_name text,
  account_number_last_four text,
  routing_number_last_four text,
  account_type text,

  -- Card (tokenized references only)
  card_brand text,
  card_last_four text,
  card_exp_month integer,
  card_exp_year integer,
  card_token text,

  -- Status
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  is_primary boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_billing_profiles_billing_method_check'
      AND conrelid = 'public.merchant_billing_profiles'::regclass
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_billing_method_check
      CHECK (billing_method IN ('ach', 'card'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_billing_profiles_account_type_check'
      AND conrelid = 'public.merchant_billing_profiles'::regclass
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_account_type_check
      CHECK (account_type IS NULL OR account_type IN ('checking', 'savings'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_billing_profiles_acct_last4_check'
      AND conrelid = 'public.merchant_billing_profiles'::regclass
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_acct_last4_check
      CHECK (
        account_number_last_four IS NULL
        OR account_number_last_four ~ '^[0-9]{4}$'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_billing_profiles_routing_last4_check'
      AND conrelid = 'public.merchant_billing_profiles'::regclass
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_routing_last4_check
      CHECK (
        routing_number_last_four IS NULL
        OR routing_number_last_four ~ '^[0-9]{4}$'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_billing_profiles_card_last4_check'
      AND conrelid = 'public.merchant_billing_profiles'::regclass
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_card_last4_check
      CHECK (card_last_four IS NULL OR card_last_four ~ '^[0-9]{4}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_billing_profiles_card_exp_month_check'
      AND conrelid = 'public.merchant_billing_profiles'::regclass
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_card_exp_month_check
      CHECK (
        card_exp_month IS NULL
        OR (card_exp_month >= 1 AND card_exp_month <= 12)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_billing_profiles_merchant_id
  ON public.merchant_billing_profiles(merchant_id);

CREATE INDEX IF NOT EXISTS idx_merchant_billing_profiles_active
  ON public.merchant_billing_profiles(merchant_id, is_active)
  WHERE is_active = true;

-- Exactly one primary profile per merchant (allows many non-primary rows)
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_billing_profiles_primary
  ON public.merchant_billing_profiles(merchant_id)
  WHERE is_primary = true;

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS update_merchant_billing_profiles_updated_at
  ON public.merchant_billing_profiles;

CREATE TRIGGER update_merchant_billing_profiles_updated_at
  BEFORE UPDATE ON public.merchant_billing_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3) RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mbp_hq_admin_all ON public.merchant_billing_profiles;
CREATE POLICY mbp_hq_admin_all
  ON public.merchant_billing_profiles
  FOR ALL
  USING (public.is_dexapos_admin())
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS mbp_carrier_admin_read ON public.merchant_billing_profiles;
CREATE POLICY mbp_carrier_admin_read
  ON public.merchant_billing_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.merchants mer
      JOIN public.carriers c
        ON c.id = mer.carrier_id
      JOIN public.members cm
        ON cm.organization_id = c.clerk_org_id
      JOIN public.roles cr
        ON cr.code = cm.role
      WHERE mer.id = merchant_billing_profiles.merchant_id
        AND cm.user_id = public.current_user_id()
        AND cr.organization_type = 'carrier'
    )
  );

DROP POLICY IF EXISTS mbp_merchant_owner_rw ON public.merchant_billing_profiles;
CREATE POLICY mbp_merchant_owner_rw
  ON public.merchant_billing_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.merchants mer
      JOIN public.members mm
        ON mm.organization_id = mer.clerk_org_id
      WHERE mer.id = merchant_billing_profiles.merchant_id
        AND mm.user_id = public.current_user_id()
        AND mm.role = 'merchant.owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.merchants mer
      JOIN public.members mm
        ON mm.organization_id = mer.clerk_org_id
      WHERE mer.id = merchant_billing_profiles.merchant_id
        AND mm.user_id = public.current_user_id()
        AND mm.role = 'merchant.owner'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_billing_profiles TO authenticated;

COMMENT ON COLUMN public.merchants.ein_last_four IS 'Last 4 digits only for display/verification. Never store full EIN here.';
COMMENT ON COLUMN public.merchant_billing_profiles.account_number_last_four IS 'Last 4 digits only. Full account number must be tokenized externally.';
COMMENT ON COLUMN public.merchant_billing_profiles.routing_number_last_four IS 'Last 4 digits only. Full routing number must be tokenized externally.';
COMMENT ON TABLE public.merchant_billing_profiles IS 'Merchant billing method metadata (token refs + last-4 display values only).';
