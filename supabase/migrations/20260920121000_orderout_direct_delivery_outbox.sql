-- [OrderOut Direct] Dispatch outbox — capture triggers, worker RPCs, sweep, cron.
--
-- Companion to 20260920120000_orderout_direct_delivery_schema.sql. Copies the
-- shape of 20260727121000_orderout_status_relay_queue.sql (trigger -> row ->
-- pg_net poke -> one-minute cron floor -> claim/complete RPCs -> DLQ) because
-- that pattern is already proven in production for the same vendor.
--
-- STATE MACHINE (orderout_delivery_dispatches.state)
--   awaiting_accept --(orders.accepted_at set)--> pending --(push 2xx)--> dispatched
--        |                                          |-- terminal / max attempts --> failed
--        |-- order cancelled before accept --> cancelled (no OrderOut call)
--   dispatched --(order cancelled)--> cancel_pending --(cancel ok/404)--> cancelled
--                                                   |-- courier already has it --> dispatched (+alert)
--
-- WHY accepted_at
--   accept_online_order() (auto and manual) moves status pending -> sent_to_kitchen
--   and stamps accepted_at. process_online_order's own auto-accept path does the
--   same. accepted_at is the one signal every accept path shares.
--
-- CANCEL CAPTURE
--   cancelled / declined / void / refunded are the four terminal-negative
--   order_status values. Writers: cancel-online-order (customer + system
--   expiry), decline_online_order, cancel_online_order (POS), void_order,
--   dashboard RefundOrder. Capturing on orders.status covers all of them.
--
-- NO CLAIMED STATE
--   Claiming bumps next_attempt_at by the backoff; that doubles as a visibility
--   timeout, so a crashed worker's row simply becomes due again. No reaper.
--
-- CONFIG
--   Vault secrets: orderout_delivery_dispatch_url (new, per environment:
--   https://<ref>.supabase.co/functions/v1/orderout-delivery-dispatch) and
--   internal_notification_secret (pre-existing). Create the URL secret only
--   AFTER the function is deployed, or every row burns attempts on 404.
--   Unconfigured -> the poke is a no-op and rows wait for the cron.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- POKE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.poke_orderout_delivery_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT nullif(ds.decrypted_secret, '') INTO v_url
    FROM vault.decrypted_secrets ds WHERE ds.name = 'orderout_delivery_dispatch_url' LIMIT 1;

  SELECT nullif(ds.decrypted_secret, '') INTO v_secret
    FROM vault.decrypted_secrets ds WHERE ds.name = 'internal_notification_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object('reason', 'delivery_dispatch_poke'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    )
  );
END $$;

-- ============================================================================
-- CAPTURE: accept -> pending
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oo_dispatch_on_order_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_moved uuid;
BEGIN
  UPDATE public.orderout_delivery_dispatches d
     SET state = 'pending',
         next_attempt_at = now()
   WHERE d.order_id = NEW.id
     AND d.state = 'awaiting_accept'
  RETURNING d.id INTO v_moved;

  IF v_moved IS NULL THEN
    RETURN NULL;
  END IF;

  -- The poke is best-effort and isolated: a failure here must not roll back
  -- the state change above (the cron floor will drain it).
  BEGIN
    PERFORM public.poke_orderout_delivery_dispatch();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[oo_dispatch] poke failed after accept of order %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Accepting an order must never fail because of delivery state.
  RAISE WARNING '[oo_dispatch] accept capture failed for order %: %', NEW.id, SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_oo_dispatch_on_accept ON public.orders;
CREATE TRIGGER trg_oo_dispatch_on_accept
  AFTER UPDATE OF accepted_at ON public.orders
  FOR EACH ROW
  WHEN (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL)
  EXECUTE FUNCTION public.oo_dispatch_on_order_accepted();

-- ============================================================================
-- CAPTURE: cancel -> cancelled | cancel_pending
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oo_dispatch_on_order_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_reason text;
  v_needs_call boolean := false;
