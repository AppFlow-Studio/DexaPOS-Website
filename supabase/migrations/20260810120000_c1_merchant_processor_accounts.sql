-- [C1] merchant_processor_accounts — processor-agnostic credential + reference layer.
--
-- PROBLEM
--   The Valor migration's C2 branch already ships a service module and a resolver
--   (lib/payments/resolver.ts) that read `merchant_processor_accounts`, plus a
--   `processor` discriminator on merchant_billing_profiles and a FK on
--   online_order_payment_intents. Those objects were applied to the STAGING
--   database directly (raw DDL, no migration record) while C2 was built, but were
--   never captured in the repo: absent from supabase/migrations, schema.sql and
--   database.types.ts. As a result the schema exists on staging only and cannot
--   reach production via `db push`.
--
--   Because resolveProcessorAccount() throws on a query error (rather than
--   returning the NMI fallback), the branch's invoice-charge and billing-vault
--   paths work on staging purely because staging happens to have the table. On
--   production — which has none of these objects — the same code paths would
--   throw. This migration closes that gap by reproducing the staging shape as a
--   committed, idempotent migration.
--
-- IDEMPOTENCY
--   Written so it is a clean no-op on staging (objects already present) and a
--   full create on production. Every statement guards existence, so `db push`
--   is safe against both environments and any re-run.
--
-- SCOPE / PRICING
--   The table carries a fee/pricing model (fee_schedule_id, disc_rate_percent,
--   residual_bps, surcharge_percent, pricing_owner) beyond the original arch
--   sketch: a Valor account boarded for online_order/invoice must carry a full
--   fee schedule (enforced by fee_schedule_required_for_merchant_purposes).
--   pricing_owner is pinned to 'dexa' — pricing is owned at the ISV, not the
--   merchant. These match what boarding.ts and resolver.ts already expect.

-- ============================================================================
-- LOCATION / MERCHANT INTEGRITY GUARD
-- ============================================================================

-- A location-scoped account must reference a location that belongs to the same
-- merchant. A plain composite FK cannot express this (location_id is nullable
-- and the pairing lives one join away), so it is enforced by trigger.
CREATE OR REPLACE FUNCTION public.enforce_mpa_location_merchant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_processor_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id               uuid NOT NULL,
  location_id               uuid,
  processor                 text NOT NULL,
  purpose                   text NOT NULL,

  -- Valor identifiers (populated by boarding; appkey stored encrypted)
  valor_merchant_id         text,
  valor_store_id            text,
  valor_epi                 text,
  valor_appid               text,
  valor_appkey_encrypted    text,
  valor_customer_profile_id text,
  valor_payment_profile_id  text,

  -- Fee / pricing schedule (required for Valor online_order/invoice accounts)
  fee_schedule_id           text,
  disc_rate_percent         numeric,
  residual_bps              integer,
  surcharge_percent         numeric,
  pricing_owner             text NOT NULL DEFAULT 'dexa',

  -- NMI identifiers (dormant post-cutover; retained for rollback)
  nmi_merchant_id           text,
  nmi_customer_vault_id     text,

  webhook_secret_encrypted  text,
  is_primary                boolean NOT NULL DEFAULT false,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT merchant_processor_accounts_processor_check
    CHECK (processor = ANY (ARRAY['nmi'::text, 'valor'::text])),
  CONSTRAINT merchant_processor_accounts_purpose_check
    CHECK (purpose = ANY (ARRAY['online_order'::text, 'subscription'::text, 'invoice'::text])),
  CONSTRAINT merchant_processor_accounts_disc_rate_range_check
    CHECK (disc_rate_percent IS NULL OR (disc_rate_percent >= 0 AND disc_rate_percent <= 100)),
  CONSTRAINT merchant_processor_accounts_surcharge_range_check
    CHECK (surcharge_percent IS NULL OR (surcharge_percent >= 0 AND surcharge_percent <= 100)),
  CONSTRAINT merchant_processor_accounts_residual_bps_range_check
    CHECK (residual_bps IS NULL OR residual_bps >= 0),
  CONSTRAINT merchant_processor_accounts_pricing_owner_check
    CHECK (pricing_owner = 'dexa'::text),
  -- A Valor acquiring/invoice account that is active must carry a full fee
  -- schedule. Subscription accounts and NMI/inactive rows are exempt.
  CONSTRAINT fee_schedule_required_for_merchant_purposes CHECK (
    processor <> 'valor'::text
    OR purpose <> ALL (ARRAY['online_order'::text, 'invoice'::text])
    OR NOT is_active
    OR (fee_schedule_id IS NOT NULL
        AND disc_rate_percent IS NOT NULL
        AND residual_bps IS NOT NULL
        AND surcharge_percent IS NOT NULL)
  ),
  -- Backs the composite FK from online_order_payment_intents so a child row can
  -- never reference an account belonging to a different merchant.
  CONSTRAINT merchant_processor_accounts_id_merchant_key UNIQUE (id, merchant_id),
  -- One row per (merchant, location, processor, purpose). NULLS NOT DISTINCT so
  -- merchant-global rows (location_id IS NULL) also collide as expected.
  CONSTRAINT merchant_processor_accounts_scope_key
    UNIQUE NULLS NOT DISTINCT (merchant_id, location_id, processor, purpose),
  CONSTRAINT merchant_processor_accounts_merchant_id_fkey
    FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE,
  CONSTRAINT merchant_processor_accounts_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.merchant_processor_accounts IS
  'Per-merchant/purpose payment processor accounts (NMI + Valor). Routing table '
  'for lib/payments; boarding writes it via service role, RLS is read-for-owner.';

