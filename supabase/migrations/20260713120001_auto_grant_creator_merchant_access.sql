-- ============================================================================
-- Auto-grant creator access on merchant creation (non-super-admin)
-- ============================================================================
-- Problem: get_admin_merchant_ids() returns all merchants only for hq.super_admin;
-- every other HQ admin is scoped to their admin_merchant_access rows. A freshly
-- created merchant has no such row for its creator, so the create flow immediately
-- fails with "Failed to load merchant."
--
-- Fix: an AFTER INSERT trigger on merchants that grants the *creator* active access.
--
-- Note on creator identity: merchants are inserted via the service-role client
-- (both the app pre-create in create-merchant-onboarding.ts and the Clerk webhook),
-- so current_user_id() (= get_my_claim('sub')) is NULL inside the insert. The creator
-- is instead read from public_metadata->>'created_by', which both paths populate.
--
-- Guard: only fire for HQ-admin creators (skip carrier/merchant/self contexts).
-- Super admins already see every merchant, so granting them a row is unnecessary.
-- granted_by is left NULL: this is a system grant (and stays safe if the
-- admin_merchant_access_no_self_grant CHECK, which forbids granted_by =
-- admin_user_id, is later applied).
--
-- Access model: admin_merchant_access has no access_level column on this DB;
-- get_admin_merchant_ids() only checks is_active, so an active row IS full
-- access. We insert only the columns that exist (admin_user_id, merchant_id,
-- granted_by, is_active, notes).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_grant_creator_merchant_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator text := NEW.public_metadata->>'created_by';
  v_is_hq_admin boolean;
  v_is_super boolean;
BEGIN
  -- No creator recorded (e.g. self-signup / data import) -> nothing to grant.
  IF v_creator IS NULL OR v_creator = '' THEN
    RETURN NEW;
  END IF;

  -- Only grant when the creator is an HQ admin, and detect super admins so we
  -- can skip them (they already see all merchants via get_admin_merchant_ids()).
  SELECT
    EXISTS (
      SELECT 1 FROM members m JOIN roles r ON r.code = m.role
      WHERE m.user_id = v_creator AND r.organization_type = 'hq'
    ),
    EXISTS (
      SELECT 1 FROM members m JOIN roles r ON r.code = m.role
      WHERE m.user_id = v_creator AND r.code = 'hq.super_admin'
    )
  INTO v_is_hq_admin, v_is_super;

  IF NOT v_is_hq_admin OR v_is_super THEN
    RETURN NEW;
  END IF;

  -- Grant the creator access (an active row = full access here). Idempotent via
  -- the UNIQUE(admin_user_id, merchant_id) constraint so re-runs / dual insert
  -- paths never duplicate or error.
  INSERT INTO admin_merchant_access (
    admin_user_id, merchant_id, granted_by, is_active, notes
  ) VALUES (
    v_creator, NEW.id, NULL, true, 'auto-grant on creation'
  )
  ON CONFLICT (admin_user_id, merchant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_grant_creator_merchant_access() IS
  'AFTER INSERT on merchants: grants the creating HQ admin (from public_metadata.created_by) full admin_merchant_access so the create flow can load the merchant. Skips non-HQ and super-admin creators.';

DROP TRIGGER IF EXISTS trg_auto_grant_creator_merchant_access ON public.merchants;
CREATE TRIGGER trg_auto_grant_creator_merchant_access
  AFTER INSERT ON public.merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_creator_merchant_access();
