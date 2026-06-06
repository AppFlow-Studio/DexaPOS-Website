-- Rollback for 20260606040200_cash_drawer_vendor_id_and_record_cash_operation_v2.sql.
-- Drops the 10-arg overload and the column. Any rows already carrying a
-- vendor_id will lose it.

DROP FUNCTION IF EXISTS public.record_cash_operation(uuid, uuid, text, numeric, uuid, uuid, uuid, text, uuid, uuid);

ALTER TABLE public.cash_drawer_operations
  DROP COLUMN IF EXISTS vendor_id;
