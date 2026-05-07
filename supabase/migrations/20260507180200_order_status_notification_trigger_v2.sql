-- Extend the order-status notification trigger to also forward sent_to_kitchen,
-- so customers get a "your order is in the kitchen" update.

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
