-- Wave C — restore session stamping/analytics via the mechanism that already exists.
--
-- Problem: the POS client frees dine-in tables with a DIRECT UPDATE to
-- table_sessions (services/floorPlanService.ts), bypassing the event-sourced
-- projector `update_session_from_event`. That projector is the ONLY writer of
-- paid_at / cleared_at and the derived status, so `paid_at` is NULL on 0-of-1338
-- sessions and no payment_complete/table_cleared/table_cleaned events are ever
-- recorded. Table-turn analytics are silently blind.
--
-- Fix: an idempotent, client-callable RPC that closes the check + frees the
-- session THROUGH the event mechanism (insert the terminal events → the
-- projector stamps paid_at/cleared_at and advances status), then sets the
-- is_active / closed_at / actual_duration columns the projector does not touch.
-- Wave B journals THIS op, so it must be replay-safe.
--
-- Idempotency/replay-safety comes from the function being a SINGLE transaction:
--   * SELECT ... FOR UPDATE serialises concurrent calls on the same session;
--   * an already-freed session (is_active = false) short-circuits to a no-op;
--   * a partial failure rolls the whole txn back (events included), so a replay
--     re-runs cleanly. No partial unique index is used — a legitimate
--     reopen→re-pay must be able to record a second payment_complete.
--
-- Deliberately does NOT set orders.status = 'completed': clearing the session is
-- distinct from completing the order (a paid order legitimately sits at 'ready'
-- until the order-completion flow runs; see the Jun-21 recurrence).

CREATE OR REPLACE FUNCTION public.close_and_free_session(
  p_order_id uuid,
  p_session_id uuid,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session   public.table_sessions%ROWTYPE;
  v_merchant  uuid;
  v_staff     uuid;
  v_amount_due numeric;
  v_paid_at   timestamptz;
  v_note      text;
BEGIN
  v_staff := COALESCE(p_staff_id, user_staff_profile_id());
  v_note  := COALESCE(p_idempotency_key, 'close_and_free_session');
  v_merchant := user_merchant_id();

  -- Load + lock the session. JWT-scoped when claims are present (client calls);
  -- a NULL merchant (service_role / SQL editor) is allowed so the op is testable.
  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
    AND (v_merchant IS NULL OR merchant_id = v_merchant)
    AND (v_merchant IS NULL OR location_id = ANY(user_location_ids()))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Idempotent replay: already freed → success no-op (mirrors the offline
  -- close_check "already closed, treat as success" convention).
  IF v_session.is_active = false THEN
    RETURN json_build_object(
      'success', true,
      'already_freed', true,
      'session_id', p_session_id,
      'freed_at', v_session.closed_at
    );
  END IF;

  -- Guard: never free a session whose order still owes money (card price is the
  -- source of truth; a fully-paid order is 0.00 regardless of pricing mode).
  SELECT amount_due INTO v_amount_due FROM public.orders WHERE id = p_order_id;
  IF v_amount_due IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;
  IF v_amount_due > 0.01 THEN
    RAISE EXCEPTION 'Order % not fully paid (amount_due=%)', p_order_id, v_amount_due;
  END IF;

  -- Close the check (idempotent: sets check_status = 'Closed').
  PERFORM public.close_check(p_order_id, v_staff);

  -- Bump order sync_version so reconcile_orders_summary detects the close and
  -- Wave A's gate read doesn't re-report the phantom.
  UPDATE public.orders
  SET sync_version = COALESCE(sync_version, 0) + 1,
      updated_at = now()
  WHERE id = p_order_id;

  -- Accurate paid_at: the real last-capture time, not the clear time.
  SELECT MAX(op.captured_at) INTO v_paid_at
  FROM public.order_payments op
  WHERE op.order_id = p_order_id AND op.status = 'captured';

  -- Emit the terminal lifecycle events. The AFTER-INSERT projector
  -- (update_session_from_event) stamps paid_at (payment_complete) / cleared_at
  -- (table_cleared) and advances status paid → cleaning → available.
  INSERT INTO public.table_session_events
    (session_id, event_type, event_data, notes, triggered_by_staff_id, triggered_by_system, occurred_at)
  VALUES
    (p_session_id, 'payment_complete', jsonb_build_object('source', 'close_and_free_session'),
     v_note, v_staff, true, COALESCE(v_paid_at, now()));

  INSERT INTO public.table_session_events
    (session_id, event_type, event_data, notes, triggered_by_staff_id, triggered_by_system, occurred_at)
  VALUES
    (p_session_id, 'table_cleared', jsonb_build_object('source', 'close_and_free_session'),
     v_note, v_staff, true, now());

  INSERT INTO public.table_session_events
    (session_id, event_type, event_data, notes, triggered_by_staff_id, triggered_by_system, occurred_at)
  VALUES
    (p_session_id, 'table_cleaned', jsonb_build_object('source', 'close_and_free_session'),
     v_note, v_staff, true, now());

  -- Free the session. The projector set status='available' (via table_cleaned)
  -- but does not touch is_active / closed_at / actual_duration.
  UPDATE public.table_sessions
  SET is_active = false,
      closed_at = COALESCE(closed_at, now()),
      closed_by = COALESCE(closed_by, v_staff),
      actual_duration = COALESCE(
        actual_duration,
        EXTRACT(EPOCH FROM (now() - seated_at)) / 60
      )
  WHERE id = p_session_id;

  RETURN json_build_object(
    'success', true,
    'already_freed', false,
    'session_id', p_session_id,
    'order_id', p_order_id,
    'paid_at', COALESCE(v_paid_at, now())
  );
END;
$$;

COMMENT ON FUNCTION public.close_and_free_session(uuid, uuid, uuid, text) IS
  'Wave C — atomic, idempotent close-check + free-session that routes through the '
  'event projector so paid_at/cleared_at + payment_complete/table_cleared/'
  'table_cleaned are recorded. Replay-safe (FOR UPDATE + is_active short-circuit); '
  'returns {already_freed:true} on a session already freed.';

GRANT EXECUTE ON FUNCTION public.close_and_free_session(uuid, uuid, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill: paid_at was never stamped (0 of ~1338 sessions). Recover it from
-- the authoritative capture time — MAX(order_payments.captured_at) for a fully
-- paid order — NOT updated_at (which any later touch inflates). Sessions that
-- never reached paid (comps / walk-outs / still-open) are intentionally left
-- NULL. actual_duration is left untouched (a distinct metric).
-- ---------------------------------------------------------------------------
UPDATE public.table_sessions ts
SET paid_at = src.max_captured
FROM (
  SELECT o.session_id, MAX(op.captured_at) AS max_captured
  FROM public.orders o
  JOIN public.order_payments op ON op.order_id = o.id
  WHERE op.status = 'captured'
    AND o.payment_status = 'paid'
    AND o.session_id IS NOT NULL
  GROUP BY o.session_id
) src
WHERE ts.id = src.session_id
  AND ts.paid_at IS NULL
  AND src.max_captured IS NOT NULL;
