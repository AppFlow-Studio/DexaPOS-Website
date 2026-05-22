-- Rollback for 20260521000000_luqra_chargebacks_ensure_columns.sql
--
-- WARNING: This restores the May 9 broken schema state. Only run if you
-- also revert app/manage/actions/admin-merchant/luqra-sync.ts to a version
-- that doesn't write application_id / doing_business_as / is_reversal /
-- last_date_loaded — otherwise the TSYS payments sync will break again.

ALTER TABLE public.luqra_chargebacks
  DROP COLUMN IF EXISTS application_id,
  DROP COLUMN IF EXISTS doing_business_as,
  DROP COLUMN IF EXISTS last_date_loaded,
  DROP COLUMN IF EXISTS is_reversal,
  DROP COLUMN IF EXISTS first_seen_at,
  DROP COLUMN IF EXISTS last_seen_at;

-- Restoring GENERATED ALWAYS AS IDENTITY is intentionally not done here:
-- existing rows have non-sequence-generated ids (Luqra case-version ids), so
-- re-adding IDENTITY would conflict with them. If you truly need to roll back
-- the identity, you must reset the data first.

NOTIFY pgrst, 'reload schema';
