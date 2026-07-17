-- [86] Auto-restore items when a TIMED out-of-stock snooze expires.
--
-- Marking out of stock couples is_available -> false (product decision). A timed
-- snooze auto-expires (snoozed_until <= now()), but is_available would otherwise
-- stay false, so the item would never return on its own. This scheduled job
-- mirrors "Restore": it flips is_available back on and clears the expired snooze.
--
-- 'infinity' (until-manually-restored) snoozes are never touched — they are always
-- > now(), so they only clear via an explicit Restore. Runs every 5 minutes, so an
-- item returns within ~5 min of its timer (Uber Eats already auto-restores at
-- suspend_until on the delivery side).

CREATE OR REPLACE FUNCTION public.restore_expired_item_snoozes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  -- Items: coupling set is_available=false on 86; restore it + clear the expired snooze.
  UPDATE public.location_item_overrides
     SET is_available = true,
         snoozed_until = NULL,
         updated_at = now()
   WHERE snoozed_until IS NOT NULL
     AND snoozed_until <= now();

  -- Modifiers: is_active was not coupled; just clear the expired snooze (housekeeping,
  -- and bumps updated_at for delta sync).
  UPDATE public.location_modifier_item_overrides
     SET snoozed_until = NULL,
         updated_at = now()
   WHERE snoozed_until IS NOT NULL
     AND snoozed_until <= now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_expired_item_snoozes() TO service_role;

-- Schedule every 5 minutes (idempotent: drop any prior schedule of the same name).
DO $$
BEGIN
  PERFORM cron.unschedule('restore-expired-item-snoozes');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'restore-expired-item-snoozes',
  '*/5 * * * *',
  $cron$SELECT public.restore_expired_item_snoozes()$cron$
);
