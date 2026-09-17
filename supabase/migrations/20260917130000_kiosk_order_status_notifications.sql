-- [Web] Extend order-status customer notifications to KIOSK orders.
--
-- Background: notify_order_status_change() (vault version 20260718130100) fires
-- the customer SMS/email pipeline when an order_status_history row is inserted,
-- but ONLY for website-originated online orders (online_orders.provider =
-- 'website'). Kiosk orders are placed on a POS self_service station as regular
-- `orders` rows tagged orders.order_source = 'kiosk' (see
-- 20260722120000_kiosk_channel_reporting.sql) and have NO online_orders row, so
-- they were never notified — a walk-up customer never got "your order is ready".
--
-- This rewrite (CREATE OR REPLACE FUNCTION only — the AFTER INSERT trigger
-- trg_notify_order_status_change on order_status_history is unchanged, and it
-- keeps referencing this function by name) adds a kiosk path:
--   * website orders: UNCHANGED — full status->event map (accepted,
--     sent_to_kitchen, preparing, ready, completed, cancelled, declined),
--     honoring each merchant's online_store_config.notification_prefs.
--   * kiosk orders:  ONLY 'ready' and 'completed' events are relayed, so a
--     walk-up customer gets "your order is ready" + "thanks", but not
--     accepted/preparing texts while they're standing at the counter.
--
-- The general record_order_status_change() trigger (track_order_status_changes,
-- BEFORE UPDATE ON orders) already writes an order_status_history row on every
-- orders.status change — including kiosk — so no upstream change is required.
--
-- Downstream, sendOrderStatusNotifications()/loadOrderContext() are already
-- provider-agnostic: they read the recipient from orders.customer_phone /
-- customer_email, default customer opt-ins to true, and default merchant prefs
-- to include ready+completed. A kiosk order with no captured contact simply logs
-- a 'skipped' order_notifications row (no_phone / no_email) — never an error.
--
-- All Vault/GUC config resolution from 20260718130100 is preserved verbatim.
-- Idempotent. Apply to staging first; deploy prod manually per convention.

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
  is_website    boolean;
  is_kiosk      boolean;
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

  -- Map the transition to a customer-facing event. Bail early if it's not one
  -- we notify on (saves the origin lookups below).
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

  -- Website-originated online orders: full status set (unchanged behaviour).
  SELECT EXISTS(
    SELECT 1 FROM public.online_orders
    WHERE order_id = NEW.order_id AND provider = 'website'
  ) INTO is_website;

  IF NOT is_website THEN
    -- Kiosk (POS self-service) orders are tagged on orders.order_source and have
    -- no online_orders row. Notify them ONLY on ready/completed.
    SELECT EXISTS(
      SELECT 1 FROM public.orders
      WHERE id = NEW.order_id AND order_source = 'kiosk'
    ) INTO is_kiosk;

    IF NOT is_kiosk THEN
      RETURN NEW;
    END IF;

    IF event_name NOT IN ('ready', 'completed') THEN
      RETURN NEW;
    END IF;
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
