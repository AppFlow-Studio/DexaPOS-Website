-- Rollback for 20260606040600_install_process_payment_v15.sql.
-- Just removes v15. v13/v14 are unaffected.

DROP FUNCTION IF EXISTS public.process_payment_v15(
  uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
  integer, integer, boolean, uuid, uuid, uuid
);
