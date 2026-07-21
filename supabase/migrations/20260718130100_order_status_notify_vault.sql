-- [Web] Order-status customer notifications: read config from Supabase Vault.
--
-- Consistency pass matching 20260718130000_snooze_orderout_resync_vault.sql.
-- On Supabase the `postgres` role can't run `ALTER DATABASE ... SET app.*`
-- (ERROR 42501), so the current_setting() GUC approach can't be configured from
-- the SQL editor. This rewrites notify_order_status_change() to read its config
-- from Vault (which `postgres` CAN write), keeping a fallback to the old
-- app.notify_url / app.notify_secret GUCs in case they were set by a privileged
-- path. All v2 behaviour is preserved (website-order gate + status->event map,
-- incl. sent_to_kitchen).
--
-- ONE-TIME SETUP (SQL editor as postgres — no ALTER DATABASE needed):
--   -- Shared secret with the snooze trigger; create it ONCE, reuse here.
--   select vault.create_secret('<random secret>', 'internal_notification_secret');
--   select vault.create_secret('https://<web-app>/api/internal/order-status-notify', 'order_status_notify_url');
-- <random secret> MUST equal INTERNAL_NOTIFICATION_SECRET in the Next.js env.
--
-- Idempotent: CREATE OR REPLACE FUNCTION only — the existing trigger on
-- order_status_history keeps referencing this function by name.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  notify_url    text;
  notify_secret text;
  is_online     boolean;
  event_name    text;
BEGIN
  -- Prefer Vault (settable by the postgres role); fall back to the app.* GUCs.
  SELECT nullif(ds.decrypted_secret, '')
    INTO notify_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'order_status_notify_url'
  LIMIT 1;
  notify_url := coalesce(
    notify_url,
    nullif(current_setting('app.notify_url', true), '')
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

  -- Only website-originated online orders get customer notifications.
  SELECT EXISTS(
    SELECT 1 FROM public.online_orders
    WHERE order_id = NEW.order_id AND provider = 'website'
  ) INTO is_online;

  IF NOT is_online THEN
    RETURN NEW;
  END IF;

  event_name := CASE NEW.to_status
    WHEN 'accepted'        THEN 'accepted'
    WHEN 'sent_to_kitchen' THEN 'sent_to_kitchen'
    WHEN 'preparing'       THEN 'preparing'
    WHEN 'ready'           THEN 'ready'
    WHEN 'completed'       THEN 'completed'
    WHEN 'cancelled'       THEN 'cancelled'
    WHEN 'declined'        THEN 'declined'
    ELSE NULL
  END;

  IF event_name IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := notify_url,
    body := jsonb_build_object('order_id', NEW.order_id, 'event', event_name),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', notify_secret
    )
  );

  RETURN NEW;
END;
$$;
