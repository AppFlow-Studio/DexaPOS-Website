-- [86] Add modifier_group_id to get_active_snoozes modifier rows.
--
-- The "86'd Items" page groups snoozed modifier OPTIONS under their parent group
-- (one "Restore group" action per group), and the group snooze is stored as a
-- fan-out over options (set_modifier_group_snooze_v1). Returning the group id lets
-- the client collapse a wholly-86'd group into a single block and call the
-- group-level restore. Purely additive — one extra field on each modifier row.

CREATE OR REPLACE FUNCTION public.get_active_snoozes(
  p_location_id uuid
) RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  result json;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to view snoozes for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'items', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'kind', 'item',
          'menu_item_id', lio.menu_item_id,
          'name', mi.name,
          'image', mi.image,
          'snoozed_until', lio.snoozed_until,
          'snooze_reason', lio.snooze_reason,
          'updated_at', lio.updated_at
        ) ORDER BY mi.name
      ), '[]'::json)
      FROM public.location_item_overrides lio
      JOIN public.menu_items mi ON mi.id = lio.menu_item_id
      WHERE lio.location_id = p_location_id
        AND lio.snoozed_until IS NOT NULL
        AND lio.snoozed_until > now()
    ),
    'modifiers', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'kind', 'modifier',
          'modifier_group_item_id', lmio.modifier_group_item_id,
          'modifier_group_id', mg.id,
          'name', mgi.name,
          'group_name', mg.name,
          'snoozed_until', lmio.snoozed_until,
          'snooze_reason', lmio.snooze_reason,
          'updated_at', lmio.updated_at
        ) ORDER BY mg.name, mgi.name
      ), '[]'::json)
      FROM public.location_modifier_item_overrides lmio
      JOIN public.modifier_group_items mgi ON mgi.id = lmio.modifier_group_item_id
      JOIN public.modifier_groups mg ON mg.id = mgi.modifier_group_id
      WHERE lmio.location_id = p_location_id
        AND lmio.snoozed_until IS NOT NULL
        AND lmio.snoozed_until > now()
    )
  )
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_snoozes(uuid) TO authenticated, service_role;
