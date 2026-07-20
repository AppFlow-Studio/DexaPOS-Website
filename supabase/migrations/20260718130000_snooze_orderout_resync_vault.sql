-- [POS/Web] Snooze -> OrderOut resync: read config from Supabase Vault.
--
-- Supersedes the current_setting()-based config lookup in
-- 20260714120002_item_snooze_orderout_resync_trigger.sql. On Supabase the
-- `postgres` role cannot run `ALTER DATABASE ... SET app.*` (ERROR 42501:
-- "permission denied to set parameter"), so the GUC approach can't be
-- configured from the SQL editor. This rewrites notify_item_snooze_change() to
-- read its config from Vault instead — which the `postgres` role CAN write —
-- and keeps a fallback to the old GUCs in case they were ever set by a
-- privileged path (they are shared with notify_order_status_change).
--
-- ONE-TIME SETUP (run in the SQL editor as `postgres`; no ALTER DATABASE needed):
--   select vault.create_secret('<random secret>', 'internal_notification_secret');
--   select vault.create_secret('https://<web-app>/api/internal/orderout-resync', 'orderout_resync_url');
-- The <random secret> MUST equal INTERNAL_NOTIFICATION_SECRET in the Next.js env
-- (Vercel) — the /api/internal/orderout-resync route 401s on a mismatch.
-- Rotate later with: select vault.update_secret('<uuid>', '<new value>');
-- Inspect names (not values): select id, name from vault.secrets;
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE.
-- Safe to run over a DB that already has 20260714120002.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_item_snooze_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  resync_url    text;
  resync_secret text;
BEGIN
  -- Prefer Vault (settable by the postgres role); fall back to the GUCs that
  -- notify_order_status_change() uses, in case those are configured here.
  SELECT nullif(ds.decrypted_secret, '')
    INTO resync_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'orderout_resync_url'
  LIMIT 1;
  resync_url := coalesce(
    resync_url,
    nullif(current_setting('app.orderout_resync_url', true), '')
  );

  SELECT nullif(ds.decrypted_secret, '')
    INTO resync_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'internal_notification_secret'
  LIMIT 1;
  resync_secret := coalesce(
    resync_secret,
    nullif(current_setting('app.notify_secret', true), '')
  );

  -- No config yet -> no-op (safe to deploy before the secrets/route exist).
  IF resync_url IS NULL OR resync_secret IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only when the snooze state is actually set (insert) or changed (update).
  -- Clearing to NULL (restore) counts as a change so the item is re-listed.
  IF TG_OP = 'INSERT' AND NEW.snoozed_until IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.snoozed_until IS NOT DISTINCT FROM OLD.snoozed_until THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := resync_url,
    body := jsonb_build_object(
      'location_id', NEW.location_id,
      'reason', 'snooze_change'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', resync_secret
    )
  );

  RETURN NULL;
END;
$$;

-- Triggers unchanged from 20260714120002; (re)created so this migration is
-- self-contained on a DB that never got that one.
DROP TRIGGER IF EXISTS trg_item_snooze_resync ON public.location_item_overrides;
CREATE TRIGGER trg_item_snooze_resync
  AFTER INSERT OR UPDATE OF snoozed_until ON public.location_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.notify_item_snooze_change();

DROP TRIGGER IF EXISTS trg_modifier_snooze_resync ON public.location_modifier_item_overrides;
CREATE TRIGGER trg_modifier_snooze_resync
  AFTER INSERT OR UPDATE OF snoozed_until ON public.location_modifier_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.notify_item_snooze_change();
