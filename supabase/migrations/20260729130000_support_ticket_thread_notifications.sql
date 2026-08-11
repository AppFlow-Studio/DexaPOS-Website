-- Notify configured DEXA developers when a reply or private note is added to
-- any support ticket. The initial description message is excluded because the
-- support_tickets INSERT trigger already sends the new-ticket notification.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.support_ticket_message_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE
    REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL
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

CREATE INDEX IF NOT EXISTS
  idx_support_ticket_message_notification_deliveries_ticket
  ON public.support_ticket_message_notification_deliveries (
    ticket_id,
    created_at DESC
  );

ALTER TABLE public.support_ticket_message_notification_deliveries
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_ticket_message_notification_deliveries
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_ticket_message_notification_deliveries
  TO service_role;

CREATE OR REPLACE FUNCTION public.notify_support_ticket_message_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  notify_url text;
  notify_secret text;
  is_initial_description boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.id = NEW.ticket_id
      AND btrim(st.description) = btrim(NEW.message)
      AND coalesce(NEW.created_at, now())
        BETWEEN coalesce(st.created_at, now()) - interval '1 minute'
            AND coalesce(st.created_at, now()) + interval '5 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM public.support_ticket_messages existing
        WHERE existing.ticket_id = NEW.ticket_id
          AND existing.id <> NEW.id
      )
  )
  INTO is_initial_description;

  IF is_initial_description THEN
    RETURN NEW;
  END IF;

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
    body := jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'message_id', NEW.id,
      'event', 'message_created'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', notify_secret
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'Support ticket message % notification enqueue failed: %',
      NEW.id,
      SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_support_ticket_message_created()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_support_ticket_message_created
  ON public.support_ticket_messages;
CREATE TRIGGER trg_notify_support_ticket_message_created
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_support_ticket_message_created();
