-- ============================================================================
-- Dead Letter Queue retry RPCs
-- ----------------------------------------------------------------------------
-- These RPCs let webhook receivers transactionally update an existing DLQ
-- row when they are being re-invoked as a retry (via the `x-dlq-replay-id`
-- header), instead of inserting a brand new DLQ row. Keeps the HQ viewer
-- free of phantom duplicates when a retry fails.
--
-- Both RPCs are SECURITY DEFINER and granted only to service_role, since
-- they are called exclusively from edge functions and server actions that
-- already gate access at the app layer.
-- ============================================================================

-- On a FAILED replay: bump retry_count, refresh error_message, reset status
-- back to 'pending' so HQ can decide to retry again or abandon.
CREATE OR REPLACE FUNCTION public.touch_dlq_replay_failure(
  p_id uuid,
  p_error_message text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.webhook_dead_letter_queue
  SET error_message = p_error_message,
      status = 'pending',
      retry_count = retry_count + 1,
      updated_at = now()
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.touch_dlq_replay_failure(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_dlq_replay_failure(uuid, text) TO service_role;

-- On a SUCCESSFUL replay: mark the row resolved and bump retry_count for
-- the audit trail.
CREATE OR REPLACE FUNCTION public.mark_dlq_replay_success(
  p_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.webhook_dead_letter_queue
  SET status = 'resolved',
      resolved_at = now(),
      retry_count = retry_count + 1,
      updated_at = now()
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.mark_dlq_replay_success(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dlq_replay_success(uuid) TO service_role;
