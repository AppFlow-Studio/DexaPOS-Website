-- [86] Group-level out-of-stock (snooze) for a whole modifier group.
--
-- A merchant can 86 an entire modifier group ("Make it a meal") at a location,
-- not just individual options. There is no group-level snooze column; instead
-- this snoozes EVERY option in the group in one statement by writing
-- snoozed_until to location_modifier_item_overrides for each modifier_group_item.
--
-- Why fan out to options (vs a new group column):
--   * get_menu_with_categories already folds per-option snooze into each option's
--     effective is_active, and the OrderOut transform + storefront already respect
--     that. So snoozing every option makes the whole group disappear from POS,
--     storefront, and delivery apps with ZERO changes to that large, blast-radius
--     RPC. One RPC call = one atomic write = one resync.
--
-- Mirrors set_modifier_snooze_v1 (auth, merchant resolution, upsert shape).
-- snoozed_until contract: NULL = restore, future ts = timed, 'infinity' = manual.

CREATE OR REPLACE FUNCTION public.set_modifier_group_snooze_v1(
  p_location_id       uuid,
  p_modifier_group_id uuid,
  p_snoozed_until     timestamptz,
  p_reason            text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_count       integer;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to snooze modifiers for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT mg.merchant_id
  INTO v_merchant_id
  FROM public.modifier_groups mg
  WHERE mg.id = p_modifier_group_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Modifier group not found: %', p_modifier_group_id;
  END IF;

  -- Upsert the snooze onto every option in the group at this location.
  INSERT INTO public.location_modifier_item_overrides AS lmio
        (location_id, modifier_group_item_id, merchant_id, snoozed_until, snooze_reason, updated_at)
  SELECT p_location_id, mgi.id, v_merchant_id, p_snoozed_until, p_reason, now()
  FROM public.modifier_group_items mgi
  WHERE mgi.modifier_group_id = p_modifier_group_id
  ON CONFLICT (location_id, modifier_group_item_id) DO UPDATE
    SET snoozed_until = EXCLUDED.snoozed_until,
        snooze_reason = EXCLUDED.snooze_reason,
        updated_at    = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'modifier_group_id', p_modifier_group_id,
    'location_id',       p_location_id,
    'snoozed_until',     p_snoozed_until,
    'options_affected',  v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_modifier_group_snooze_v1(uuid, uuid, timestamptz, text)
  TO authenticated, service_role;
