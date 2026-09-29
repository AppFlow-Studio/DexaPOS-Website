-- [Web] Server-side kiosk confirmation/receipt SMS on order -> preparing.
--
-- Problem: the kiosk's only customer SMS (receipt + confirmation, via
-- send-receipt) is a CLIENT-SIDE fire-and-forget fired at the end of checkout.
-- On CodePay terminals the app returns from the external CodePay Register app
-- and immediately tears the checkout down to the success screen, dropping the
-- un-awaited request — so no text is sent (prod order #S19-0001: paid + kitchen
-- sent -> status 'preparing', but zero receipt_sends rows).
--
-- Fix: fire the SAME send-receipt confirmation from a DB trigger when a KIOSK
-- order transitions INTO 'preparing' (which, on a kiosk, only happens after a
-- successful payment sends the ticket to the kitchen). This is server-side, so
-- it does not depend on the device surviving the payment-app round-trip.
--
-- Dedup: the client fire-and-forget is left in place (no app rebuild needed).
-- The partial unique index from 20260923164400 makes send-receipt exactly-once
-- per order for confirmation sms, so the trigger and the client can never
-- double-send — whichever inserts the receipt_sends row first wins.
--
-- Relationship to notify_order_status_change() (20260917130000): that pipeline
-- relays kiosk order-status texts on READY/COMPLETED only (a different message).
-- This trigger fires on PREPARING and sends the receipt/confirmation. Disjoint
-- events, disjoint messages — no overlap.
--
-- Safety: net.http_post (pg_net) is async and fully isolated in a nested block —
-- a network hiccup can NEVER fail the order UPDATE. No-op if the Vault URL is
-- absent, so this is safe to apply before the send_receipt_url secret exists or
-- the edge function is deployed. Never touches order_payments / settlement.
--
-- Config (Vault, per env, created operationally — NOT in this migration since the
-- URL is project-specific; mirrors order_status_notify_url / orderout_*_url):
--   send_receipt_url = https://<project-ref>.supabase.co/functions/v1/send-receipt
--
-- Idempotent. Apply to staging first; deploy prod manually per convention.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.enqueue_kiosk_confirmation_sms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text;
  phone  text;
BEGIN
  -- The trigger WHEN clause already restricts to kiosk + transition into
  -- 'preparing'. Here we only need a deliverable phone and a configured URL.
  phone := nullif(btrim(coalesce(NEW.customer_phone, '')), '');
  IF phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(ds.decrypted_secret, '')
    INTO fn_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'send_receipt_url'
  LIMIT 1;

  -- Unconfigured -> no-op (safe to apply before the secret / fn exists).
  IF fn_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- Isolated network call: send-receipt is exactly-once per order (unique index
  -- 20260923164400), so this cannot double the kiosk client's fire-and-forget.
  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      body := jsonb_build_object(
        'order_id',        NEW.id,
        'delivery_method', 'sms',
        'recipient',       phone,
        'confirmation',    true
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kiosk confirmation sms: poke failed for order % (%): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Hard constraint: the order status update never fails because of SMS state.
  RAISE WARNING 'kiosk confirmation sms: enqueue failed for order % (%): %',
    NEW.id, SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kiosk_confirmation_sms ON public.orders;
CREATE TRIGGER trg_kiosk_confirmation_sms
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    NEW.order_source = 'kiosk'
    AND NEW.status = 'preparing'
    AND OLD.status IS DISTINCT FROM NEW.status
  )
  EXECUTE FUNCTION public.enqueue_kiosk_confirmation_sms();
