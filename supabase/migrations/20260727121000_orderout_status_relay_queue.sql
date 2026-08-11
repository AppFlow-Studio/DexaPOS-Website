-- [OrderOut] Outbound status relay — capture queue + trigger + worker RPCs.
--
-- PROBLEM
--   Marking a delivery order Ready on the POS/KDS updated Dexa's DB only. No
--   writeback to OrderOut ever existed, so UberEats / DoorDash / Grubhub never
--   saw the order advance: no customer "order ready" push, no courier signal.
--   mark_online_order_ready() documents a relay layer ("The OrderOut integration
--   layer observes this transition and relays mark-ready to the marketplace")
--   that was never built. This migration is that layer's capture half.
--
-- WHY A TRIGGER AND NOT PER-CALL-SITE HTTP
--   Several independent writers move an order to 'ready' — mark_online_order_ready
--   (POS), KDS bump, bulk_update_order_item_status_v2, expo. Wiring each one is
--   exactly how the gap shipped. Capture once, at the table, origin-agnostic.
--   Same precedent as the 86/snooze path (notify_item_snooze_change -> pg_net).
--
-- IDENTIFIER
--   OrderOut's mark-ready keys on the value delivered as `externalReferenceId`
--   on the inbound order webhook — their Accept/Reject reference states it
--   verbatim: "ID of the order you received in the externalReferenceId field".
--   We have stored that since March as online_orders.external_reference
--   (16-digit numeric, populated on every OrderOut row). No backfill needed.
--
-- READY ONLY
--   OrderOut exposes Cancel, Mark Ready and Accept/Reject for POS integrators —
--   there is no complete/picked-up operation. 'completed' is therefore excluded
--   from the trigger rather than enqueued and failed forever. target_status is
--   still a column so accept/decline (and other providers) reuse this table.
--
-- SAFETY
--   The POS action must never fail because of relay state. The trigger does no
--   synchronous HTTP, and its whole body is exception-guarded: a relay problem
--   degrades to a WARNING in the logs, never a rolled-back order update.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orderout_status_relay_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  online_order_id  uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  provider         text NOT NULL DEFAULT 'orderout',
  target_status    text NOT NULL CHECK (target_status IN ('ready')),
  -- Snapshot of online_orders.external_reference at enqueue time. The worker
  -- never re-joins, so a later mutation of the source row cannot silently
  -- redirect an in-flight relay.
  oo_order_id      text NOT NULL,
  state            text NOT NULL DEFAULT 'pending'
                     CHECK (state IN ('pending', 'sent', 'failed')),
  attempts         int  NOT NULL DEFAULT 0,
  max_attempts     int  NOT NULL DEFAULT 5,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  last_status_code int,
  created_at       timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz,
  sent_at          timestamptz,
  -- Repeat transitions (double-tap, recall -> ready again) must never
  -- produce a second outbound call.
  CONSTRAINT orderout_status_relay_queue_once UNIQUE (online_order_id, target_status)
);

COMMENT ON TABLE public.orderout_status_relay_queue IS
  'Outbox for POS -> OrderOut status writeback. Source of truth for the relay; '
  'the pg_net poke is only a latency optimisation, the cron drain is the floor.';

CREATE INDEX IF NOT EXISTS idx_oo_relay_due
  ON public.orderout_status_relay_queue (next_attempt_at)
  WHERE state = 'pending';

ALTER TABLE public.orderout_status_relay_queue ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: service-role only, per project convention for
-- queue/outbox tables. anon + authenticated must never see relay internals.

-- ============================================================================
-- DISPATCH POKE (best-effort; cron in the companion migration is the floor)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.poke_orderout_status_relay()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  relay_url    text;
  relay_secret text;
BEGIN
  -- Config lives in Vault: on Supabase the postgres role cannot run
  -- ALTER DATABASE ... SET app.*, so GUCs are not settable from the SQL editor.
  -- Mirrors 20260718130000_snooze_orderout_resync_vault.sql.
  SELECT nullif(ds.decrypted_secret, '') INTO relay_url
    FROM vault.decrypted_secrets ds WHERE ds.name = 'orderout_status_relay_url' LIMIT 1;

  SELECT nullif(ds.decrypted_secret, '') INTO relay_secret
    FROM vault.decrypted_secrets ds WHERE ds.name = 'internal_notification_secret' LIMIT 1;

  -- Unconfigured -> no-op, so this migration is safe to apply before the
  -- secrets exist or the function is deployed. Queue rows simply wait.
  IF relay_url IS NULL OR relay_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := relay_url,
    body    := jsonb_build_object('reason', 'status_relay_poke'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', relay_secret
    )
  );
END $$;

-- ============================================================================
-- CAPTURE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_orderout_status_relay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_oo     RECORD;
  v_new_id uuid;
