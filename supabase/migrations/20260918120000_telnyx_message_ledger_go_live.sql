-- Telnyx messaging go-live hardening.
--
-- This migration keeps all ledger writers service-role only while making
-- webhook retries, out-of-order delivery, sender metadata, and unattributed
-- outbound events explicit and recoverable.

ALTER TABLE public.webhook_dead_letter_queue
  ADD COLUMN IF NOT EXISTS external_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_dlq_source_external_event
  ON public.webhook_dead_letter_queue (source, external_event_id)
  WHERE external_event_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.log_outbound_message(
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text
);

CREATE FUNCTION public.log_outbound_message(
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
BEGIN
  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'merchant_id_required';
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
  RETURNING id INTO v_id;

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

  -- Prefer the send-time ledger row. It carries the exact tenant and optional
  -- customer/campaign recipient linkage that a provider callback cannot know.
  SELECT m.merchant_id, m.customer_id, m.recipient_id
  INTO v_merchant_id, v_customer_id, v_recipient_id
  FROM public.message_log m
  WHERE m.telnyx_message_id = v_msg_id
  LIMIT 1;

  IF v_direction = 'inbound' THEN
    SELECT c.id, c.merchant_id
    INTO v_customer_id, v_merchant_id
    FROM public.customers c
    WHERE c.phone IS NOT NULL
      AND public.phone_last10(c.phone) = public.phone_last10(v_from)
      AND public.phone_last10(v_from) <> ''
    ORDER BY c.created_at DESC NULLS LAST
    LIMIT 1;
  ELSIF v_merchant_id IS NULL THEN
    -- Safety net for order notifications created before every sender was wired
    -- into message_log. New sends must always be pre-logged.
    SELECT o.merchant_id
    INTO v_merchant_id
    FROM public.order_notifications o
    WHERE o.provider_id = v_msg_id
    LIMIT 1;
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
      WHEN v_event_type = 'message.finalized' THEN excluded.status
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
      WHEN v_event_type = 'message.finalized'
        OR excluded.occurred_at >= message_log.occurred_at THEN excluded.raw
      ELSE message_log.raw
    END,
    updated_at = now()
  RETURNING id, recipient_id, status
  INTO v_log_id, v_recipient_id, v_effective_status;

  IF v_recipient_id IS NOT NULL
     AND v_effective_status IN ('sent', 'delivered', 'failed') THEN
    BEGIN
      PERFORM public.record_marketing_result(
        v_recipient_id,
        v_effective_status,
        v_msg_id,
        v_error_code
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF v_direction = 'inbound'
     AND v_body IS NOT NULL
     AND public.phone_last10(v_from) <> '' THEN
    v_cmd := upper(btrim(v_body));
    IF v_cmd IN ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT') THEN
      UPDATE public.customers
      SET marketing_unsubscribed_at = now(), sms_opt_in = false
      WHERE phone IS NOT NULL
        AND public.phone_last10(phone) = public.phone_last10(v_from);
    ELSIF v_cmd IN ('START', 'UNSTOP', 'YES') THEN
      UPDATE public.customers
      SET marketing_unsubscribed_at = NULL,
          sms_opt_in = true,
          sms_opt_in_at = now()
      WHERE phone IS NOT NULL
        AND public.phone_last10(phone) = public.phone_last10(v_from);
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
