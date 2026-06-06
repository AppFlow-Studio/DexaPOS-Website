-- Rollback for 20260606040300_kds_item_status_acknowledged_columns_and_rpcs.sql.

DROP FUNCTION IF EXISTS public.acknowledge_kds_notice(uuid, uuid);
DROP FUNCTION IF EXISTS public.acknowledge_kds_item_void(uuid, uuid);

ALTER TABLE public.kds_item_status
  DROP COLUMN IF EXISTS acknowledged_by,
  DROP COLUMN IF EXISTS acknowledged_at;
