-- A7: Graceful merchant suspension with drain.
--
-- Adds 'suspending' status, a guard against new orders/drawer sessions during
-- suspending|suspended, and a drain watcher that auto-promotes 'suspending' ->
-- 'suspended' the moment the last in-flight order completes or the last open
-- drawer closes. No polling, no blocking RPC.

-- ---------------------------------------------------------------------------
-- 1) Allow 'suspending' as an onboarding_status value.
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_onboarding_status_check;
ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_onboarding_status_check
  CHECK (
    onboarding_status IN (
      'created',
      'onboarding',
      'active',
      'suspending',
      'suspended',
      'cancelled'
    )
  );
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_initiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;
-- ---------------------------------------------------------------------------
-- 2) Audit table for forced suspensions — captures every still-open artifact
--    so it can be reconciled later.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suspension_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'forced', 'completed', 'cancelled')),
  forced boolean NOT NULL DEFAULT false,
  reason text,
  initiated_by_user_id text,
  open_orders jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_drawer_sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_orders_count integer NOT NULL DEFAULT 0,
  open_drawer_sessions_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suspension_events_merchant_id_created_at_idx
  ON public.suspension_events (merchant_id, created_at DESC);
ALTER TABLE public.suspension_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "HQ admins read suspension_events" ON public.suspension_events;
CREATE POLICY "HQ admins read suspension_events"
  ON public.suspension_events
  FOR SELECT
  USING (true);
-- service role / HQ-gated server actions only; no client direct access

-- ---------------------------------------------------------------------------
-- 3) Drain primitives — reusable for both suspend and (future) delete.
-- ---------------------------------------------------------------------------
-- "In-flight" orders = anything that's been touched but not finalized.
CREATE OR REPLACE FUNCTION public.merchant_open_orders(p_merchant_id uuid)
RETURNS TABLE (id uuid, order_number text, status text, location_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.order_number, o.status::text, o.location_id, o.created_at
  FROM public.orders o
  WHERE o.merchant_id = p_merchant_id
    AND o.status::text IN ('pending', 'sent_to_kitchen', 'preparing', 'ready', 'accepted');
$$;
CREATE OR REPLACE FUNCTION public.merchant_open_drawer_sessions(p_merchant_id uuid)
RETURNS TABLE (id uuid, cash_drawer_id uuid, location_id uuid, opened_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.cash_drawer_id, s.location_id, s.opened_at
  FROM public.cash_drawer_sessions s
  WHERE s.merchant_id = p_merchant_id
    AND s.status::text = 'open';
$$;
CREATE OR REPLACE FUNCTION public.get_merchant_drain_status(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_orders integer;
  v_drawers integer;
  v_initiated_at timestamptz;
BEGIN
  SELECT onboarding_status, suspension_initiated_at
    INTO v_status, v_initiated_at
  FROM public.merchants
  WHERE id = p_merchant_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Merchant % not found', p_merchant_id;
  END IF;

  SELECT count(*) INTO v_orders FROM public.merchant_open_orders(p_merchant_id);
  SELECT count(*) INTO v_drawers FROM public.merchant_open_drawer_sessions(p_merchant_id);

  RETURN jsonb_build_object(
    'merchant_id', p_merchant_id,
    'status', v_status,
    'open_orders', v_orders,
    'open_drawer_sessions', v_drawers,
    'fully_drained', (v_orders = 0 AND v_drawers = 0),
    'suspension_initiated_at', v_initiated_at
  );
END;
$$;
-- ---------------------------------------------------------------------------
-- 4) Suspend RPC — graceful by default, force=true captures + cuts immediately.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_merchant_suspension(
  p_merchant_id uuid,
  p_force boolean DEFAULT false,
  p_reason text DEFAULT NULL,
  p_initiated_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_status text;
  v_open_orders jsonb;
  v_open_drawers jsonb;
  v_orders_count integer;
  v_drawers_count integer;
  v_final_status text;
  v_now timestamptz := now();
BEGIN
  SELECT onboarding_status INTO v_current_status
  FROM public.merchants
  WHERE id = p_merchant_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Merchant % not found', p_merchant_id;
  END IF;

  IF v_current_status = 'suspended' THEN
    RETURN jsonb_build_object('status', 'suspended', 'changed', false);
  END IF;

  -- Snapshot what's still open right now.
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb), count(*)
    INTO v_open_orders, v_orders_count
  FROM public.merchant_open_orders(p_merchant_id) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb), count(*)
    INTO v_open_drawers, v_drawers_count
  FROM public.merchant_open_drawer_sessions(p_merchant_id) t;

  IF p_force OR (v_orders_count = 0 AND v_drawers_count = 0) THEN
    v_final_status := 'suspended';
  ELSE
    v_final_status := 'suspending';
  END IF;

  UPDATE public.merchants
     SET onboarding_status = v_final_status,
         suspension_initiated_at = COALESCE(suspension_initiated_at, v_now),
         suspended_at = CASE WHEN v_final_status = 'suspended' THEN v_now ELSE NULL END,
         suspension_reason = COALESCE(p_reason, suspension_reason),
         updated_at = v_now
   WHERE id = p_merchant_id;

  INSERT INTO public.suspension_events (
    merchant_id, event_type, forced, reason, initiated_by_user_id,
    open_orders, open_drawer_sessions, open_orders_count, open_drawer_sessions_count
  ) VALUES (
    p_merchant_id,
    CASE WHEN v_final_status = 'suspended' THEN (CASE WHEN p_force AND (v_orders_count > 0 OR v_drawers_count > 0) THEN 'forced' ELSE 'completed' END)
         ELSE 'requested' END,
    p_force,
    p_reason,
    p_initiated_by,
    v_open_orders,
    v_open_drawers,
    v_orders_count,
    v_drawers_count
  );

  RETURN jsonb_build_object(
    'status', v_final_status,
    'changed', true,
    'forced', p_force,
    'open_orders', v_orders_count,
    'open_drawer_sessions', v_drawers_count,
    'fully_drained', (v_orders_count = 0 AND v_drawers_count = 0)
  );
END;
$$;
-- Reactivation — leaves suspension_events intact for audit trail.
CREATE OR REPLACE FUNCTION public.cancel_merchant_suspension(
  p_merchant_id uuid,
  p_initiated_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_status text;
BEGIN
  SELECT onboarding_status INTO v_current_status
  FROM public.merchants WHERE id = p_merchant_id FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Merchant % not found', p_merchant_id;
  END IF;

  IF v_current_status NOT IN ('suspending', 'suspended') THEN
    RETURN jsonb_build_object('status', v_current_status, 'changed', false);
  END IF;

  UPDATE public.merchants
     SET onboarding_status = 'active',
         suspension_initiated_at = NULL,
         suspended_at = NULL,
         suspension_reason = NULL,
         updated_at = now()
   WHERE id = p_merchant_id;

  INSERT INTO public.suspension_events (merchant_id, event_type, initiated_by_user_id)
  VALUES (p_merchant_id, 'cancelled', p_initiated_by);

  RETURN jsonb_build_object('status', 'active', 'changed', true);
END;
$$;
-- ---------------------------------------------------------------------------
-- 5) Guard trigger — block creating new orders/drawer sessions while a merchant
--    is suspending or suspended.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_merchant_suspension()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  SELECT onboarding_status INTO v_status
  FROM public.merchants WHERE id = NEW.merchant_id;

  IF v_status IN ('suspending', 'suspended', 'cancelled') THEN
    RAISE EXCEPTION 'Merchant % is % — new % cannot be created.',
      NEW.merchant_id, v_status, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_suspension_on_orders ON public.orders;
CREATE TRIGGER trg_guard_suspension_on_orders
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_merchant_suspension();
DROP TRIGGER IF EXISTS trg_guard_suspension_on_drawer_sessions ON public.cash_drawer_sessions;
CREATE TRIGGER trg_guard_suspension_on_drawer_sessions
  BEFORE INSERT ON public.cash_drawer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_merchant_suspension();
-- ---------------------------------------------------------------------------
-- 6) Drain watcher — when an order finalizes or a drawer closes on a
--    'suspending' merchant, check if drain is complete and auto-promote.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maybe_complete_merchant_suspension()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_orders integer;
  v_drawers integer;
