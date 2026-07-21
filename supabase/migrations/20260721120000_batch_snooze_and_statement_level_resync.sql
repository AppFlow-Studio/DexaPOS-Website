-- [POS/Web] Batch 86 + statement-level OrderOut resync.
--
-- 1) set_items_snooze_batch_v1: 86 (or restore) many items at a location in ONE
--    statement, with the availability coupling folded in (86 -> unavailable,
--    restore -> available) so it stays atomic. Mirrors set_item_snooze_v1's
--    upsert + auth guard.
--
-- 2) The snooze -> OrderOut resync trigger is converted from FOR EACH ROW to FOR
--    EACH STATEMENT (transition tables). A single multi-row statement (a batch 86,
--    or a whole-group modifier 86) now fires ONE resync POST per location instead
--    of N — no more re-push storm. Config lookup (Vault first, GUC fallback) and
--    the payload are unchanged from 20260718130000; only the granularity changes.

-- ============================================================================
-- 1. Batch item snooze RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_items_snooze_batch_v1(
  p_location_id   uuid,
  p_menu_item_ids uuid[],
  p_snoozed_until timestamptz,   -- NULL = restore; future ts = timed; 'infinity' = until manual
  p_reason        text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to snooze items for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  IF p_menu_item_ids IS NULL OR array_length(p_menu_item_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- One multi-row upsert = one statement -> the statement-level resync trigger
  -- below fires a SINGLE OrderOut re-push for the whole batch.
  INSERT INTO public.location_item_overrides AS lio
        (location_id, menu_item_id, snoozed_until, snooze_reason, is_available, updated_at)
  SELECT p_location_id, mid, p_snoozed_until, p_reason, (p_snoozed_until IS NULL), now()
  FROM unnest(p_menu_item_ids) AS mid
  ON CONFLICT (location_id, menu_item_id) DO UPDATE
    SET snoozed_until = EXCLUDED.snoozed_until,
        snooze_reason = EXCLUDED.snooze_reason,
        is_available  = EXCLUDED.is_available,
        updated_at    = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_items_snooze_batch_v1(uuid, uuid[], timestamptz, text)
  TO authenticated, service_role;

-- ============================================================================
-- 2. Statement-level resync trigger (one POST per changed location per statement)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_item_snooze_change_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  resync_url    text;
  resync_secret text;
  loc_ids       uuid[];
  loc           uuid;
BEGIN
  -- Locations whose snooze state ACTUALLY changed in this statement. The UPDATE
  -- trigger fires on any column (transition tables forbid a column list), so we
  -- filter here instead. Empty -> nothing snooze-related happened, bail before the
  -- Vault reads so ordinary override edits pay ~nothing.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT location_id) INTO loc_ids
    FROM newtab WHERE snoozed_until IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT n.location_id) INTO loc_ids
    FROM newtab n
    JOIN oldtab o ON o.id = n.id
    WHERE n.snoozed_until IS DISTINCT FROM o.snoozed_until;
  END IF;

  IF loc_ids IS NULL OR array_length(loc_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Prefer Vault (settable by the postgres role); fall back to the shared GUCs.
  SELECT nullif(ds.decrypted_secret, '') INTO resync_url
  FROM vault.decrypted_secrets ds WHERE ds.name = 'orderout_resync_url' LIMIT 1;
  resync_url := coalesce(resync_url, nullif(current_setting('app.orderout_resync_url', true), ''));

  SELECT nullif(ds.decrypted_secret, '') INTO resync_secret
  FROM vault.decrypted_secrets ds WHERE ds.name = 'internal_notification_secret' LIMIT 1;
  resync_secret := coalesce(resync_secret, nullif(current_setting('app.notify_secret', true), ''));

  -- No config yet -> no-op (safe to deploy before the secrets/route exist).
  IF resync_url IS NULL OR resync_secret IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH loc IN ARRAY loc_ids LOOP
    PERFORM net.http_post(
      url := resync_url,
      body := jsonb_build_object('location_id', loc, 'reason', 'snooze_change'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', resync_secret
      )
    );
  END LOOP;

  RETURN NULL;
END;
$$;

-- Replace the per-row triggers with per-statement ones (INSERT + UPDATE split so
-- the UPDATE trigger can declare both transition tables). NOTE: a statement-level
-- trigger with transition tables CANNOT use an "UPDATE OF <col>" column list
-- (Postgres 0A000), so the UPDATE trigger fires on every update and the function
-- filters to actual snoozed_until changes.
DROP TRIGGER IF EXISTS trg_item_snooze_resync ON public.location_item_overrides;
DROP TRIGGER IF EXISTS trg_item_snooze_resync_ins ON public.location_item_overrides;
DROP TRIGGER IF EXISTS trg_item_snooze_resync_upd ON public.location_item_overrides;

CREATE TRIGGER trg_item_snooze_resync_ins
  AFTER INSERT ON public.location_item_overrides
  REFERENCING NEW TABLE AS newtab
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_item_snooze_change_stmt();

CREATE TRIGGER trg_item_snooze_resync_upd
  AFTER UPDATE ON public.location_item_overrides
  REFERENCING OLD TABLE AS oldtab NEW TABLE AS newtab
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_item_snooze_change_stmt();

DROP TRIGGER IF EXISTS trg_modifier_snooze_resync ON public.location_modifier_item_overrides;
DROP TRIGGER IF EXISTS trg_modifier_snooze_resync_ins ON public.location_modifier_item_overrides;
DROP TRIGGER IF EXISTS trg_modifier_snooze_resync_upd ON public.location_modifier_item_overrides;

CREATE TRIGGER trg_modifier_snooze_resync_ins
  AFTER INSERT ON public.location_modifier_item_overrides
  REFERENCING NEW TABLE AS newtab
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_item_snooze_change_stmt();

CREATE TRIGGER trg_modifier_snooze_resync_upd
  AFTER UPDATE ON public.location_modifier_item_overrides
  REFERENCING OLD TABLE AS oldtab NEW TABLE AS newtab
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_item_snooze_change_stmt();
