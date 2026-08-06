-- [C1] RLS and grants for processor account references.
--
-- Read access mirrors merchant_billing_profiles. Only HQ may mutate rows in
-- this foundation ticket; C2/C4 service functions use service_role or an HQ-
-- authorized SECURITY DEFINER contract.

ALTER TABLE public.merchant_processor_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_processor_accounts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.merchant_processor_accounts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.merchant_processor_accounts TO authenticated;
GRANT ALL ON TABLE public.merchant_processor_accounts TO service_role;

DO $$
BEGIN
  CREATE POLICY mpa_select_access
    ON public.merchant_processor_accounts
    FOR SELECT
    TO authenticated
    USING (
      public.is_dexapos_admin()
      OR EXISTS (
        SELECT 1
        FROM public.merchants mer
        JOIN public.members mm
          ON mm.organization_id = mer.clerk_org_id
        WHERE mer.id = merchant_processor_accounts.merchant_id
          AND mm.user_id = (SELECT auth.jwt()->>'sub')
          AND mm.role IN (
            'merchant.owner',
            'merchant.admin',
            'merchant.manager'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.merchants mer
        JOIN public.carriers c
          ON c.id = mer.carrier_id
        JOIN public.members cm
          ON cm.organization_id = c.clerk_org_id
        JOIN public.roles cr
          ON cr.code = cm.role
        WHERE mer.id = merchant_processor_accounts.merchant_id
          AND cm.user_id = (SELECT auth.jwt()->>'sub')
          AND cr.organization_type::text = 'carrier'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY mpa_hq_admin_insert
    ON public.merchant_processor_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_dexapos_admin());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY mpa_hq_admin_update
    ON public.merchant_processor_accounts
    FOR UPDATE
    TO authenticated
    USING (public.is_dexapos_admin())
    WITH CHECK (public.is_dexapos_admin());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY mpa_hq_admin_delete
    ON public.merchant_processor_accounts
    FOR DELETE
    TO authenticated
    USING (public.is_dexapos_admin());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
