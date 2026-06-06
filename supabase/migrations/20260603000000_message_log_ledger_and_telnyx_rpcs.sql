-- Part C — Telnyx message ledger (inbound/outbound) + single-writer RPCs.
--
-- Net-new schema. There is currently NO persistent record of any message sent or
-- received: outbound state is just counters (waitlist.notification_failures,
-- marketing_campaigns.total_*) and inbound is captured nowhere. Without a ledger,
-- STOP/START opt-out can't be honored reliably, delivery can't be traced, and there
-- is no audit trail for "did this customer get the text."
--
-- Telnyx is platform-shared here (single TELNYX_FROM_NUMBER / messaging profile, no
-- per-merchant Telnyx config), so:
--   * outbound rows carry merchant_id set at SEND time (log_outbound_message),
--   * inbound rows resolve customer + merchant by the sender's phone number.
--
-- Two writers, both SECURITY DEFINER + locked to service_role:
--   * log_outbound_message  — called by the Node send paths at send time.
--   * record_telnyx_message — called by the telnyx-webhook edge function; the webhook
--     authenticates via Ed25519 signature, so this RPC is service-role-invoked, NOT
--     JWT-scoped. It is idempotent on telnyx_message_id (Telnyx redelivers events).

-- ============================================================================
-- TABLE: message_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.message_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id          uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  -- Linkage back to a marketing send so finalized/delivery webhooks can roll up
  -- into marketing_recipients / marketing_campaigns counters.
  campaign_id          uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  recipient_id         uuid REFERENCES public.marketing_recipients(id) ON DELETE SET NULL,
  -- Telnyx message id. Unique => idempotency key for redelivered webhook events.
  -- Nullable: a send that fails before Telnyx returns an id still gets logged.
  telnyx_message_id    text,
  direction            text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel              text NOT NULL DEFAULT 'sms',
  from_number          text,
  to_number            text,
  body                 text,
  status               text,
  error_code           text,
  cost                 numeric(12,4),
  messaging_profile_id text,
  occurred_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb
);

-- Idempotency: at most one row per Telnyx message id (NULLs allowed for failed sends).
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_log_telnyx_message_id
  ON public.message_log (telnyx_message_id)
  WHERE telnyx_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_log_merchant_to
  ON public.message_log (merchant_id, to_number);
CREATE INDEX IF NOT EXISTS idx_message_log_customer
  ON public.message_log (customer_id);
CREATE INDEX IF NOT EXISTS idx_message_log_recipient
  ON public.message_log (recipient_id);

-- updated_at maintenance (offline-sync friendly per repo convention).
DROP TRIGGER IF EXISTS trg_message_log_updated_at ON public.message_log;
CREATE TRIGGER trg_message_log_updated_at
  BEFORE UPDATE ON public.message_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: merchants may READ their own ledger; all writes go through the SECURITY
-- DEFINER RPCs / service_role only. Mirrors the waitlist_sms_rate_limit lock-down.
ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.message_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.message_log FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON TABLE public.message_log TO authenticated;
GRANT  ALL    ON TABLE public.message_log TO service_role;

