-- HQ-created developer tickets + source-independent new-ticket notifications.
--
-- Every support_tickets INSERT, including inserts originating from the POS,
-- calls the protected web endpoint asynchronously through pg_net. Missing
-- notification configuration is a no-op so ticket creation is never blocked.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.support_ticket_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE
    REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'failed')),
  recipient_emails text[] NOT NULL DEFAULT '{}'::text[],
  resend_message_ids text[] NOT NULL DEFAULT '{}'::text[],
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_ticket_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_ticket_notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_ticket_notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.create_hq_support_ticket(
  p_location_id uuid,
  p_subject text,
  p_description text,
  p_category text,
  p_submitted_by text,
  p_submitted_by_name text,
  p_submitted_by_email text DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket_id uuid;
  v_ticket_number text;
  v_merchant_id uuid;
  v_carrier_id uuid;
BEGIN
  IF nullif(btrim(p_subject), '') IS NULL THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;

  IF nullif(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Description is required';
  END IF;

  IF p_category IS NULL OR p_category <> ALL (
    ARRAY[
      'general', 'billing', 'hardware', 'pos_app', 'menu', 'payments',
      'kitchen', 'feature_request', 'onboarding'
    ]
  ) THEN
    RAISE EXCEPTION 'Invalid support ticket category';
  END IF;

  IF p_priority IS NULL OR
     p_priority <> ALL (ARRAY['low', 'normal', 'high', 'urgent']) THEN
    RAISE EXCEPTION 'Invalid support ticket priority';
  END IF;

  SELECT l.merchant_id, m.carrier_id
    INTO v_merchant_id, v_carrier_id
  FROM public.locations l
  JOIN public.merchants m ON m.id = l.merchant_id
  WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Configured DEXA HQ support location was not found';
  END IF;

  v_ticket_number :=
    'DEXA-' || lpad(nextval('public.support_ticket_seq')::text, 5, '0');

  INSERT INTO public.support_tickets (
    ticket_number,
    merchant_id,
    location_id,
    submitted_by,
    submitted_by_name,
    submitted_by_email,
    carrier_id,
    subject,
    description,
    category,
    priority,
    metadata
  )
  VALUES (
    v_ticket_number,
    v_merchant_id,
    p_location_id,
    p_submitted_by,
    p_submitted_by_name,
    p_submitted_by_email,
    v_carrier_id,
    btrim(p_subject),
    btrim(p_description),
    p_category,
    p_priority,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'hq_admin',
      'audience', 'developers',
      'hq_created', true
    )
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    sender_id,
    sender_name,
    sender_role,
    message,
    is_internal,
    read_by_admin,
    read_by_merchant
  )
  VALUES (
    v_ticket_id,
    p_submitted_by,
    p_submitted_by_name,
    'admin',
    btrim(p_description),
    false,
    true,
    false
  );

  RETURN jsonb_build_object(
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_number,
    'merchant_id', v_merchant_id,
    'location_id', p_location_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hq_support_ticket(
  uuid, text, text, text, text, text, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_support_ticket_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  notify_url text;
  notify_secret text;
BEGIN
  SELECT nullif(ds.decrypted_secret, '')
    INTO notify_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'support_ticket_notify_url'
  LIMIT 1;

  notify_url := coalesce(
    notify_url,
    nullif(current_setting('app.support_ticket_notify_url', true), '')
  );

  SELECT nullif(ds.decrypted_secret, '')
    INTO notify_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'internal_notification_secret'
  LIMIT 1;

  notify_secret := coalesce(
    notify_secret,
    nullif(current_setting('app.notify_secret', true), '')
  );

  IF notify_url IS NULL OR notify_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := notify_url,
    body := jsonb_build_object('ticket_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', notify_secret
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'Support ticket % notification enqueue failed: %',
      NEW.id,
      SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_support_ticket_created()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_support_ticket_created
  ON public.support_tickets;
CREATE TRIGGER trg_notify_support_ticket_created
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_support_ticket_created();
