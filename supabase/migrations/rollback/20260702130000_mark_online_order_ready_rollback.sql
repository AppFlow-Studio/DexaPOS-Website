-- Rollback: drop mark_online_order_ready. This RPC is additive (new function), so
-- the rollback simply removes it. Orders already marked ready by it are unaffected
-- (their status='ready' remains).

DROP FUNCTION IF EXISTS public.mark_online_order_ready(uuid);
