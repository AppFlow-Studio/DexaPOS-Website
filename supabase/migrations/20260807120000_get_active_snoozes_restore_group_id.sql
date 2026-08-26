-- [86] Restore modifier_group_id on get_active_snoozes modifier rows.
--
-- Regression: 20260717120100 added 'modifier_group_id', mg.id to the modifiers
-- block. 20260720180000 (category 86ing) then CREATE OR REPLACE'd the same
-- function to append the `categories` array, but rebuilt the modifiers block
-- from the pre-20260717120100 text -- silently dropping the field again.
--
-- Symptom on "86'd Items": every snoozed option arrives with modifier_group_id
-- undefined, so the client's group-collapse keys each option into its own
-- bucket. A group with three 86'd options renders as three identical
-- "Milk Options -- 1 out of stock" blocks instead of one block of three, and
-- the group-level "Restore group" action has no id to call.
--
-- This is the 20260720180000 definition VERBATIM (categories array, auth check,
-- ordering all unchanged) with the single missing field re-added.

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
          -- Re-added: dropped by the 20260720180000 CREATE OR REPLACE.
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
    ),
    'categories', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'kind', 'category',
          'category_id', lco.category_id,
          'name', c.name,
          'image', c.image,
          'snoozed_until', lco.snoozed_until,
          'snooze_reason', lco.snooze_reason,
          'updated_at', lco.updated_at
        ) ORDER BY c.name
      ), '[]'::json)
      FROM public.location_category_overrides lco
      JOIN public.categories c ON c.id = lco.category_id
      WHERE lco.location_id = p_location_id
        AND lco.snoozed_until IS NOT NULL
        AND lco.snoozed_until > now()
    )
  )
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_snoozes(uuid) TO authenticated, service_role;
