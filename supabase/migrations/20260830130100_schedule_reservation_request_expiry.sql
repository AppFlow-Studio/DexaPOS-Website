-- [Website reservations] Schedule the unanswered-request sweep.
--
-- Companion to 20260830130000_expire_stale_reservation_requests.sql, which
-- carries the safety reasoning. This file only decides when it runs.
--
-- The sweep cancels rows AND has to tell each guest, and pg_cron cannot send an
-- email. So the job pokes the app over pg_net and the route does both, reusing
-- the decline templates that already exist there rather than growing a second
-- copy of the guest's message in Deno. Same shape as the OrderOut resync
-- dispatch (20260718130000) and the status-relay drain (20260727120100).
--
-- ONE-TIME SETUP (SQL editor, as `postgres`; per environment):
--   select vault.create_secret(
--     'https://<web-app>/api/internal/expire-reservation-requests',
--     'reservation_expiry_url'
--   );
-- `internal_notification_secret` already exists in both environments and is
-- reused as-is — it must equal INTERNAL_NOTIFICATION_SECRET in the web app's
-- env or the route 401s.
-- Inspect names (never values): select id, name from vault.secrets;
--
-- Until reservation_expiry_url is set this function no-ops and the job is inert.
-- That is the deliberate deploy order: the migration is safe to apply on its
-- own, and nothing expires until someone points it at a running app.

CREATE OR REPLACE FUNCTION public.poke_reservation_request_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  expiry_url    text;
  expiry_secret text;
BEGIN
  SELECT nullif(ds.decrypted_secret, '')
    INTO expiry_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'reservation_expiry_url'
  LIMIT 1;

  SELECT nullif(ds.decrypted_secret, '')
    INTO expiry_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'internal_notification_secret'
  LIMIT 1;

  -- Not configured yet -> no-op. Safe to schedule before the route is live.
  IF expiry_url IS NULL OR expiry_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := expiry_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', expiry_secret
    )
  );
END $$;

COMMENT ON FUNCTION public.poke_reservation_request_expiry() IS
  'Fires the unanswered-request sweep at the web app over pg_net. No-ops until the reservation_expiry_url vault secret is set.';

-- Nobody but the cron job (running as `postgres`) calls this. `anon` and
-- `authenticated` must be named explicitly: Supabase's default privileges grant
-- them EXECUTE at creation time, and REVOKE FROM PUBLIC does not touch an
-- explicit grant. Left open, an anonymous caller could fire the sweep at will.
REVOKE ALL ON FUNCTION public.poke_reservation_request_expiry()
  FROM PUBLIC, anon, authenticated;

-- Idempotent: drop any prior schedule of the same name.
DO $$
BEGIN
  PERFORM cron.unschedule('website-reservation-request-expiry');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Every quarter hour. The grace window is two hours (`REQUEST_GRACE_MINUTES`),
-- so this cadence closes a request between 105 and 120 minutes before the
-- sitting — well inside the window, and far too coarse to matter to a guest.
-- Anything tighter would be pure load: the sweep is a no-op on almost every run
-- at almost every restaurant, because most merchants never leave auto-accept.
SELECT cron.schedule(
  'website-reservation-request-expiry',
  '*/15 * * * *',
  $cron$SELECT public.poke_reservation_request_expiry()$cron$
);
