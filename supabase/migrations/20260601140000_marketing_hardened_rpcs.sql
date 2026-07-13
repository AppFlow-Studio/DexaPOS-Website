-- Marketing: hardened SECURITY DEFINER RPCs for consent enforcement, bulk send pipeline, and unsubscribe

-- Unique constraint so resolve_and_expand_campaign is idempotent on re-expand
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_recipients_campaign_customer_unique'
      AND conrelid = 'public.marketing_recipients'::regclass
  ) THEN
    ALTER TABLE public.marketing_recipients
      ADD CONSTRAINT marketing_recipients_campaign_customer_unique
      UNIQUE (campaign_id, customer_id);
  END IF;
END;
$$;

-- RPC: resolve_and_expand_campaign
-- Verifies merchant ownership, resolves audience, inserts recipient rows with hard consent gate.
-- Returns only eligible (pending) rows for Node to send.
-- Not-opted-in customers get a failed/not_opted_in row so they appear in campaign history.
CREATE OR REPLACE FUNCTION public.resolve_and_expand_campaign(
  p_campaign_id  UUID,
  p_merchant_id  UUID
)
RETURNS TABLE(
  recipient_id  UUID,
  customer_id   UUID,
  destination   TEXT,
  channel       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_campaign    marketing_campaigns%ROWTYPE;
  v_customer    RECORD;
  v_destination TEXT;
  v_status      TEXT;
  v_error       TEXT;
  v_rid         UUID;
BEGIN
  SELECT * INTO v_campaign
  FROM marketing_campaigns
  WHERE id = p_campaign_id AND merchant_id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found or access denied: %', p_campaign_id;
  END IF;

  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Cannot expand campaign with status: %', v_campaign.status;
  END IF;

  FOR v_customer IN
    SELECT c.id AS cid, c.phone, c.email,
           c.sms_opt_in, c.email_opt_in, c.marketing_unsubscribed_at
    FROM customers c
    WHERE c.merchant_id = p_merchant_id
      AND c.is_active = true
      AND (
        v_campaign.audience_type = 'all'
        OR (
          v_campaign.audience_type = 'tag'
          AND v_campaign.audience_tags IS NOT NULL
          AND c.tags && v_campaign.audience_tags
        )
      )
  LOOP
    IF v_campaign.campaign_type = 'sms' THEN
      v_destination := v_customer.phone;
    ELSE
      v_destination := v_customer.email;
    END IF;

    -- Hard consent gate: marketing_unsubscribed_at overrides all channel opt-ins
    IF v_customer.marketing_unsubscribed_at IS NOT NULL THEN
      v_status := 'failed';
      v_error  := 'not_opted_in';
    ELSIF v_campaign.campaign_type = 'sms'
      AND (v_customer.sms_opt_in IS NOT TRUE OR v_destination IS NULL) THEN
      v_status := 'failed';
      v_error  := 'not_opted_in';
    ELSIF v_campaign.campaign_type = 'email'
      AND (v_customer.email_opt_in IS NOT TRUE OR v_destination IS NULL) THEN
      v_status := 'failed';
      v_error  := 'not_opted_in';
    ELSE
      v_status := 'pending';
      v_error  := NULL;
    END IF;

    INSERT INTO marketing_recipients(
      campaign_id, customer_id, channel, destination, status, error_message, created_at
    ) VALUES (
      p_campaign_id, v_customer.cid, v_campaign.campaign_type,
      v_destination, v_status, v_error, NOW()
    )
    ON CONFLICT (campaign_id, customer_id) DO UPDATE SET
      status        = excluded.status,
      error_message = excluded.error_message;

    IF v_status = 'pending' THEN
      SELECT mr.id INTO v_rid
      FROM marketing_recipients mr
      WHERE mr.campaign_id = p_campaign_id AND mr.customer_id = v_customer.cid;

      recipient_id := v_rid;
      customer_id  := v_customer.cid;
      destination  := v_destination;
      channel      := v_campaign.campaign_type;
      RETURN NEXT;
    END IF;
  END LOOP;

  UPDATE marketing_campaigns
  SET total_recipients = (
    SELECT COUNT(*) FROM marketing_recipients WHERE campaign_id = p_campaign_id
  )
  WHERE id = p_campaign_id;

  RETURN;
END;
$$;

-- RPC: record_marketing_result
-- Updates a recipient row status/timestamps and rolls up campaign counters.
-- p_provider_message_id accepted for future Part C (message_log) compatibility; not stored here yet.
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

-- RPC: unsubscribe_customer
-- Stamps marketing_unsubscribed_at, flips channel opt-ins,
-- marks active recipient rows unsubscribed, and rolls up total_unsubscribed.
CREATE OR REPLACE FUNCTION public.unsubscribe_customer(
  p_customer_id UUID,
  p_merchant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM customers WHERE id = p_customer_id AND merchant_id = p_merchant_id
  ) THEN
    RAISE EXCEPTION 'Customer not found or access denied: %', p_customer_id;
  END IF;

  UPDATE customers SET
    marketing_unsubscribed_at = NOW(),
    sms_opt_in                = false,
    email_opt_in              = false
  WHERE id = p_customer_id;

  WITH newly_unsubscribed AS (
    UPDATE marketing_recipients SET
      status          = 'unsubscribed',
      unsubscribed_at = NOW()
    WHERE customer_id = p_customer_id
      AND status IN ('pending','sent','delivered')
      AND campaign_id IN (
        SELECT id FROM marketing_campaigns WHERE merchant_id = p_merchant_id
      )
    RETURNING campaign_id
  )
  UPDATE marketing_campaigns mc SET
    total_unsubscribed = mc.total_unsubscribed + sub.cnt
  FROM (
    SELECT campaign_id, COUNT(*) AS cnt FROM newly_unsubscribed GROUP BY campaign_id
  ) sub
  WHERE mc.id = sub.campaign_id;
END;
$$;
