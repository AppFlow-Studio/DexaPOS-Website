-- [OrderOut Direct] Delivery quotes + dispatch outbox — schema half.
--
-- PROBLEM
--   Delivery is switched off on every storefront (app/sites/actions.ts hard-codes
--   deliveryEnabled: false) because there is no fulfilment path: merchants have
--   no drivers. OrderOut Direct supplies couriers on demand. This migration adds
--   the two tables and the one store setting that the quote function, the
--   dispatch worker and the storefront read. The functions/triggers/cron that
--   drive rows through the outbox are in 20260920121000_orderout_direct_delivery_outbox.sql.
--
-- FULFILMENT SETTING
--   online_store_config.delivery_fulfillment: 'self' (default; delivery stays
--   hidden exactly as today) or 'orderout_direct'. A store on 'self' never
--   makes an OrderOut call. The storefront additionally requires an active
--   orderout_restaurants row and the `orderout` entitlement before it shows
--   Delivery, so a lapsed entitlement hides the option without a DB change.
--
-- MONEY AND IDS
--   OrderOut prices arrive as integer cents with unit="cent" (verified live
--   2026-09-20). Stored normalised as NUMERIC(12,2) dollars; the raw integer
--   and unit are kept beside it. OrderOut ids are int64s close to 2^53 and are
--   stored as text — never do arithmetic on them.
--
-- RLS
--   Both tables: RLS on, zero policies. Service-role only, the project
--   convention for outbox tables (see orderout_status_relay_queue). The
--   storefront tracking page reads through a service-role server action and
--   live updates travel by realtime broadcast, so neither table is ever
--   exposed to the browser or added to the realtime publication.

-- ============================================================================
-- STORE SETTING
-- ============================================================================

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS delivery_fulfillment text NOT NULL DEFAULT 'self';

ALTER TABLE public.online_store_config
  DROP CONSTRAINT IF EXISTS online_store_config_delivery_fulfillment_check;
ALTER TABLE public.online_store_config
  ADD CONSTRAINT online_store_config_delivery_fulfillment_check
  CHECK (delivery_fulfillment IN ('self', 'orderout_direct'));

COMMENT ON COLUMN public.online_store_config.delivery_fulfillment IS
  'Who delivers website orders. self = merchant''s own arrangement (delivery hidden in v1); orderout_direct = courier booked through OrderOut Direct at the live quoted price.';

-- Channel store id registered with OrderOut via connect_channel. Nullable until
-- Step 0 of the Direct ticket confirms whether it differs from pos_uuid.
ALTER TABLE public.orderout_restaurants
  ADD COLUMN IF NOT EXISTS channel_store_id text,
  ADD COLUMN IF NOT EXISTS channel_connected_at timestamptz;

-- ============================================================================
-- QUOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orderout_delivery_quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  store_config_id  uuid NOT NULL REFERENCES public.online_store_config(id) ON DELETE CASCADE,
  session_id       uuid REFERENCES public.online_order_sessions(id) ON DELETE SET NULL,
  -- One quote batch per (session, normalised dropoff). Every provider quote in
  -- the batch shares this key; exactly one row per batch is is_selected.
  request_key      text NOT NULL,
  oo_quote_id      text NOT NULL,
  provider         text NOT NULL,
  price            numeric(12,2) NOT NULL,
  raw_price        numeric(14,4) NOT NULL,
  raw_unit         text,
  pickup_mins      integer,
  delivery_mins    integer,
  dropoff          jsonb NOT NULL,
  is_selected      boolean NOT NULL DEFAULT false,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  raw_response     jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orderout_delivery_quotes IS
  '[OrderOut Direct] Every courier quote returned for a checkout address. The cheapest is is_selected; create-online-order charges price of the selected row and never a client-supplied fee.';

CREATE INDEX IF NOT EXISTS idx_oo_quotes_session
  ON public.orderout_delivery_quotes (session_id, fetched_at DESC);

-- Per-store rate-limit window in orderout-delivery-quote.
CREATE INDEX IF NOT EXISTS idx_oo_quotes_store_selected
  ON public.orderout_delivery_quotes (store_config_id, fetched_at DESC) WHERE is_selected;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oo_quotes_selected_per_batch
  ON public.orderout_delivery_quotes (request_key) WHERE is_selected;