DROP POLICY IF EXISTS message_log_merchant_read ON public.message_log;
CREATE POLICY message_log_merchant_read ON public.message_log
  FOR SELECT TO authenticated
  USING (merchant_id IS NOT NULL AND public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS message_log_admin_read ON public.message_log;
CREATE POLICY message_log_admin_read ON public.message_log
  FOR SELECT TO authenticated
  USING (public.is_dexapos_admin());

COMMENT ON TABLE public.message_log IS
  'Telnyx SMS message ledger (inbound + outbound). Written only by log_outbound_message (send time) and record_telnyx_message (webhook). Merchants read their own rows via RLS.';

-- ============================================================================
-- HELPER: last-10-digits phone match (immutable so it can be inlined safely)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.phone_last10(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = 'pg_temp'
AS $$
  SELECT right(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), 10);
$$;

-- ============================================================================
-- RPC: log_outbound_message — send-time writer
-- Idempotent on telnyx_message_id. Used by the Node send paths.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_outbound_message(
  p_merchant_id        uuid,
  p_to_number          text,
  p_body               text,
  p_telnyx_message_id  text    DEFAULT NULL,
  p_channel            text    DEFAULT 'sms',
  p_customer_id        uuid    DEFAULT NULL,
  p_campaign_id        uuid    DEFAULT NULL,
  p_recipient_id       uuid    DEFAULT NULL,
  p_status             text    DEFAULT 'sent',
  p_error_code         text    DEFAULT NULL,
  p_from_number        text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- When Telnyx returned no id (send failed before dispatch), just insert a
  -- standalone failed/queued row — multiple NULL telnyx ids are allowed.
  IF p_telnyx_message_id IS NULL THEN
    INSERT INTO message_log(
      merchant_id, customer_id, campaign_id, recipient_id, telnyx_message_id,
      direction, channel, from_number, to_number, body, status, error_code, occurred_at
    ) VALUES (
      p_merchant_id, p_customer_id, p_campaign_id, p_recipient_id, NULL,
      'outbound', p_channel, p_from_number, p_to_number, p_body, p_status, p_error_code, now()
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO message_log(
    merchant_id, customer_id, campaign_id, recipient_id, telnyx_message_id,
    direction, channel, from_number, to_number, body, status, error_code, occurred_at
  ) VALUES (
    p_merchant_id, p_customer_id, p_campaign_id, p_recipient_id, p_telnyx_message_id,
    'outbound', p_channel, p_from_number, p_to_number, p_body, p_status, p_error_code, now()
  )
  ON CONFLICT (telnyx_message_id) WHERE telnyx_message_id IS NOT NULL
  DO UPDATE SET
    -- A webhook may have raced ahead of this send-time write; only backfill the
    -- linkage/identity columns the webhook can't know, never regress status.
    merchant_id  = COALESCE(message_log.merchant_id, excluded.merchant_id),
    customer_id  = COALESCE(message_log.customer_id, excluded.customer_id),
    campaign_id  = COALESCE(message_log.campaign_id, excluded.campaign_id),
    recipient_id = COALESCE(message_log.recipient_id, excluded.recipient_id),
    body         = COALESCE(message_log.body, excluded.body),
    updated_at   = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_outbound_message(uuid,text,text,text,text,uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_outbound_message(uuid,text,text,text,text,uuid,uuid,uuid,text,text,text) TO service_role;
COMMENT ON FUNCTION public.log_outbound_message(uuid,text,text,text,text,uuid,uuid,uuid,text,text,text) IS
  'Records an outbound message in message_log at send time. Idempotent on telnyx_message_id. Service-role only.';

-- ============================================================================
-- RPC: record_telnyx_message — webhook writer (single source of truth)
-- Parses a Telnyx webhook payload, idempotently upserts message_log on
-- telnyx_message_id, rolls outbound delivery status up into marketing_recipients,
-- and applies inbound STOP/START opt-out. Service-role invoked (webhook verifies
-- the Ed25519 signature itself), so NOT JWT-scoped.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_telnyx_message(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_data        jsonb := p_payload->'data';
  v_p           jsonb := COALESCE(p_payload->'data'->'payload', p_payload->'payload');
  v_event_type  text  := v_data->>'event_type';
  v_msg_id      text  := v_p->>'id';
  v_direction   text  := v_p->>'direction';
  v_from        text  := v_p->'from'->>'phone_number';
  v_to          text  := COALESCE(v_p->'to'->0->>'phone_number', v_p->>'to');
  v_to_status   text  := v_p->'to'->0->>'status';
  v_body        text  := v_p->>'text';
  v_profile     text  := v_p->>'messaging_profile_id';
  v_cost        numeric(12,4) := NULLIF(v_p->'cost'->>'amount', '')::numeric;
  v_error_code  text  := v_p->'errors'->0->>'code';
  v_occurred_at timestamptz := COALESCE(
                   NULLIF(v_p->>'completed_at','')::timestamptz,
                   NULLIF(v_data->>'occurred_at','')::timestamptz,
                   now());
  v_status      text;
  v_customer_id uuid;
  v_merchant_id uuid;
  v_log_id      uuid;
  v_recipient_id uuid;
  v_cmd         text;
BEGIN
  IF v_msg_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_message_id');
  END IF;

  IF v_direction IS NULL THEN
    v_direction := CASE WHEN v_event_type = 'message.received' THEN 'inbound' ELSE 'outbound' END;
  END IF;

  -- Map Telnyx event -> our status vocabulary.
  v_status := CASE
    WHEN v_event_type = 'message.received'  THEN 'received'
    WHEN v_event_type = 'message.sent'      THEN 'sent'
    WHEN v_event_type = 'message.finalized' THEN
      CASE
        WHEN lower(COALESCE(v_to_status,'')) = 'delivered' THEN 'delivered'
        WHEN lower(COALESCE(v_to_status,'')) IN ('delivery_failed','sending_failed','failed') THEN 'failed'
        ELSE COALESCE(v_to_status, 'finalized')
      END
    ELSE COALESCE(v_event_type, 'unknown')
  END;

  -- Inbound: resolve customer + merchant by the sender's phone (most recent match).
  IF v_direction = 'inbound' THEN
    SELECT c.id, c.merchant_id INTO v_customer_id, v_merchant_id
    FROM customers c
    WHERE c.phone IS NOT NULL
      AND public.phone_last10(c.phone) = public.phone_last10(v_from)
      AND public.phone_last10(v_from) <> ''
    ORDER BY c.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Idempotent upsert keyed on telnyx_message_id. An outbound row usually already
  -- exists from log_outbound_message; the webhook advances its status/cost/error.
  INSERT INTO message_log(
    merchant_id, customer_id, telnyx_message_id, direction, channel,
    from_number, to_number, body, status, error_code, cost,
    messaging_profile_id, occurred_at, raw
  ) VALUES (
    v_merchant_id, v_customer_id, v_msg_id, v_direction, 'sms',
    v_from, v_to, v_body, v_status, v_error_code, v_cost,
    v_profile, v_occurred_at, p_payload
  )
  ON CONFLICT (telnyx_message_id) WHERE telnyx_message_id IS NOT NULL
  DO UPDATE SET
    status               = excluded.status,
    error_code           = COALESCE(excluded.error_code, message_log.error_code),
    cost                 = COALESCE(excluded.cost, message_log.cost),
    body                 = COALESCE(message_log.body, excluded.body),
    to_number            = COALESCE(message_log.to_number, excluded.to_number),
    from_number          = COALESCE(message_log.from_number, excluded.from_number),
    messaging_profile_id = COALESCE(message_log.messaging_profile_id, excluded.messaging_profile_id),
    occurred_at          = excluded.occurred_at,
    raw                  = excluded.raw,
    updated_at           = now()
  RETURNING id, recipient_id INTO v_log_id, v_recipient_id;

  -- Roll up outbound delivery status into the marketing recipient (Part B 8/16 gap).
  IF v_recipient_id IS NOT NULL AND v_status IN ('sent','delivered','failed') THEN
    BEGIN
      PERFORM record_marketing_result(v_recipient_id, v_status, v_msg_id, v_error_code);
    EXCEPTION WHEN OTHERS THEN
      -- Non-fatal: the ledger row is the source of truth; never fail the webhook ack.
      NULL;
    END;
  END IF;

  -- Inbound STOP / START opt-out flow (applies to every customer row sharing the
  -- sender's number, so the human is fully (un)subscribed regardless of merchant).
  IF v_direction = 'inbound' AND v_body IS NOT NULL AND public.phone_last10(v_from) <> '' THEN
    v_cmd := upper(btrim(v_body));
    IF v_cmd IN ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') THEN
      UPDATE customers SET marketing_unsubscribed_at = now(), sms_opt_in = false
      WHERE phone IS NOT NULL AND public.phone_last10(phone) = public.phone_last10(v_from);
    ELSIF v_cmd IN ('START','UNSTOP','YES') THEN
      UPDATE customers SET marketing_unsubscribed_at = NULL, sms_opt_in = true, sms_opt_in_at = now()
      WHERE phone IS NOT NULL AND public.phone_last10(phone) = public.phone_last10(v_from);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'id', v_log_id, 'status', v_status, 'direction', v_direction
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_telnyx_message(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_telnyx_message(jsonb) TO service_role;
COMMENT ON FUNCTION public.record_telnyx_message(jsonb) IS
  'Single writer for the telnyx-webhook edge function. Idempotent on telnyx_message_id; rolls outbound delivery into marketing_recipients; applies inbound STOP/START. Service-role only.';
