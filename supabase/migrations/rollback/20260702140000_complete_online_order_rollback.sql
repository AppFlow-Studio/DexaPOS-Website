-- Rollback: drop complete_online_order. This RPC is additive (new function), so
-- the rollback simply removes it. Orders already completed by it are unaffected.

DROP FUNCTION IF EXISTS public.complete_online_order(uuid);
