-- Rollback for 20260529130000_get_active_orders_v1.sql
DROP FUNCTION IF EXISTS public.get_active_orders_v1(uuid, uuid, timestamptz, int);
