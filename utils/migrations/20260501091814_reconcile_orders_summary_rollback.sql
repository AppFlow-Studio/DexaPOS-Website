-- Rollback for 20260501091814_reconcile_orders_summary.sql
DROP FUNCTION IF EXISTS public.reconcile_orders_summary(uuid[]);
