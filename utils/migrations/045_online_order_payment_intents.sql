-- ============================================================================
-- Migration 045: Online Order Payment Intents
-- Tracks payment lifecycle for online store orders processed via iPOS Pays.
-- ============================================================================

BEGIN;

CREATE TABLE public.online_order_payment_intents (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_config_id           uuid NOT NULL REFERENCES public.online_store_config(id),
  session_id                uuid NOT NULL REFERENCES public.online_order_sessions(id),
  location_id               uuid NOT NULL REFERENCES public.locations(id),
  merchant_id               uuid NOT NULL REFERENCES public.merchants(id),

  -- iPOS Pays reference
  transaction_reference_id  text NOT NULL UNIQUE,
  ipospays_tpn              text NOT NULL,

  -- Frozen order data (validated snapshot for RPC call after payment)
  order_data                jsonb NOT NULL,
  amount_cents              integer NOT NULL,
  subtotal_cents            integer NOT NULL,
  tax_cents                 integer NOT NULL,
  tip_cents                 integer NOT NULL DEFAULT 0,
  delivery_fee_cents        integer NOT NULL DEFAULT 0,

  -- Payment state
  status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','paid','failed','expired','refunded')),
  payment_method            text CHECK (payment_method IN ('hpp','card_token')),
  payment_response          jsonb,
  card_token                text,
  card_last4                text,
  card_type                 text,

  -- Order link (populated after order creation)
  order_id                  uuid REFERENCES public.orders(id),

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

-- Indexes
CREATE INDEX idx_payment_intents_session_id ON public.online_order_payment_intents(session_id);
CREATE INDEX idx_payment_intents_store_config_id ON public.online_order_payment_intents(store_config_id);
CREATE INDEX idx_payment_intents_status ON public.online_order_payment_intents(status) WHERE status = 'pending';
CREATE INDEX idx_payment_intents_expires_at ON public.online_order_payment_intents(expires_at) WHERE status = 'pending';
CREATE INDEX idx_payment_intents_order_id ON public.online_order_payment_intents(order_id) WHERE order_id IS NOT NULL;

-- Trigger
CREATE TRIGGER update_online_order_payment_intents_updated_at
  BEFORE UPDATE ON public.online_order_payment_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.online_order_payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to payment intents"
  ON public.online_order_payment_intents FOR ALL
  USING (true)
  WITH CHECK (true);

COMMIT;
