-- Prevent self-grants on admin_merchant_access.
-- Existing rows where granted_by = admin_user_id are harmless once the
-- is_super_admin short-circuit is in place; we add NOT VALID so the
-- constraint applies only to new rows. Validate separately after cleanup.
ALTER TABLE public.admin_merchant_access
  ADD CONSTRAINT admin_merchant_access_no_self_grant
  CHECK (granted_by IS NULL OR granted_by <> admin_user_id)
  NOT VALID;