-- Hot path: resolver reads active rows by (merchant_id, purpose).
CREATE INDEX IF NOT EXISTS idx_mpa_merchant_purpose_active
  ON public.merchant_processor_accounts (merchant_id, purpose)
  WHERE is_active;

-- At most one active PRIMARY per (merchant, location, purpose) — the guarantee
-- selectAccount() relies on to avoid ambiguity across processors.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpa_primary_scope
  ON public.merchant_processor_accounts (merchant_id, location_id, purpose)
  NULLS NOT DISTINCT
  WHERE (is_active AND is_primary);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS enforce_mpa_location_merchant
  ON public.merchant_processor_accounts;
CREATE TRIGGER enforce_mpa_location_merchant
  BEFORE INSERT OR UPDATE OF merchant_id, location_id
  ON public.merchant_processor_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mpa_location_merchant();

DROP TRIGGER IF EXISTS update_merchant_processor_accounts_updated_at
  ON public.merchant_processor_accounts;
CREATE TRIGGER update_merchant_processor_accounts_updated_at
  BEFORE UPDATE ON public.merchant_processor_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- GRANTS + RLS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.merchant_processor_accounts TO authenticated, service_role;

ALTER TABLE public.merchant_processor_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_processor_accounts FORCE ROW LEVEL SECURITY;

-- READ: HQ admins, the merchant's own owner/admin/manager, and the merchant's
-- carrier org. Writes are HQ-only (boarding runs through the service role,
-- which bypasses RLS).
DROP POLICY IF EXISTS mpa_select_access ON public.merchant_processor_accounts;
CREATE POLICY mpa_select_access ON public.merchant_processor_accounts
  FOR SELECT TO authenticated
  USING (
    is_dexapos_admin()
    OR EXISTS (
      SELECT 1
      FROM public.merchants mer
      JOIN public.members mm ON mm.organization_id = mer.clerk_org_id
      WHERE mer.id = merchant_processor_accounts.merchant_id
        AND mm.user_id = (SELECT auth.jwt() ->> 'sub')
        AND mm.role = ANY (ARRAY['merchant.owner'::text, 'merchant.admin'::text, 'merchant.manager'::text])
    )
    OR EXISTS (
      SELECT 1
      FROM public.merchants mer
      JOIN public.carriers c ON c.id = mer.carrier_id
      JOIN public.members cm ON cm.organization_id = c.clerk_org_id
      JOIN public.roles cr ON cr.code = cm.role
      WHERE mer.id = merchant_processor_accounts.merchant_id
        AND cm.user_id = (SELECT auth.jwt() ->> 'sub')
        AND (cr.organization_type)::text = 'carrier'::text
    )
  );

DROP POLICY IF EXISTS mpa_hq_admin_insert ON public.merchant_processor_accounts;
CREATE POLICY mpa_hq_admin_insert ON public.merchant_processor_accounts
  FOR INSERT TO authenticated
  WITH CHECK (is_dexapos_admin());

DROP POLICY IF EXISTS mpa_hq_admin_update ON public.merchant_processor_accounts;
CREATE POLICY mpa_hq_admin_update ON public.merchant_processor_accounts
  FOR UPDATE TO authenticated
  USING (is_dexapos_admin())
  WITH CHECK (is_dexapos_admin());

DROP POLICY IF EXISTS mpa_hq_admin_delete ON public.merchant_processor_accounts;
CREATE POLICY mpa_hq_admin_delete ON public.merchant_processor_accounts
  FOR DELETE TO authenticated
  USING (is_dexapos_admin());

-- ============================================================================
-- DISCRIMINATOR + FK ON EXISTING TABLES
-- ============================================================================

-- Which processor a merchant's subscription billing runs on. Defaults to the
-- incumbent so existing rows are unambiguous.
ALTER TABLE public.merchant_billing_profiles
  ADD COLUMN IF NOT EXISTS processor text NOT NULL DEFAULT 'nmi';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.merchant_billing_profiles'::regclass
      AND conname = 'merchant_billing_profiles_processor_check'
  ) THEN
    ALTER TABLE public.merchant_billing_profiles
      ADD CONSTRAINT merchant_billing_profiles_processor_check
      CHECK (processor = ANY (ARRAY['nmi'::text, 'valor'::text]));
  END IF;
END $$;

-- New online-order intents reference the processor account they were charged
-- through. Composite FK (with merchant_id) prevents cross-merchant references.
ALTER TABLE public.online_order_payment_intents
  ADD COLUMN IF NOT EXISTS merchant_processor_account_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.online_order_payment_intents'::regclass
      AND conname = 'online_order_payment_intents_processor_account_fkey'
  ) THEN
    ALTER TABLE public.online_order_payment_intents
      ADD CONSTRAINT online_order_payment_intents_processor_account_fkey
      FOREIGN KEY (merchant_processor_account_id, merchant_id)
      REFERENCES public.merchant_processor_accounts (id, merchant_id)
      ON DELETE SET NULL;
  END IF;
END $$;