BEGIN
  SELECT oo.id, oo.external_reference
    INTO v_oo
    FROM public.online_orders oo
   WHERE oo.order_id = NEW.id
     AND oo.provider = 'orderout'
   LIMIT 1;

  -- Not an OrderOut order (dine-in, website, QR, kiosk) -> nothing to relay.
  -- Uses idx_online_orders_order_id, so the common case is one index probe.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- An OrderOut order we cannot address. Louder than a silent skip: this is
  -- the failure mode that produced the original bug.
  IF v_oo.external_reference IS NULL THEN
    RAISE WARNING 'orderout status relay: online_order % has no external_reference; cannot relay order %',
      v_oo.id, NEW.id;
    RETURN NULL;
  END IF;

  INSERT INTO public.orderout_status_relay_queue
    (order_id, online_order_id, oo_order_id, target_status)
  VALUES
    (NEW.id, v_oo.id, v_oo.external_reference, 'ready')
  ON CONFLICT (online_order_id, target_status) DO NOTHING
  RETURNING id INTO v_new_id;

  -- Already queued or already sent for this transition -> do not re-poke.
  IF v_new_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Nested block on purpose. plpgsql EXCEPTION handlers roll the enclosing
  -- block back to its start, so a poke failure inside the outer handler would
  -- also undo the INSERT above and silently drop the relay. Isolating the
  -- network call keeps the enqueue durable — cron will drain it either way.
  BEGIN
    PERFORM public.poke_orderout_status_relay();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'orderout status relay: poke failed for order % (%): % — row % stays queued for cron',
      NEW.id, SQLSTATE, SQLERRM, v_new_id;
  END;

  RETURN NULL;

EXCEPTION WHEN OTHERS THEN
  -- Hard constraint: the staff action never fails because of relay state.
  -- Losing a queue row is recoverable; breaking mark-ready for a merchant is
  -- the bug we are here to fix.
  RAISE WARNING 'orderout status relay: enqueue failed for order % (%): %',
    NEW.id, SQLSTATE, SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_relay_orderout_status ON public.orders;
CREATE TRIGGER trg_relay_orderout_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ready')
  EXECUTE FUNCTION public.enqueue_orderout_status_relay();

-- ============================================================================
-- WORKER RPCs
-- ============================================================================

-- Claim a batch. Incrementing next_attempt_at on claim doubles as both the
-- backoff schedule and a visibility timeout: a worker that dies mid-flight
-- leaves rows that become due again on their own — no stuck 'claimed' state,
-- no reaper process.
CREATE OR REPLACE FUNCTION public.claim_orderout_status_relay(p_limit int DEFAULT 20)
RETURNS SETOF public.orderout_status_relay_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orderout_status_relay_queue q
     SET attempts        = q.attempts + 1,
         claimed_at      = now(),
         next_attempt_at = now() + (interval '30 seconds' * power(2, q.attempts))
   WHERE q.id IN (
           SELECT c.id
             FROM public.orderout_status_relay_queue c
            WHERE c.state = 'pending'
              AND c.next_attempt_at <= now()
            ORDER BY c.next_attempt_at
            FOR UPDATE SKIP LOCKED
            LIMIT p_limit
         )
  RETURNING q.*;
$$;

-- Settle one claimed row. Queue state, online_orders and the DLQ move together
-- so they cannot diverge.
CREATE OR REPLACE FUNCTION public.complete_orderout_status_relay(
  p_id          uuid,
  p_ok          boolean,
  p_status_code int     DEFAULT NULL,
  p_error       text    DEFAULT NULL,
  p_terminal    boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.orderout_status_relay_queue;
BEGIN
  SELECT * INTO v_row FROM public.orderout_status_relay_queue WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_ok THEN
    UPDATE public.orderout_status_relay_queue
       SET state = 'sent', sent_at = now(),
           last_status_code = p_status_code, last_error = NULL
     WHERE id = p_id;

    -- OPTIMISTIC. OrderOut answers 202 Accepted and processes asynchronously,
    -- and documents no callback confirming the marketplace actually updated.
    -- provider_status is therefore best-known-state; the queue row's sent_at is
    -- the honest record of what we did.
    UPDATE public.online_orders
       SET provider_status = v_row.target_status,
           status_updated_at = now()
     WHERE id = v_row.online_order_id;

    RETURN;
  END IF;

  IF p_terminal OR v_row.attempts >= v_row.max_attempts THEN
    UPDATE public.orderout_status_relay_queue
       SET state = 'failed', last_error = p_error, last_status_code = p_status_code
     WHERE id = p_id;

    -- source lets the existing HQ replay tooling pick these up unchanged.
    INSERT INTO public.webhook_dead_letter_queue
      (source, event_type, raw_payload, error_message)
    VALUES
      ('orderout_status_relay', v_row.target_status, to_jsonb(v_row), p_error);
  ELSE
    -- Stays pending; next_attempt_at was already backed off at claim time.
    UPDATE public.orderout_status_relay_queue
       SET last_error = p_error, last_status_code = p_status_code
     WHERE id = p_id;
  END IF;
END $$;

-- ============================================================================
-- GRANTS — service role only
-- ============================================================================

REVOKE ALL ON FUNCTION public.poke_orderout_status_relay()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_orderout_status_relay(int)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_orderout_status_relay(uuid, boolean, int, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.poke_orderout_status_relay()            TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_orderout_status_relay(int)        TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_orderout_status_relay(uuid, boolean, int, text, boolean) TO service_role;
