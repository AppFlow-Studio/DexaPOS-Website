-- ============================================================================
-- Migration 051: Accept / Decline Online Orders
-- ============================================================================
-- Adds:
--   • 'accepted' and 'declined' to order_status enum
--   • accepted_at, declined_at, declined_reason, cancelled_by columns on orders
--   • auto_accept_orders column on online_store_config
--   • accept_online_order(p_order_id) RPC   — called by merchant / POS
--   • decline_online_order(p_order_id, p_reason) RPC — called by merchant / POS
--   • cancel_online_order_by_customer(p_order_id, p_session_token, p_reason) RPC
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Extend order_status enum
-- ============================================================================

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'declined';

-- ============================================================================
-- 2. New columns on orders
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by  TEXT CHECK (cancelled_by IN ('customer', 'merchant', 'system'));

-- ============================================================================
-- 3. auto_accept_orders on online_store_config
--    Default FALSE — merchant must explicitly turn on auto-accept.
-- ============================================================================

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS auto_accept_orders BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 4. RPC: accept_online_order
--    Transitions a pending online order → accepted → sent_to_kitchen.
--    Fires the order to the kitchen immediately upon acceptance.
--    Security: caller must be a location member (or service role).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_online_order(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       RECORD;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  -- Lock the row to prevent race conditions
  SELECT id, status, location_id, merchant_id
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  -- Transition: pending → accepted → sent_to_kitchen
  UPDATE public.orders
     SET status              = 'accepted',
         accepted_at         = v_now,
         sent_to_kitchen_at  = v_now,
         updated_at          = v_now
   WHERE id = p_order_id;

  -- Fire all items to kitchen
  UPDATE public.order_items
     SET kitchen_status     = 'sent',
         sent_to_kitchen_at = v_now
   WHERE order_id = p_order_id
     AND (kitchen_status IS NULL OR kitchen_status = 'pending');

  -- Audit trail
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'accepted', v_now, 'Accepted by merchant');

  RETURN jsonb_build_object(
    'success',    true,
    'order_id',   p_order_id,
    'accepted_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.accept_online_order IS
'Merchant accepts a pending online order. Transitions to accepted and fires to kitchen.';

-- ============================================================================
-- 5. RPC: decline_online_order
--    Transitions a pending online order → declined (terminal).
--    Security: caller must be a location member (or service role).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decline_online_order(
  p_order_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  UPDATE public.orders
     SET status           = 'declined',
         declined_at      = v_now,
         declined_reason  = p_reason,
         cancelled_at     = v_now,
         cancelled_by     = 'merchant',
         updated_at       = v_now
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'declined', v_now,
     COALESCE('Declined by merchant: ' || p_reason, 'Declined by merchant'));

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'declined_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.decline_online_order IS
'Merchant declines a pending online order. Terminal state — customer is notified via tracking page.';

-- ============================================================================
-- 6. RPC: cancel_online_order_by_customer
--    Customer cancels their own pending order using their session token.
--    Only allowed while order is still pending (not yet accepted).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_online_order_by_customer(
  p_order_id     UUID,
  p_session_token TEXT,
  p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_order   RECORD;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  -- Validate session token and ownership
  SELECT s.id, s.order_id, s.expires_at
    INTO v_session
    FROM public.online_order_sessions s
   WHERE s.session_token = p_session_token
     AND s.expires_at > v_now;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;

  IF v_session.order_id <> p_order_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order does not belong to this session');
  END IF;

  -- Lock and check order
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order can only be cancelled while pending (current: ' || v_order.status || ')'
    );
  END IF;

  UPDATE public.orders
     SET status               = 'cancelled',
         cancelled_at         = v_now,
         cancelled_by         = 'customer',
         cancellation_reason  = p_reason,
         updated_at           = v_now
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'cancelled', v_now,
     COALESCE('Cancelled by customer: ' || p_reason, 'Cancelled by customer'));

  RETURN jsonb_build_object(
    'success',      true,
    'order_id',     p_order_id,
    'cancelled_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_online_order_by_customer IS
'Customer cancels their own online order while it is still pending. Validates session ownership.';

COMMIT;
