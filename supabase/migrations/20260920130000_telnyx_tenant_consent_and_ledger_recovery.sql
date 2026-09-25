-- Follow-up to the already-applied 20260918120000 migration. UNAPPLIED.
-- Tenant-safe inbound/consent, monotonic marketing state and ledger-only repair.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sms_consent_event_at timestamptz;
COMMENT ON COLUMN public.customers.sms_consent_event_at IS 'Latest Telnyx consent event time; prevents retry/out-of-order STOP/START changes.';

-- Preserve country codes; only expand local ten-digit US numbers, matching our senders.
CREATE OR REPLACE FUNCTION public.telnyx_phone_key(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = 'pg_temp' AS $$
  SELECT CASE WHEN length(d) = 10 THEN '1' || d ELSE d END
  FROM (SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS d) n;
$$;

CREATE OR REPLACE FUNCTION public.record_marketing_result(
  p_recipient_id         UUID,
  p_status               TEXT,
  p_provider_message_id  TEXT DEFAULT NULL,
  p_error                TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_old_status  TEXT;
  v_campaign_id UUID;
BEGIN
  SELECT status, campaign_id
  INTO v_old_status, v_campaign_id
  FROM marketing_recipients
  WHERE id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient not found: %', p_recipient_id;
  END IF;

  -- Send acceptance can arrive after a finalized callback. Never regress it.
  IF v_old_status IN ('delivered', 'failed', 'unsubscribed') AND p_status = 'sent' THEN RETURN; END IF;

  UPDATE marketing_recipients SET
    status        = p_status,
    sent_at       = CASE WHEN p_status IN ('sent','delivered') AND sent_at IS NULL
                         THEN NOW() ELSE sent_at END,
    delivered_at  = CASE WHEN p_status = 'delivered' AND delivered_at IS NULL
                         THEN NOW() ELSE delivered_at END,
    error_message = COALESCE(p_error, error_message)
  WHERE id = p_recipient_id;

  IF v_old_status IS DISTINCT FROM p_status THEN
    UPDATE marketing_campaigns SET
      total_delivered = total_delivered
        + CASE WHEN p_status     = 'delivered' THEN 1 ELSE 0 END
        - CASE WHEN v_old_status = 'delivered' THEN 1 ELSE 0 END,
      total_bounced = total_bounced
        + CASE WHEN p_status     = 'bounced'   THEN 1 ELSE 0 END
        - CASE WHEN v_old_status = 'bounced'   THEN 1 ELSE 0 END
    WHERE id = v_campaign_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_outbound_message(
  p_merchant_id           uuid,
  p_to_number             text,
  p_body                  text,
  p_telnyx_message_id     text DEFAULT NULL,
  p_channel               text DEFAULT 'sms',
  p_customer_id           uuid DEFAULT NULL,
  p_campaign_id           uuid DEFAULT NULL,
  p_recipient_id          uuid DEFAULT NULL,
  p_status                text DEFAULT 'sent',
  p_error_code            text DEFAULT NULL,
  p_from_number           text DEFAULT NULL,
  p_messaging_profile_id  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'merchant_id_required';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND merchant_id = p_merchant_id
  ) THEN RAISE EXCEPTION 'customer_tenant_mismatch'; END IF;
  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.marketing_campaigns WHERE id = p_campaign_id AND merchant_id = p_merchant_id
  ) THEN RAISE EXCEPTION 'campaign_tenant_mismatch'; END IF;
  IF p_recipient_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.marketing_recipients r JOIN public.marketing_campaigns c ON c.id = r.campaign_id
    WHERE r.id = p_recipient_id AND c.merchant_id = p_merchant_id
      AND (p_customer_id IS NULL OR r.customer_id = p_customer_id)
      AND (p_campaign_id IS NULL OR r.campaign_id = p_campaign_id)
  ) THEN RAISE EXCEPTION 'recipient_tenant_mismatch'; END IF;
  -- Serialize with callbacks before checking existing attribution.
  IF p_telnyx_message_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_telnyx_message_id, 0));
    IF EXISTS (SELECT 1 FROM public.message_log WHERE telnyx_message_id = p_telnyx_message_id
      AND (merchant_id IS DISTINCT FROM p_merchant_id OR direction <> 'outbound')) THEN
      RAISE EXCEPTION 'provider_message_tenant_mismatch';
    END IF;
  END IF;

  -- A provider failure can legitimately have no Telnyx message ID. Keep that
  -- attempt visible as a standalone failed row; NULL IDs do not conflict.
  IF p_telnyx_message_id IS NULL THEN
    INSERT INTO public.message_log(
      merchant_id, customer_id, campaign_id, recipient_id, telnyx_message_id,
      direction, channel, from_number, to_number, body, status, error_code,
      messaging_profile_id, occurred_at
    ) VALUES (
      p_merchant_id, p_customer_id, p_campaign_id, p_recipient_id, NULL,
      'outbound', p_channel, p_from_number, p_to_number, p_body, p_status,
      p_error_code, p_messaging_profile_id, now()
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.message_log(
    merchant_id, customer_id, campaign_id, recipient_id, telnyx_message_id,
    direction, channel, from_number, to_number, body, status, error_code,
    messaging_profile_id, occurred_at
  ) VALUES (
    p_merchant_id, p_customer_id, p_campaign_id, p_recipient_id,
    p_telnyx_message_id, 'outbound', p_channel, p_from_number, p_to_number,
    p_body, p_status, p_error_code, p_messaging_profile_id, now()
  )
  ON CONFLICT (telnyx_message_id) WHERE telnyx_message_id IS NOT NULL
  DO UPDATE SET
    merchant_id          = COALESCE(message_log.merchant_id, excluded.merchant_id),
    customer_id          = COALESCE(message_log.customer_id, excluded.customer_id),
    campaign_id          = COALESCE(message_log.campaign_id, excluded.campaign_id),
    recipient_id         = COALESCE(message_log.recipient_id, excluded.recipient_id),
    body                 = COALESCE(message_log.body, excluded.body),
    from_number          = COALESCE(message_log.from_number, excluded.from_number),
    messaging_profile_id = COALESCE(
      message_log.messaging_profile_id,
      excluded.messaging_profile_id
    ),
    status = CASE
      WHEN message_log.status IN ('delivered', 'failed') THEN message_log.status
      WHEN excluded.status = 'failed' THEN excluded.status
      ELSE COALESCE(message_log.status, excluded.status)
    END,
    error_code = COALESCE(message_log.error_code, excluded.error_code),
    updated_at           = now()
  RETURNING id, status INTO v_id, v_status;
  -- A webhook can win the race before the sender attaches its recipient ID.
  IF p_recipient_id IS NOT NULL AND v_status IN ('sent', 'delivered', 'failed') THEN
    PERFORM public.record_marketing_result(p_recipient_id, v_status, p_telnyx_message_id, p_error_code);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_outbound_message(
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_outbound_message(
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.log_outbound_message(
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text
) IS 'Records an outbound message at send time with tenant, sender, and profile attribution. Service-role only.';

CREATE OR REPLACE FUNCTION public.record_telnyx_message(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_data             jsonb := p_payload->'data';
  v_p                jsonb := COALESCE(p_payload->'data'->'payload', p_payload->'payload');
  v_event_type       text := v_data->>'event_type';
  v_msg_id           text := v_p->>'id';
  v_direction        text := v_p->>'direction';
  v_from             text := v_p->'from'->>'phone_number';
  v_to               text := COALESCE(v_p->'to'->0->>'phone_number', v_p->>'to');
  v_to_status        text := v_p->'to'->0->>'status';
  v_body             text := v_p->>'text';
  v_profile          text := v_p->>'messaging_profile_id';
  v_cost             numeric(12,4) := NULLIF(v_p->'cost'->>'amount', '')::numeric;
  v_error_code       text := v_p->'errors'->0->>'code';
  v_occurred_at      timestamptz := COALESCE(
    NULLIF(v_p->>'completed_at', '')::timestamptz,
    NULLIF(v_data->>'occurred_at', '')::timestamptz,
    now()
  );
  v_status           text;
  v_effective_status text;
  v_customer_id      uuid;
  v_merchant_id      uuid;
  v_log_id           uuid;
  v_recipient_id     uuid;
  v_cmd              text;
  v_merchants uuid[];
  v_customers uuid[];
BEGIN
  IF v_msg_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_message_id');
  END IF;

  IF v_direction IS NULL THEN
    v_direction := CASE
      WHEN v_event_type = 'message.received' THEN 'inbound'
      ELSE 'outbound'
    END;
  END IF;

  v_status := CASE
    WHEN v_event_type = 'message.received' THEN 'received'
    WHEN v_event_type = 'message.sent' THEN 'sent'
    WHEN v_event_type = 'message.finalized' THEN
      CASE
        WHEN lower(COALESCE(v_to_status, '')) = 'delivered' THEN 'delivered'
        WHEN lower(COALESCE(v_to_status, '')) IN (
          'delivery_failed', 'sending_failed', 'failed'
        ) THEN 'failed'
        ELSE COALESCE(v_to_status, 'finalized')
      END
    ELSE COALESCE(v_event_type, 'unknown')
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_msg_id, 0));
  -- Never persist OTP values in body OR callback payload, including callbacks
  -- which beat the redacted send-time write.
  IF v_direction = 'outbound' AND v_body ~* 'verification code is ' THEN
    v_body := regexp_replace(v_body, '(verification code is )[0-9]+', '\1[REDACTED]', 'gi');
    p_payload := jsonb_set(p_payload, '{data,payload,text}', to_jsonb(v_body));
  END IF;

  -- Prefer the send-time ledger row. It carries the exact tenant and optional
  -- customer/campaign recipient linkage that a provider callback cannot know.
  SELECT m.merchant_id, m.customer_id, m.recipient_id
  INTO v_merchant_id, v_customer_id, v_recipient_id
  FROM public.message_log m
  WHERE m.telnyx_message_id = v_msg_id
  LIMIT 1;

  IF v_direction = 'inbound' AND v_merchant_id IS NULL THEN
    -- No global phone lookup: require a prior outbound conversation on the
    -- receiving number and (when supplied) the same profile. Shared numbers
    -- with conversations for multiple merchants are ambiguous, never latest-wins.
    SELECT array_agg(DISTINCT m.merchant_id) INTO v_merchants
    FROM public.message_log m
    WHERE m.direction = 'outbound' AND m.channel = 'sms'
      AND m.merchant_id IS NOT NULL AND m.telnyx_message_id IS NOT NULL
      AND m.status IN ('sent', 'delivered', 'queued', 'sending')
      AND public.telnyx_phone_key(m.to_number) = public.telnyx_phone_key(v_from)
      AND public.telnyx_phone_key(m.from_number) = public.telnyx_phone_key(v_to)
      AND public.telnyx_phone_key(v_from) <> '' AND public.telnyx_phone_key(v_to) <> ''
      AND (v_profile IS NULL OR m.messaging_profile_id = v_profile);
    IF COALESCE(cardinality(v_merchants), 0) <> 1 THEN
      RAISE EXCEPTION 'unattributed_or_ambiguous_telnyx_inbound:%', v_msg_id;
    END IF;
    v_merchant_id := v_merchants[1];
  ELSIF v_direction = 'outbound' AND v_merchant_id IS NULL THEN
    SELECT array_agg(DISTINCT o.merchant_id) INTO v_merchants
    FROM public.order_notifications o WHERE o.provider_id = v_msg_id AND o.channel = 'sms';
    IF cardinality(v_merchants) = 1 THEN v_merchant_id := v_merchants[1]; END IF;
  END IF;
  IF v_direction = 'inbound' THEN
    SELECT array_agg(c.id) INTO v_customers FROM public.customers c
    WHERE c.merchant_id = v_merchant_id
      AND public.telnyx_phone_key(c.phone) = public.telnyx_phone_key(v_from)
      AND public.telnyx_phone_key(v_from) <> '';
    -- Duplicate customer records within a tenant must not pick an arbitrary ID.
    v_customer_id := CASE WHEN cardinality(v_customers) = 1 THEN v_customers[1] ELSE NULL END;
  END IF;

  IF v_direction = 'outbound' AND v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'unattributed_telnyx_outbound:%', v_msg_id;
  END IF;

  INSERT INTO public.message_log(
    merchant_id, customer_id, recipient_id, telnyx_message_id, direction,
    channel, from_number, to_number, body, status, error_code, cost,
    messaging_profile_id, occurred_at, raw
  ) VALUES (
    v_merchant_id, v_customer_id, v_recipient_id, v_msg_id, v_direction,
    'sms', v_from, v_to, v_body, v_status, v_error_code, v_cost,
    v_profile, v_occurred_at, p_payload
  )
  ON CONFLICT (telnyx_message_id) WHERE telnyx_message_id IS NOT NULL
  DO UPDATE SET
    merchant_id = COALESCE(message_log.merchant_id, excluded.merchant_id),
    customer_id = COALESCE(message_log.customer_id, excluded.customer_id),
    status = CASE
      -- A finalized callback is authoritative even when its provider timestamp
      -- predates the local send-time insert by a few milliseconds.
      WHEN v_event_type = 'message.finalized' AND (
        message_log.raw->'data'->>'event_type' IS DISTINCT FROM 'message.finalized'
        OR excluded.occurred_at > COALESCE(
          NULLIF(message_log.raw->'data'->'payload'->>'completed_at', '')::timestamptz,
          NULLIF(message_log.raw->'data'->>'occurred_at', '')::timestamptz,
          message_log.occurred_at
        )
      ) THEN excluded.status
      WHEN message_log.status IN (
        'delivered', 'failed', 'delivery_unconfirmed', 'finalized'
      ) THEN message_log.status
      WHEN excluded.occurred_at >= message_log.occurred_at THEN excluded.status
      ELSE message_log.status
    END,
    error_code = COALESCE(excluded.error_code, message_log.error_code),
    cost = COALESCE(excluded.cost, message_log.cost),
    body = COALESCE(message_log.body, excluded.body),
    to_number = COALESCE(message_log.to_number, excluded.to_number),
    from_number = COALESCE(message_log.from_number, excluded.from_number),
    messaging_profile_id = COALESCE(
      message_log.messaging_profile_id,
      excluded.messaging_profile_id
    ),
    occurred_at = GREATEST(message_log.occurred_at, excluded.occurred_at),
    raw = CASE
      WHEN message_log.raw->'data'->>'event_type' = 'message.finalized' AND (
        v_event_type <> 'message.finalized'
        OR excluded.occurred_at <= COALESCE(
          NULLIF(message_log.raw->'data'->'payload'->>'completed_at', '')::timestamptz,
          NULLIF(message_log.raw->'data'->>'occurred_at', '')::timestamptz,
          message_log.occurred_at
        )
      ) THEN message_log.raw
      WHEN (v_event_type = 'message.finalized' AND message_log.raw->'data'->>'event_type' IS DISTINCT FROM 'message.finalized')
        OR excluded.occurred_at >= message_log.occurred_at THEN excluded.raw
      ELSE message_log.raw
    END,
    updated_at = now()
  RETURNING id, recipient_id, status
  INTO v_log_id, v_recipient_id, v_effective_status;

  IF v_recipient_id IS NOT NULL
     AND v_effective_status IN ('sent', 'delivered', 'failed') THEN
    PERFORM public.record_marketing_result(
        v_recipient_id,
        v_effective_status,
        v_msg_id,
        v_error_code
      );

  END IF;

  IF v_direction = 'inbound'
     AND v_body IS NOT NULL
     AND public.telnyx_phone_key(v_from) <> '' THEN
    v_cmd := upper(btrim(v_body));
    IF v_cmd IN ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT') THEN
      UPDATE public.customers
      SET marketing_unsubscribed_at = v_occurred_at, sms_opt_in = false,
          sms_consent_event_at = v_occurred_at
      WHERE merchant_id = v_merchant_id AND phone IS NOT NULL
        AND public.telnyx_phone_key(phone) = public.telnyx_phone_key(v_from)
        AND (sms_consent_event_at IS NULL OR sms_consent_event_at < v_occurred_at);
    ELSIF v_cmd IN ('START', 'UNSTOP', 'YES') THEN
      UPDATE public.customers
      SET marketing_unsubscribed_at = NULL,
          sms_opt_in = true,
          sms_opt_in_at = v_occurred_at,
          sms_consent_event_at = v_occurred_at
      WHERE merchant_id = v_merchant_id AND phone IS NOT NULL
        AND public.telnyx_phone_key(phone) = public.telnyx_phone_key(v_from)
        AND (sms_consent_event_at IS NULL OR sms_consent_event_at < v_occurred_at);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_log_id,
    'status', v_effective_status,
    'direction', v_direction
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_telnyx_message(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_telnyx_message(jsonb) TO service_role;

COMMENT ON FUNCTION public.record_telnyx_message(jsonb) IS
  'Idempotent Telnyx webhook writer with monotonic event ordering and tenant attribution. Service-role only.';

-- Operator-only repair: replays the DB write, never the provider send.
REVOKE ALL ON FUNCTION public.record_marketing_result(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketing_result(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.repair_telnyx_outbound_ledger(p_dlq_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
DECLARE v_args jsonb; v_id uuid; v_status text;
BEGIN
  SELECT raw_payload->'rpc_args', status INTO v_args, v_status
  FROM public.webhook_dead_letter_queue
  WHERE id = p_dlq_id AND source = 'telnyx_outbound' AND event_type = 'outbound.ledger_repair'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_repair_not_found'; END IF;
  IF v_status = 'resolved' THEN RETURN NULL; END IF;
  v_id := public.log_outbound_message(
    (v_args->>'p_merchant_id')::uuid, v_args->>'p_to_number', v_args->>'p_body',
    v_args->>'p_telnyx_message_id', COALESCE(v_args->>'p_channel','sms'),
    (v_args->>'p_customer_id')::uuid, (v_args->>'p_campaign_id')::uuid,
    (v_args->>'p_recipient_id')::uuid, COALESCE(v_args->>'p_status','sent'),
    v_args->>'p_error_code', v_args->>'p_from_number', v_args->>'p_messaging_profile_id'
  );
  UPDATE public.webhook_dead_letter_queue SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE id = p_dlq_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.repair_telnyx_outbound_ledger(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_telnyx_outbound_ledger(uuid) TO service_role;
