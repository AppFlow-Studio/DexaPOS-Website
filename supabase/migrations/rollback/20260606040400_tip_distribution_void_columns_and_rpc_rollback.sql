-- Rollback for 20260606040400_tip_distribution_void_columns_and_rpc.sql.
-- Drops the RPC and the columns. Any tip_distribution_sessions rows with
-- void metadata will lose that metadata.

DROP FUNCTION IF EXISTS public.void_tip_distribution(uuid, text, uuid);

ALTER TABLE public.tip_distribution_sessions
  DROP COLUMN IF EXISTS voided_by,
  DROP COLUMN IF EXISTS voided_at,
  DROP COLUMN IF EXISTS void_reason;
