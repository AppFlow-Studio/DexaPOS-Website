-- Auto-fire customer notifications when an order_status_history row is inserted
-- for a website-originated online order. Uses pg_net to POST to the Next.js
-- internal route, which then dispatches Resend/Telnyx through the shared helper.
--
-- Required GUCs (set with `ALTER DATABASE ... SET app.<key> = '...'`):
--   app.notify_url    — e.g. https://dexapos.com/api/internal/order-status-notify
--   app.notify_secret — must match INTERNAL_NOTIFICATION_SECRET in Next.js env
-- If either is unset the trigger is a no-op.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  notify_url    text := current_setting('app.notify_url', true);
  notify_secret text := current_setting('app.notify_secret', true);
  is_online     boolean;
  event_name    text;
BEGIN
  IF notify_url IS NULL OR notify_url = '' OR notify_secret IS NULL OR notify_secret = '' THEN
    RETURN NEW;
  END IF;

  -- Only fire for orders that have a corresponding online_orders row from the website.
  SELECT EXISTS(
    SELECT 1 FROM public.online_orders
    WHERE order_id = NEW.order_id AND provider = 'website'
  ) INTO is_online;

  IF NOT is_online THEN
    RETURN NEW;
  END IF;

  event_name := CASE NEW.to_status
    WHEN 'accepted'  THEN 'accepted'
    WHEN 'preparing' THEN 'preparing'
    WHEN 'ready'     THEN 'ready'
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'declined'  THEN 'declined'
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
DROP TRIGGER IF EXISTS trg_notify_order_status_change ON public.order_status_history;
CREATE TRIGGER trg_notify_order_status_change
  AFTER INSERT ON public.order_status_history
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_status_change();