BEGIN
  v_reason := COALESCE(
    nullif(NEW.cancellation_reason, ''),
    nullif(NEW.declined_reason, ''),
    nullif(NEW.void_reason, ''),
    'Order ' || NEW.status::text
  );

  -- Never dispatched: close the row locally, no OrderOut call.
  UPDATE public.orderout_delivery_dispatches d
     SET state = 'cancelled',
         cancel_reason = v_reason,
         cancelled_at = now()
   WHERE d.order_id = NEW.id
     AND d.state IN ('awaiting_accept', 'pending');

  -- Courier already booked: hand the cancel to the worker.
  UPDATE public.orderout_delivery_dispatches d
     SET state = 'cancel_pending',
         cancel_reason = v_reason,
         attempts = 0,
         next_attempt_at = now(),
         last_error = NULL,
         last_status_code = NULL
   WHERE d.order_id = NEW.id
     AND d.state = 'dispatched'
  RETURNING true INTO v_needs_call;

  IF COALESCE(v_needs_call, false) THEN
    BEGIN
      PERFORM public.poke_orderout_delivery_dispatch();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[oo_dispatch] poke failed after cancel of order %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[oo_dispatch] cancel capture failed for order %: %', NEW.id, SQLERRM;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_oo_dispatch_on_cancel ON public.orders;
CREATE TRIGGER trg_oo_dispatch_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status IN ('cancelled'::public.order_status,
                           'declined'::public.order_status,
                           'void'::public.order_status,
                           'refunded'::public.order_status))
  EXECUTE FUNCTION public.oo_dispatch_on_order_cancelled();

-- ============================================================================
-- WORKER: claim
-- ============================================================================

