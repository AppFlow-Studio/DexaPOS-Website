-- Rollback: drop cancel_online_order. This RPC is additive (new function), so the
-- rollback simply removes it. Orders already cancelled by it are unaffected.

DROP FUNCTION IF EXISTS public.cancel_online_order(uuid, text, text);
