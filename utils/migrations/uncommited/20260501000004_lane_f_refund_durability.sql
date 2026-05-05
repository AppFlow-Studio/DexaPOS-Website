-- Lane F: Refund DB durability
--
-- Card refunds have a 6-step write sequence where only step 1 is durable.
-- If the network drops mid-sequence, the customer's card is refunded but
-- the DB has no record. Plus reversal reference IDs have no dedup, so a
-- double-tap = double-refund.
--
-- This migration ships the DB-side pieces (Awdi's scope):
--   F1  partial UNIQUE index on reversals.original_payment_id for active
--       reversals (status IN 'pending'|'completed'|'terminal_succeeded_db_pending').
--   F2  complete_reversal(p_reversal_id, p_items) — single SECURITY DEFINER
--       function wrapping apply_refund_to_payment + record_refund_items +
--       update_order_payment_status_after_refund. Whole sequence is atomic.
--   F3  reversal status 'terminal_succeeded_db_pending' + pg_cron job that
--       scans every 5 minutes and writes a critical audit_logs row for any
--       stale reversal older than 10 minutes (Sentry can poll audit_logs).
--   F6  No process_cash_refund RPC exists in this DB — the queue handler is
--       in app code (Temur). The F1 partial UNIQUE index protects cash
--       refunds at the DB level: a duplicate INSERT will fail with 23505
--       which the queue handler treats as success. So F6 is satisfied by F1.
--
-- The schema treats reversals.status as varchar(30) with a CHECK constraint,
-- not the reversal_status_type enum, so we extend the CHECK constraint.
--
-- F4 (refund result type refactor) and F5 (offline sync queue integration)
-- are app-side and out of scope for this migration.

-- ============================================================================
-- F3a. Extend reversals.status to allow 'terminal_succeeded_db_pending'
-- ============================================================================
ALTER TABLE public.reversals
  DROP CONSTRAINT IF EXISTS valid_reversal_status;

ALTER TABLE public.reversals
  ADD CONSTRAINT valid_reversal_status
  CHECK (status::text = ANY (ARRAY[
    'pending',
    'processing',
    'completed',
    'failed',
    'terminal_succeeded_db_pending'
  ]));

COMMENT ON COLUMN public.reversals.status IS
  'pending: awaiting terminal call. processing: terminal call in flight. terminal_succeeded_db_pending: terminal returned success but DB completion (apply_refund_to_payment etc.) hasn''t finished — recovery path. completed: fully durable. failed: terminal returned failure.';

-- ============================================================================
-- F1. Partial UNIQUE index on reversals.original_payment_id for active rows.
--
-- Pre-flight: assert no existing dupes. If this DO block raises, Temur needs
-- to clean up duplicate reversals before this migration can succeed. The
-- alternative (silent corruption) is worse than a halted migration.
-- ============================================================================
DO $$
DECLARE
  v_dupe_count int;
  v_sample_payments text;
BEGIN
  SELECT COUNT(*), string_agg(DISTINCT original_payment_id::text, ', ')
    INTO v_dupe_count, v_sample_payments
    FROM (
      SELECT original_payment_id
        FROM public.reversals
       WHERE status::text IN ('pending', 'completed', 'terminal_succeeded_db_pending')
       GROUP BY original_payment_id
      HAVING COUNT(*) > 1
    ) d;

  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'Cannot create unique reversal index: % payment(s) have multiple active reversals. Sample original_payment_ids: %. Resolve before re-running.',
      v_dupe_count, v_sample_payments
      USING HINT = 'Mark older duplicates as ''failed'' so only one row per payment remains in (pending, completed, terminal_succeeded_db_pending).';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_reversal_per_payment
  ON public.reversals (original_payment_id)
  WHERE status::text IN ('pending', 'completed', 'terminal_succeeded_db_pending');

COMMENT ON INDEX public.uniq_active_reversal_per_payment IS
  'F1: prevents duplicate active reversals against the same payment. Second concurrent attempt fails with 23505; queue handlers must catch and treat as idempotent success.';

-- ============================================================================
-- F2. complete_reversal — atomic completion of the 4-step DB sequence.
--
-- Steps (all in one transaction):
--   3. apply_refund_to_payment(reversal.original_payment_id, amount, ...)
--   4. record_refund_items(reversal_id, items)         -- only if items provided
--   5. update_order_payment_status_after_refund(order_id)
--   6. UPDATE reversals SET status = 'completed', completed_at = now()
--
-- Idempotent: re-calling on a 'completed' reversal returns success without
-- side effects. Caller can safely retry on transient errors.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_reversal(
  p_reversal_id uuid,
  p_items       jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rev                  public.reversals%ROWTYPE;
  v_order_id             uuid;
  v_return_rrn           text;
  v_return_auth_code     text;
  v_return_reference_id  text;
  v_return_number        text;
BEGIN
  -- Lock the reversal row so no parallel completer can race us.
  SELECT *
    INTO v_rev
    FROM public.reversals
   WHERE id = p_reversal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversal % not found', p_reversal_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent fast-path: already completed.
  IF v_rev.status::text = 'completed' THEN
    RETURN jsonb_build_object(
      'success',           true,
      'already_completed', true,
      'reversal_id',       p_reversal_id
    );
  END IF;

  -- Only allow completion from these states. 'failed' is terminal.
  IF v_rev.status::text NOT IN ('pending', 'processing', 'terminal_succeeded_db_pending') THEN
    RAISE EXCEPTION 'Reversal % cannot be completed from status %',
      p_reversal_id, v_rev.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve the order via the original payment.
  SELECT order_id
    INTO v_order_id
    FROM public.order_payments
   WHERE id = v_rev.original_payment_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Original payment % not found for reversal %',
      v_rev.original_payment_id, p_reversal_id;
  END IF;

  -- Extract terminal return references from the stored response, falling
  -- back to top-level columns where present.
  v_return_rrn          := v_rev.terminal_response->>'rrn';
  v_return_auth_code    := v_rev.terminal_response->>'authCode';
  v_return_reference_id := COALESCE(
    v_rev.reversal_psp_reference,
    v_rev.terminal_response->>'referenceId'
  );
  v_return_number       := v_rev.terminal_response->>'transactionNumber';

  -- Step 3: apply refund to payment (9-arg overload).
  PERFORM public.apply_refund_to_payment(
    v_rev.original_payment_id,
    v_rev.amount,
    v_rev.reversal_type::public.reversal_type,
    v_return_rrn,
    v_return_auth_code,
    v_return_reference_id,
    v_return_number,
    v_rev.reason_description,
    v_rev.initiated_by
  );

  -- Step 4: record per-item refund rows (only if caller supplied items).
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    PERFORM public.record_refund_items(p_reversal_id, p_items);
  END IF;

  -- Step 5: recompute order.payment_status from current payments + refunds.
  PERFORM public.update_order_payment_status_after_refund(v_order_id);

  -- Step 6: mark reversal durable.
  UPDATE public.reversals
     SET status       = 'completed',
         completed_at = COALESCE(completed_at, now()),
         processed_at = COALESCE(processed_at, now())
   WHERE id = p_reversal_id;

  RETURN jsonb_build_object(
    'success',           true,
    'already_completed', false,
    'reversal_id',       p_reversal_id,
    'order_id',          v_order_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_reversal(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_reversal(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_reversal(uuid, jsonb) IS
  'F2: atomic completion of the post-terminal refund DB write sequence. Wraps apply_refund_to_payment + record_refund_items + update_order_payment_status_after_refund + status flip in one transaction. Idempotent on already-completed reversals.';

-- ============================================================================
-- F3b. Stale-reversal monitor — pg_cron job + audit_logs alert.
--
-- Every 5 minutes, scan for reversals stuck in
-- 'terminal_succeeded_db_pending' for >10 minutes. Each stale row generates a
-- 'critical' audit_logs entry that downstream alerting (Sentry / dashboards)
-- can pick up.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.alert_stale_reversals()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rev   public.reversals%ROWTYPE;
  v_count int := 0;
BEGIN
  FOR v_rev IN
    SELECT r.*
      FROM public.reversals r
      LEFT JOIN public.audit_logs al
        ON al.resource_type = 'reversal'
       AND al.resource_id   = r.id
       AND al.action        = 'reversal_stale_db_pending'
       AND al.created_at    > now() - interval '1 hour'
     WHERE r.status::text = 'terminal_succeeded_db_pending'
       AND r.requested_at < now() - interval '10 minutes'
       AND al.id IS NULL  -- skip if we already alerted within the last hour
  LOOP
    INSERT INTO public.audit_logs (
      action,
      action_category,
      severity,
      resource_type,
      resource_id,
      resource_name,
      staff_profile_id,
      location_id,
      merchant_id,
      metadata,
      status
    ) VALUES (
      'reversal_stale_db_pending',
      'payments',
      'critical',
      'reversal',
      v_rev.id,
      'Stale reversal — terminal succeeded, DB writes incomplete',
      v_rev.initiated_by,
      v_rev.location_id,
      v_rev.merchant_id,
      jsonb_build_object(
        'original_payment_id',    v_rev.original_payment_id,
        'reversal_reference_id',  v_rev.reversal_reference_id,
        'reversal_psp_reference', v_rev.reversal_psp_reference,
        'reversal_type',          v_rev.reversal_type,
        'amount',                 v_rev.amount,
        'requested_at',           v_rev.requested_at,
        'minutes_stale',          EXTRACT(EPOCH FROM (now() - v_rev.requested_at)) / 60,
        'recovery_hint',          'Call complete_reversal() with this reversal_id to finish the DB write sequence.'
      ),
      'failure'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.alert_stale_reversals() FROM PUBLIC;

COMMENT ON FUNCTION public.alert_stale_reversals() IS
  'F3: scans for reversals stuck in terminal_succeeded_db_pending for >10 minutes and emits a critical audit_logs row per stale reversal. De-duplicates within a 1-hour window so a long-stuck reversal doesn''t spam the log. Invoked by pg_cron every 5 minutes.';

-- Schedule via pg_cron. Idempotent — unschedule first if a previous version
-- exists. pg_cron may not be available on every env; wrap in DO block so the
-- migration doesn't fail if the extension isn't installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('alert_stale_reversals')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'alert_stale_reversals'
      );

    PERFORM cron.schedule(
      'alert_stale_reversals',
      '*/5 * * * *',
      $cron$SELECT public.alert_stale_reversals();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not installed — alert_stale_reversals must be invoked externally (e.g. supabase scheduled edge function).';
  END IF;
END $$;