-- Backoff at claim time: 30s, 1m, 2m, 4m, 8m, 16m (attempts pre-increment).
-- The bump is also the visibility timeout — a crashed worker's row is retried
-- automatically once it elapses.
CREATE OR REPLACE FUNCTION public.claim_orderout_delivery_dispatch(p_limit integer DEFAULT 20)
RETURNS SETOF public.orderout_delivery_dispatches
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.orderout_delivery_dispatches d
     SET attempts = d.attempts + 1,
         next_attempt_at = now() + (interval '30 seconds' * power(2, d.attempts))
   WHERE d.id IN (
     SELECT q.id
       FROM public.orderout_delivery_dispatches q
      WHERE q.state IN ('pending', 'cancel_pending')
        AND q.next_attempt_at <= now()
      ORDER BY q.next_attempt_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING d.*;
$$;

-- ============================================================================
-- WORKER: complete
-- ============================================================================

-- p_outcome:
--   'dispatched'      push succeeded; p_result may carry oo_channel_order_id,
--                     oo_delivery_order_id, tracker_id, fd_id, request_payload,
--                     response_payload, requote_delta
--   'cancelled'       cancel succeeded (or 404 / already cancelled)
--   'cancel_rejected' OrderOut refused (courier already has the food) -> back to
--                     dispatched; the worker alerts the merchant
--   'retry'           transient failure; stays in its state, backoff already
--                     applied at claim. Becomes 'failed' at max_attempts.
--   'failed'          terminal failure now, regardless of attempts
CREATE OR REPLACE FUNCTION public.complete_orderout_delivery_dispatch(
  p_id          uuid,
  p_outcome     text,
  p_status_code integer DEFAULT NULL,
  p_error       text    DEFAULT NULL,
  p_result      jsonb   DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.orderout_delivery_dispatches%ROWTYPE;
  v_final_outcome text := p_outcome;
BEGIN
  SELECT * INTO v_row FROM public.orderout_delivery_dispatches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_outcome = 'retry' AND v_row.attempts >= v_row.max_attempts THEN
    v_final_outcome := 'failed';
  END IF;

  IF v_final_outcome = 'dispatched' THEN
    UPDATE public.orderout_delivery_dispatches
       SET state = 'dispatched',
           dispatched_at = COALESCE(dispatched_at, now()),
           last_status_code = p_status_code,
           last_error = NULL,
           oo_channel_order_id  = COALESCE(p_result->>'oo_channel_order_id',  oo_channel_order_id),
           oo_delivery_order_id = COALESCE(p_result->>'oo_delivery_order_id', oo_delivery_order_id),
           tracker_id           = COALESCE(p_result->>'tracker_id', tracker_id),
           fd_id                = COALESCE(p_result->>'fd_id', fd_id),
           request_payload      = COALESCE(p_result->'request_payload', request_payload),
           response_payload     = COALESCE(p_result->'response_payload', response_payload),
           requote_delta        = COALESCE((p_result->>'requote_delta')::numeric, requote_delta)
     WHERE id = p_id;

  ELSIF v_final_outcome = 'cancelled' THEN
    UPDATE public.orderout_delivery_dispatches
       SET state = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, now()),
           last_status_code = p_status_code,
           last_error = NULL,
           response_payload = COALESCE(p_result->'response_payload', response_payload)
     WHERE id = p_id;

  ELSIF v_final_outcome = 'cancel_rejected' THEN
    UPDATE public.orderout_delivery_dispatches
       SET state = 'dispatched',
           last_status_code = p_status_code,
           last_error = COALESCE(p_error, 'cancel_rejected'),
           response_payload = COALESCE(p_result->'response_payload', response_payload)
     WHERE id = p_id;

  ELSIF v_final_outcome = 'failed' THEN
    UPDATE public.orderout_delivery_dispatches
       SET state = 'failed',
           failed_at = now(),
           last_status_code = p_status_code,
           last_error = p_error,
           request_payload  = COALESCE(p_result->'request_payload', request_payload),
           response_payload = COALESCE(p_result->'response_payload', response_payload)
     WHERE id = p_id;

    INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
    VALUES ('orderout_delivery_dispatch', v_row.state, to_jsonb(v_row), p_error);

  ELSE -- 'retry'
    UPDATE public.orderout_delivery_dispatches
       SET last_status_code = p_status_code,
           last_error = p_error,
           request_payload  = COALESCE(p_result->'request_payload', request_payload),
           response_payload = COALESCE(p_result->'response_payload', response_payload)
     WHERE id = p_id;
  END IF;
END $$;

-- ============================================================================
-- STATUS INTAKE (source-agnostic: webhook or poller call this)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.orderout_delivery_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'pending_assign'   THEN 1
    WHEN 'pending_merchant' THEN 1
    WHEN 'scheduled'        THEN 1
    WHEN 'runner_assigned'  THEN 2
    WHEN 'en_route_pickup'  THEN 3
    WHEN 'arrived_pickup'   THEN 4
    WHEN 'picked_up'        THEN 5
    WHEN 'en_route_dropoff' THEN 6
    WHEN 'arrived_dropoff'  THEN 7
    WHEN 'completed'        THEN 8
    WHEN 'cancelled'        THEN 99
    ELSE 0
  END;
$$;

-- Returns true when the stepper actually advanced (caller then broadcasts).
-- Monotonic: a duplicate or out-of-order event never lowers the rank. Courier
-- details are still refreshed on equal-rank events so a late courier name lands.
CREATE OR REPLACE FUNCTION public.apply_orderout_delivery_status(
  p_dispatch_id  uuid,
  p_status       text,
  p_courier      jsonb DEFAULT '{}'::jsonb,   -- {name, phone}
  p_eta          timestamptz DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_raw          jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row  public.orderout_delivery_dispatches%ROWTYPE;
  v_rank integer;
  v_advanced boolean := false;
BEGIN
  SELECT * INTO v_row FROM public.orderout_delivery_dispatches WHERE id = p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_rank := public.orderout_delivery_status_rank(p_status);
  IF v_rank = 0 THEN
    RAISE WARNING '[oo_dispatch] unknown delivery status "%" for dispatch %', p_status, p_dispatch_id;
    RETURN false;
  END IF;

  IF v_rank < v_row.delivery_status_rank THEN
    -- Stale event. Keep the row as is.
    RETURN false;
  END IF;

  v_advanced := v_rank > v_row.delivery_status_rank;

  UPDATE public.orderout_delivery_dispatches
     SET delivery_status      = p_status,
         delivery_status_rank = v_rank,
         courier_name  = COALESCE(nullif(p_courier->>'name',  ''), courier_name),
         courier_phone = COALESCE(nullif(p_courier->>'phone', ''), courier_phone),
         tracking_url  = COALESCE(nullif(p_tracking_url, ''), tracking_url),
         eta           = COALESCE(p_eta, eta),
         response_payload = CASE WHEN p_raw IS NULL THEN response_payload ELSE p_raw END,
         -- Courier-side cancellation is a failure of the delivery, not of the
         -- order: the merchant decides what happens to the food.
         state = CASE
                   WHEN p_status = 'cancelled' AND state IN ('dispatched', 'cancel_pending') THEN 'failed'
                   ELSE state
                 END,
         failed_at  = CASE WHEN p_status = 'cancelled' AND state = 'dispatched' THEN now() ELSE failed_at END,
         last_error = CASE WHEN p_status = 'cancelled' AND state = 'dispatched' THEN 'courier_cancelled' ELSE last_error END
   WHERE id = p_dispatch_id;

  -- Mirror onto the online_orders row the dashboard and tracking page read.
  IF v_row.online_order_id IS NOT NULL THEN
    UPDATE public.online_orders
       SET delivery_driver    = COALESCE(nullif(p_courier->>'name', ''), delivery_driver),
           delivery_tracking  = COALESCE(nullif(p_tracking_url, ''), delivery_tracking),
           estimated_delivery = COALESCE(p_eta, estimated_delivery),
           status_updated_at  = now()
     WHERE id = v_row.online_order_id;
  END IF;

  RETURN v_advanced;
END $$;

-- ============================================================================
-- SWEEP: paid Direct delivery orders that never got a dispatch row
-- ============================================================================

-- create-online-order inserts the dispatch row right after process_online_order
-- succeeds. If that insert is lost (crash between the two), this sweep rebuilds
-- it from the session's selected quote so the customer never pays for a
-- delivery nobody books. Runs every 5 minutes; looks back 24h.
CREATE OR REPLACE FUNCTION public.sweep_orderout_delivery_dispatches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH candidates AS (
    SELECT o.id AS order_id,
           oo.id AS online_order_id,
           o.location_id,
           o.merchant_id,
           o.order_number,
           o.accepted_at,
           o.tip_amount,
           q.id AS quote_id,
           q.price
      FROM public.orders o
      JOIN public.online_orders oo
        ON oo.order_id = o.id AND oo.provider = 'website'
      JOIN public.online_store_config c
        ON c.location_id = o.location_id AND c.delivery_fulfillment = 'orderout_direct'
      JOIN LATERAL (
        SELECT q.id, q.price
          FROM public.orderout_delivery_quotes q
         WHERE q.session_id = o.online_session_id
           AND q.is_selected
         ORDER BY q.fetched_at DESC
         LIMIT 1
      ) q ON true
     WHERE o.order_type = 'delivery'::public.order_type
       AND o.payment_status = 'paid'::public.payment_status
       AND o.status NOT IN ('cancelled', 'declined', 'void', 'refunded')
       AND o.created_at > now() - interval '24 hours'
       AND o.online_session_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.orderout_delivery_dispatches d WHERE d.order_id = o.id)
  ),
  ins AS (
    INSERT INTO public.orderout_delivery_dispatches
      (order_id, online_order_id, location_id, merchant_id, quote_id, charged_fee,
       driver_tip, oo_order_number, state, last_error)
    SELECT order_id, online_order_id, location_id, merchant_id, quote_id, price,
           COALESCE(tip_amount, 0), order_number,
           CASE WHEN accepted_at IS NOT NULL THEN 'pending' ELSE 'awaiting_accept' END,
           'recovered_by_sweep'
      FROM candidates
    ON CONFLICT (order_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  IF v_inserted > 0 THEN
    RAISE WARNING '[oo_dispatch] sweep recovered % dispatch row(s)', v_inserted;
    BEGIN
      PERFORM public.poke_orderout_delivery_dispatch();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[oo_dispatch] poke failed after sweep: %', SQLERRM;
    END;
  END IF;

  RETURN v_inserted;
END $$;

-- ============================================================================
-- CRON
-- ============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('orderout-delivery-dispatch-drain');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'orderout-delivery-dispatch-drain',
  '* * * * *',
  $cron$SELECT public.poke_orderout_delivery_dispatch()$cron$
);

DO $$
BEGIN
  PERFORM cron.unschedule('orderout-delivery-dispatch-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'orderout-delivery-dispatch-sweep',
  '*/5 * * * *',
  $cron$SELECT public.sweep_orderout_delivery_dispatches()$cron$
);

-- ============================================================================
-- GRANTS — worker RPCs are service-role only
-- ============================================================================

REVOKE ALL ON FUNCTION public.poke_orderout_delivery_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_orderout_delivery_dispatch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_orderout_delivery_dispatch(uuid, text, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_orderout_delivery_status(uuid, text, jsonb, timestamptz, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_orderout_delivery_dispatches() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.poke_orderout_delivery_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_orderout_delivery_dispatch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_orderout_delivery_dispatch(uuid, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_orderout_delivery_status(uuid, text, jsonb, timestamptz, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sweep_orderout_delivery_dispatches() TO service_role;
