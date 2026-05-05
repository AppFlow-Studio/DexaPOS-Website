-- Lane D4: Waitlist SMS rate-limit infrastructure.
--
-- The notify-waitlist-guest edge function is a Twilio/Telnyx cost vector:
-- before this migration it accepted caller-controlled phone + message and
-- blasted SMS unbounded. This adds an atomic rate-limit table + claim RPC
-- so the edge function can cap to N SMS per merchant per hour.
--
-- Concurrency: pg_advisory_xact_lock keyed on merchant_id serializes
-- concurrent claims so a burst of parallel requests cannot exceed the cap.

CREATE TABLE IF NOT EXISTS public.waitlist_sms_rate_limit (
  id          bigserial PRIMARY KEY,
  merchant_id uuid        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_sms_rate_limit_merchant_time
  ON public.waitlist_sms_rate_limit (merchant_id, sent_at DESC);

-- Lock down — only SECURITY DEFINER RPCs touch this table.
ALTER TABLE public.waitlist_sms_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.waitlist_sms_rate_limit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.waitlist_sms_rate_limit FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE public.waitlist_sms_rate_limit TO service_role;

-- ============================================================================
-- claim_waitlist_sms_slot — atomic rate-limit gate
-- Returns jsonb { allowed: bool, count: int, limit: int, reason?: text }
-- Inserts a row when allowed; caller does NOT need to insert.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_waitlist_sms_slot(
  p_merchant_id  uuid,
  p_max_per_hour int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count int;
BEGIN
  IF p_merchant_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'missing_merchant_id'
    );
  END IF;

  -- Serialize concurrent claims for the same merchant so a burst cannot
  -- exceed the cap. The lock is released at txn commit/rollback.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('waitlist_sms_rate_limit:' || p_merchant_id::text, 0)
  );

  SELECT COUNT(*)
    INTO v_count
    FROM public.waitlist_sms_rate_limit
   WHERE merchant_id = p_merchant_id
     AND sent_at     > now() - interval '1 hour';

  IF v_count >= p_max_per_hour THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count',   v_count,
      'limit',   p_max_per_hour,
      'reason',  'rate_limit_exceeded'
    );
  END IF;

  INSERT INTO public.waitlist_sms_rate_limit (merchant_id)
    VALUES (p_merchant_id);

  RETURN jsonb_build_object(
    'allowed', true,
    'count',   v_count + 1,
    'limit',   p_max_per_hour
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_waitlist_sms_slot(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_sms_slot(uuid, int) TO service_role;

COMMENT ON FUNCTION public.claim_waitlist_sms_slot(uuid, int) IS
  'Atomically claims a waitlist SMS rate-limit slot for a merchant. Returns { allowed, count, limit }. Service-role only — invoked by the notify-waitlist-guest edge function.';
