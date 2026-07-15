-- [POS/Web] 86ing -> OrderOut propagation (closes the POS-origin gap).
--
-- The web snooze action re-pushes OrderOut inline, but a 86 done directly on the
-- POS calls set_item_snooze_v1 / set_modifier_snooze_v1 at the database and never
-- hits that action, so delivery apps would stay stale. This trigger fires an
-- internal resync whenever snoozed_until changes on an item/modifier override,
-- regardless of origin. Mirrors the notify_order_status_change() pg_net pattern.
--
-- No-ops until app.orderout_resync_url + app.notify_secret are configured on the
-- database (ALTER DATABASE ... SET ...), so it is safe to deploy before the
-- internal route and settings exist.

CREATE OR REPLACE FUNCTION public.notify_item_snooze_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  resync_url    text := current_setting('app.orderout_resync_url', true);
  resync_secret text := current_setting('app.notify_secret', true);
BEGIN
  IF resync_url IS NULL OR resync_url = ''
     OR resync_secret IS NULL OR resync_secret = '' THEN
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

DROP TRIGGER IF EXISTS trg_item_snooze_resync ON public.location_item_overrides;
CREATE TRIGGER trg_item_snooze_resync
  AFTER INSERT OR UPDATE OF snoozed_until ON public.location_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.notify_item_snooze_change();

DROP TRIGGER IF EXISTS trg_modifier_snooze_resync ON public.location_modifier_item_overrides;
CREATE TRIGGER trg_modifier_snooze_resync
  AFTER INSERT OR UPDATE OF snoozed_until ON public.location_modifier_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.notify_item_snooze_change();
