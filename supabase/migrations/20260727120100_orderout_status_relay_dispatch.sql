-- [OrderOut] Outbound status relay — scheduled drain.
--
-- Companion to 20260727120000_orderout_status_relay_queue.sql.
--
-- The trigger fires a best-effort pg_net poke the moment a row is enqueued,
-- which is what buys the <=30s target. This cron job is the floor: if pg_net is
-- blocked, the edge function is briefly down, or a poke is simply lost, queued
-- rows still drain within a minute. The queue table remains the source of truth
-- in every case — neither path is allowed to be load-bearing on its own.
--
-- ONE-TIME SETUP (SQL editor, as `postgres`; per environment):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/orderout-status-relay',
--     'orderout_status_relay_url'
--   );
-- `internal_notification_secret` already exists in both environments and is
-- reused as-is — it must equal INTERNAL_NOTIFICATION_SECRET in the edge
-- function env or the relay 401s.
-- Inspect names (never values): select id, name from vault.secrets;
--
-- Until orderout_status_relay_url is set, poke_orderout_status_relay() no-ops
-- and this job is harmless — rows accumulate and drain once configured.

-- Idempotent: drop any prior schedule of the same name.
DO $$
BEGIN
  PERFORM cron.unschedule('orderout-status-relay-drain');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'orderout-status-relay-drain',
  '* * * * *',
  $cron$SELECT public.poke_orderout_status_relay()$cron$
);