ALTER TABLE public.orderout_delivery_quotes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_oo_quotes_updated_at ON public.orderout_delivery_quotes;
CREATE TRIGGER trg_oo_quotes_updated_at
  BEFORE UPDATE ON public.orderout_delivery_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- DISPATCHES (outbox)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orderout_delivery_dispatches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE is the idempotency guarantee: one order can never book two couriers.
  order_id              uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  online_order_id       uuid REFERENCES public.online_orders(id) ON DELETE SET NULL,
  location_id           uuid NOT NULL REFERENCES public.locations(id),
  merchant_id           uuid NOT NULL REFERENCES public.merchants(id),
  quote_id              uuid NOT NULL REFERENCES public.orderout_delivery_quotes(id),
  -- Fee the customer's card was charged. orders has no delivery-fee column
  -- (process_online_order folds p_delivery_charge into the total), so this is
  -- the only record of it.
  charged_fee           numeric(12,2) NOT NULL,
  driver_tip            numeric(12,2) NOT NULL DEFAULT 0,
  -- Set when the quote expired before accept and the worker re-quoted.
  -- new_price - charged_fee; the customer is never re-charged.
  requote_delta         numeric(12,2),
  -- What we send as source.orderNumber (= orders.order_number). The echo guard
  -- in orderout-orders-webhook matches on it.
  oo_order_number       text NOT NULL,
  -- source.externalReferenceId on the echo — OrderOut's order id.
  oo_channel_order_id   text,
  -- The id /v2/delivery/orders/{id}/cancel wants. May equal oo_channel_order_id.
  oo_delivery_order_id  text,
  tracker_id            text,
  fd_id                 text,
  -- push_unconfirmed: the push call ended ambiguously (timeout / 5xx / network)
  -- after possibly reaching OrderOut. It is never retried automatically —
  -- only the echo (link_orderout_delivery_echo) or a human resolves it.
  state                 text NOT NULL DEFAULT 'awaiting_accept'
    CHECK (state IN ('awaiting_accept', 'pending', 'push_unconfirmed', 'dispatched', 'failed', 'cancel_pending', 'cancelled')),
  delivery_status       text,
  delivery_status_rank  integer NOT NULL DEFAULT 0,
  courier_name          text,
  courier_phone         text,
  tracking_url          text,
  eta                   timestamptz,
  attempts              integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 6,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  -- Lease held by the worker that claimed the row. Separate from the retry
  -- backoff so a slow batch can never be re-claimed (and re-pushed) by the
  -- next drain while the first push is still in flight.
  claimed_until         timestamptz,
  last_error            text,
  last_status_code      integer,
  request_payload       jsonb,
  response_payload      jsonb,
  echo_received_at      timestamptz,
  dispatched_at         timestamptz,
  cancel_reason         text,
  cancelled_at          timestamptz,
  cancel_rejected_at    timestamptz,
  failed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orderout_delivery_dispatches IS
  '[OrderOut Direct] Outbox: one row per website delivery order. Triggers on orders move it awaiting_accept -> pending (on accept) and -> cancel_pending (on cancel); the orderout-delivery-dispatch worker does the HTTP. No network I/O in triggers.';

CREATE INDEX IF NOT EXISTS idx_oo_dispatch_due
  ON public.orderout_delivery_dispatches (next_attempt_at)
  WHERE state IN ('pending', 'cancel_pending');

CREATE INDEX IF NOT EXISTS idx_oo_dispatch_order_number
  ON public.orderout_delivery_dispatches (oo_order_number);

-- Status intake looks dispatches up by whichever OrderOut id the event carries.
CREATE INDEX IF NOT EXISTS idx_oo_dispatch_delivery_order_id
  ON public.orderout_delivery_dispatches (oo_delivery_order_id) WHERE oo_delivery_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oo_dispatch_channel_order_id
  ON public.orderout_delivery_dispatches (oo_channel_order_id) WHERE oo_channel_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oo_dispatch_tracker_id
  ON public.orderout_delivery_dispatches (tracker_id) WHERE tracker_id IS NOT NULL;

ALTER TABLE public.orderout_delivery_dispatches ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_oo_dispatch_updated_at ON public.orderout_delivery_dispatches;
CREATE TRIGGER trg_oo_dispatch_updated_at
  BEFORE UPDATE ON public.orderout_delivery_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
