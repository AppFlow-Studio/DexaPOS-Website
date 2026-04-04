-- ============================================================================
-- Migration 042: Guest System
-- Phone verification, saved addresses, session tokens for online ordering
-- ============================================================================

BEGIN;

-- ============================================================================
-- TABLE 1: phone_verifications
-- Short-lived OTP codes for storefront phone verification via Twilio.
-- ============================================================================

CREATE TABLE public.phone_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text NOT NULL,
  code            text NOT NULL,
  merchant_id     uuid NOT NULL REFERENCES public.merchants(id),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- TABLE 2: customer_saved_addresses
-- Stored delivery addresses for returning customers.
-- ============================================================================

CREATE TABLE public.customer_saved_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT 'Home',
  address_line1   text NOT NULL,
  address_line2   text,
  city            text NOT NULL,
  state           text NOT NULL,
  postal_code     text NOT NULL,
  delivery_notes  text,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- ALTER: online_order_sessions – add session_token for cookie-based lookup
-- ============================================================================

ALTER TABLE public.online_order_sessions
  ADD COLUMN IF NOT EXISTS session_token text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_customer_saved_addresses_updated_at
  BEFORE UPDATE ON public.customer_saved_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_phone_verifications_lookup
  ON public.phone_verifications (phone, merchant_id)
  WHERE verified_at IS NULL;

CREATE INDEX idx_phone_verifications_expires
  ON public.phone_verifications (expires_at);

CREATE INDEX idx_customer_saved_addresses_customer
  ON public.customer_saved_addresses (customer_id);

CREATE INDEX idx_online_order_sessions_token
  ON public.online_order_sessions (session_token)
  WHERE session_token IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to phone verifications"
  ON public.phone_verifications FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to saved addresses"
  ON public.customer_saved_addresses FOR ALL
  USING (true)
  WITH CHECK (true);

COMMIT;
