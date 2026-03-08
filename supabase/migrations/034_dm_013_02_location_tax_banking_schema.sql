-- ============================================================================
-- Migration 034: DM-013-02 Location Tax + Banking Schema
-- ============================================================================
-- Scope:
-- 1) Expand public.locations with tax/EIN onboarding fields.
-- 2) Add location_banking_profiles for per-location payout banking metadata.
-- 3) Add constraints/indexes for data quality and filter performance.
-- 4) Add RLS:
--    - HQ admins: full access
--    - Carrier users: read-only for their carrier locations
--    - Merchant owners: read/write for their own merchant locations
--
-- Security:
-- - Never store full account/routing details in plain fields.
-- - Use tokenized references (bank_account_token) + last-4 display fields.
-- - EIN should be encrypted/tokenized in app flow; this migration stores
--   ein_last_four and adds helper derivation when plaintext EIN is provided.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Expand locations table
-- ---------------------------------------------------------------------------
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS ein text,
  ADD COLUMN IF NOT EXISTS ein_last_four text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS sales_tax_rate numeric(5,4),
  ADD COLUMN IF NOT EXISTS tax_registration_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'locations_tax_registration_status_check'
      AND conrelid = 'public.locations'::regclass
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_tax_registration_status_check
      CHECK (tax_registration_status IN ('pending', 'verified', 'expired'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'locations_sales_tax_rate_check'
      AND conrelid = 'public.locations'::regclass
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_sales_tax_rate_check
      CHECK (sales_tax_rate IS NULL OR (sales_tax_rate >= 0 AND sales_tax_rate <= 1));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'locations_ein_last_four_check'
      AND conrelid = 'public.locations'::regclass
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_ein_last_four_check
      CHECK (ein_last_four IS NULL OR ein_last_four ~ '^[0-9]{4}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'locations_onboarding_step_check'
      AND conrelid = 'public.locations'::regclass
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_onboarding_step_check
      CHECK (onboarding_step IS NULL OR (onboarding_step >= 0 AND onboarding_step <= 10));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_location_ein_last_four()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_digits text;
BEGIN
  -- If app provides a plain EIN pattern, derive last-4 automatically.
  -- If app stores encrypted/tokenized value in ein, this will not overwrite
  -- an explicit ein_last_four set by the app.
  IF NEW.ein IS NOT NULL THEN
    v_digits := regexp_replace(NEW.ein, '[^0-9]', '', 'g');
    IF length(v_digits) = 9 THEN
      NEW.ein_last_four := right(v_digits, 4);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_set_ein_last_four ON public.locations;
CREATE TRIGGER trg_locations_set_ein_last_four
  BEFORE INSERT OR UPDATE OF ein ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_location_ein_last_four();

-- ---------------------------------------------------------------------------
-- 2) location_banking_profiles table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_banking_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  -- Bank details (last-4 + token refs only)
  bank_name text NOT NULL,
  account_holder_name text NOT NULL,
  account_number_last_four text NOT NULL,
  routing_number_last_four text NOT NULL,
  account_type text NOT NULL DEFAULT 'checking',
  bank_account_token text,

  -- Payout config
  payout_frequency text NOT NULL DEFAULT 'daily',
  payout_day_of_week integer,
  payout_day_of_month integer,
  minimum_payout_amount numeric(10,2) NOT NULL DEFAULT 0.00,

  -- Status
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_banking_profiles_account_type_check'
      AND conrelid = 'public.location_banking_profiles'::regclass
  ) THEN
    ALTER TABLE public.location_banking_profiles
      ADD CONSTRAINT location_banking_profiles_account_type_check
      CHECK (account_type IN ('checking', 'savings'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_banking_profiles_payout_frequency_check'
      AND conrelid = 'public.location_banking_profiles'::regclass
  ) THEN
    ALTER TABLE public.location_banking_profiles
      ADD CONSTRAINT location_banking_profiles_payout_frequency_check
      CHECK (payout_frequency IN ('daily', 'weekly', 'monthly'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_banking_profiles_account_last4_check'
      AND conrelid = 'public.location_banking_profiles'::regclass
  ) THEN
    ALTER TABLE public.location_banking_profiles
      ADD CONSTRAINT location_banking_profiles_account_last4_check
      CHECK (account_number_last_four ~ '^[0-9]{4}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_banking_profiles_routing_last4_check'
      AND conrelid = 'public.location_banking_profiles'::regclass
  ) THEN
    ALTER TABLE public.location_banking_profiles
      ADD CONSTRAINT location_banking_profiles_routing_last4_check
      CHECK (routing_number_last_four ~ '^[0-9]{4}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_banking_profiles_payout_day_of_week_check'
      AND conrelid = 'public.location_banking_profiles'::regclass
  ) THEN
    ALTER TABLE public.location_banking_profiles
      ADD CONSTRAINT location_banking_profiles_payout_day_of_week_check
      CHECK (payout_day_of_week IS NULL OR (payout_day_of_week >= 0 AND payout_day_of_week <= 6));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'location_banking_profiles_payout_day_of_month_check'
      AND conrelid = 'public.location_banking_profiles'::regclass
  ) THEN
    ALTER TABLE public.location_banking_profiles
      ADD CONSTRAINT location_banking_profiles_payout_day_of_month_check
      CHECK (payout_day_of_month IS NULL OR (payout_day_of_month >= 1 AND payout_day_of_month <= 28));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_location_banking_profile_merchant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_id uuid;
BEGIN
  SELECT l.merchant_id
    INTO v_merchant_id
  FROM public.locations l
  WHERE l.id = NEW.location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid location_id % for location_banking_profiles', NEW.location_id;
  END IF;

  NEW.merchant_id := v_merchant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_location_banking_set_merchant_id ON public.location_banking_profiles;
CREATE TRIGGER trg_location_banking_set_merchant_id
  BEFORE INSERT OR UPDATE OF location_id ON public.location_banking_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_location_banking_profile_merchant_id();

DROP TRIGGER IF EXISTS update_location_banking_profiles_updated_at ON public.location_banking_profiles;
CREATE TRIGGER update_location_banking_profiles_updated_at
  BEFORE UPDATE ON public.location_banking_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_location_banking_profiles_location_id
  ON public.location_banking_profiles(location_id);

CREATE INDEX IF NOT EXISTS idx_location_banking_profiles_merchant_id
  ON public.location_banking_profiles(merchant_id);

CREATE INDEX IF NOT EXISTS idx_location_banking_profiles_active
  ON public.location_banking_profiles(location_id, is_active)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 3) RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.location_banking_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lbp_hq_admin_all ON public.location_banking_profiles;
CREATE POLICY lbp_hq_admin_all
  ON public.location_banking_profiles
  FOR ALL
  USING (public.is_dexapos_admin())
  WITH CHECK (public.is_dexapos_admin());

DROP POLICY IF EXISTS lbp_carrier_admin_read ON public.location_banking_profiles;
CREATE POLICY lbp_carrier_admin_read
  ON public.location_banking_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.locations l
      JOIN public.merchants mer
        ON mer.id = l.merchant_id
      JOIN public.carriers c
        ON c.id = mer.carrier_id
      JOIN public.members cm
        ON cm.organization_id = c.clerk_org_id
      JOIN public.roles cr
        ON cr.code = cm.role
      WHERE l.id = location_banking_profiles.location_id
        AND cm.user_id = public.current_user_id()
        AND cr.organization_type = 'carrier'
    )
  );

