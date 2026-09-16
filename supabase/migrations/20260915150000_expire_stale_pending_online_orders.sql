-- ============================================================================
-- Server-side guarantee for the "window to accept orders"
-- ----------------------------------------------------------------------------
-- The storefront tracking page counts down and auto-cancels an unaccepted
-- online order (app/sites/components/OrderTrackingPage.tsx), but that only runs
-- while the customer keeps the tab open. This cron is the real guarantee: it
-- auto-cancels/voids online orders left in `pending` past their store's accept
-- window (online_store_config.pending_accept_window_minutes) regardless of
-- whether any browser is watching.
--
-- It reuses the existing cancel-online-order edge function (Valor/NMI void or
-- refund + status + customer notification) via a service-role "system" call —
-- mirroring notify_order_status_change(): read the shared secret + function URL
-- from Vault, then net.http_post per order.
--
-- ONE-TIME SETUP (SQL editor as postgres, per environment):
--   -- Full URL of the cancel-online-order edge function for THIS project:
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/cancel-online-order',
--     'cancel_online_order_url'
--   );
--   -- 'internal_notification_secret' already exists (created for the order-status
--   -- notify trigger); it MUST equal INTERNAL_NOTIFICATION_SECRET in the edge env.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.expire_stale_pending_online_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  cancel_url    text;
  notify_secret text;
  r             record;
  v_count       integer := 0;
BEGIN
  SELECT nullif(ds.decrypted_secret, '') INTO cancel_url
  FROM vault.decrypted_secrets ds WHERE ds.name = 'cancel_online_order_url' LIMIT 1;

  SELECT nullif(ds.decrypted_secret, '') INTO notify_secret
  FROM vault.decrypted_secrets ds WHERE ds.name = 'internal_notification_secret' LIMIT 1;

  -- Not configured yet → no-op (safe on a fresh environment).
  IF cancel_url IS NULL OR notify_secret IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT
      o.id,
      GREATEST(1, COALESCE(osc.pending_accept_window_minutes, 5)) AS window_minutes
    FROM public.orders o
    JOIN public.online_orders oo
      ON oo.order_id = o.id AND oo.provider = 'website'
    LEFT JOIN public.online_store_config osc
      ON osc.location_id = o.location_id
    WHERE o.status = 'pending'
      -- Past the store's accept window …
      AND o.created_at < now()
          - make_interval(mins => GREATEST(1, COALESCE(osc.pending_accept_window_minutes, 5)))
      -- … but bound retries: never keep hammering an ancient stuck order.
      AND o.created_at > now() - interval '24 hours'
    LIMIT 200
  LOOP
    -- Fire-and-forget. cancel-online-order guards on status='pending', so this is
    -- idempotent vs. the client-side countdown and vs. the next cron tick: whoever
    -- lands first wins, the rest get a 409 no-op. A failed reversal leaves the order
    -- pending and the next tick retries (within the 24h bound above).
    PERFORM net.http_post(
      url := cancel_url,
      body := jsonb_build_object(
        'order_id', r.id,
        'trigger', 'system',
        'reason', 'No response from restaurant within ' || r.window_minutes
                  || ' minute' || CASE WHEN r.window_minutes = 1 THEN '' ELSE 's' END
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', notify_secret
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_online_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_online_orders() TO service_role;

COMMENT ON FUNCTION public.expire_stale_pending_online_orders() IS
  'Every minute: auto-cancels website online orders left pending past their store''s pending_accept_window_minutes by calling the cancel-online-order edge fn (system trigger). The server-side guarantee behind the storefront accept-window countdown.';

-- Schedule every minute; idempotent reschedule.
DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-pending-online-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-pending-online-orders',
  '* * * * *',
  $cron$SELECT public.expire_stale_pending_online_orders()$cron$
);