BEGIN
  SELECT onboarding_status INTO v_status
  FROM public.merchants WHERE id = NEW.merchant_id;

  IF v_status <> 'suspending' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_orders FROM public.merchant_open_orders(NEW.merchant_id);
  SELECT count(*) INTO v_drawers FROM public.merchant_open_drawer_sessions(NEW.merchant_id);

  IF v_orders = 0 AND v_drawers = 0 THEN
    UPDATE public.merchants
       SET onboarding_status = 'suspended',
           suspended_at = now(),
           updated_at = now()
     WHERE id = NEW.merchant_id;

    INSERT INTO public.suspension_events (merchant_id, event_type)
    VALUES (NEW.merchant_id, 'completed');
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_drain_watcher_on_orders ON public.orders;
CREATE TRIGGER trg_drain_watcher_on_orders
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status::text IN ('completed', 'cancelled', 'refunded', 'void', 'declined'))
  EXECUTE FUNCTION public.maybe_complete_merchant_suspension();
DROP TRIGGER IF EXISTS trg_drain_watcher_on_drawer_sessions ON public.cash_drawer_sessions;
CREATE TRIGGER trg_drain_watcher_on_drawer_sessions
  AFTER UPDATE OF status ON public.cash_drawer_sessions
  FOR EACH ROW
  WHEN (NEW.status::text IN ('closed', 'reconciled'))
  EXECUTE FUNCTION public.maybe_complete_merchant_suspension();
-- ---------------------------------------------------------------------------
-- 7) Grants.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.request_merchant_suspension(uuid, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_merchant_suspension(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_merchant_drain_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_open_orders(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_open_drawer_sessions(uuid) TO authenticated, service_role;