DROP POLICY IF EXISTS lbp_merchant_owner_rw ON public.location_banking_profiles;
CREATE POLICY lbp_merchant_owner_rw
  ON public.location_banking_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.locations l
      JOIN public.merchants mer
        ON mer.id = l.merchant_id
      JOIN public.members mm
        ON mm.organization_id = mer.clerk_org_id
      WHERE l.id = location_banking_profiles.location_id
        AND mm.user_id = public.current_user_id()
        AND mm.role = 'merchant.owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.locations l
      JOIN public.merchants mer
        ON mer.id = l.merchant_id
      JOIN public.members mm
        ON mm.organization_id = mer.clerk_org_id
      WHERE l.id = location_banking_profiles.location_id
        AND mm.user_id = public.current_user_id()
        AND mm.role = 'merchant.owner'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_banking_profiles TO authenticated;

COMMENT ON COLUMN public.locations.ein IS 'Location EIN. Store encrypted/tokenized value only in app flow.';
COMMENT ON COLUMN public.locations.ein_last_four IS 'Display-only last 4 digits of EIN.';
COMMENT ON COLUMN public.location_banking_profiles.account_number_last_four IS 'Display-only last 4 digits.';
COMMENT ON COLUMN public.location_banking_profiles.routing_number_last_four IS 'Display-only last 4 digits.';
COMMENT ON COLUMN public.location_banking_profiles.bank_account_token IS 'Tokenized bank account reference from payment processor.';
COMMENT ON TABLE public.location_banking_profiles IS 'Per-location payout banking metadata (token refs + last-4 values only).';
