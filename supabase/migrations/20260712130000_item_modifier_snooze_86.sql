-- [POS/Web] 86ing: transient per-location snooze for items and modifiers.
-- Orthogonal to the deliberate is_available toggle owned by the menu editor:
-- a snooze means "we ran out here right now", not "we don't sell this here".
-- An item/modifier is snoozed while snoozed_until > now(). NULL = live.
-- 'infinity'::timestamptz = snoozed until manually cleared.
-- Auto-expiry is lazy: consumers evaluate `snoozed_until <= now()` at read time.

-- ============================================================================
-- 1. Schema: snooze columns
-- ============================================================================
ALTER TABLE public.location_item_overrides
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_reason text;

COMMENT ON COLUMN public.location_item_overrides.snoozed_until IS
  '86ing: item is unavailable at this location while snoozed_until > now(). '
  'NULL = not snoozed. ''infinity'' = snoozed until manually cleared. '
  'Orthogonal to is_available (manager deliberate hide).';

COMMENT ON COLUMN public.location_item_overrides.snooze_reason IS
  '86ing: optional free-text reason (e.g. "out of stock"). Surfaced in dashboard + audit.';

ALTER TABLE public.location_modifier_item_overrides
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_reason text;

COMMENT ON COLUMN public.location_modifier_item_overrides.snoozed_until IS
  '86ing: modifier is unavailable at this location while snoozed_until > now(). '
  'NULL = not snoozed. ''infinity'' = snoozed until manually cleared.';

COMMENT ON COLUMN public.location_modifier_item_overrides.snooze_reason IS
  '86ing: optional free-text reason. Surfaced in dashboard + audit.';

-- Partial indexes: only the (small) set of currently-snoozed rows.
CREATE INDEX IF NOT EXISTS idx_lio_snoozed
  ON public.location_item_overrides (location_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lmio_snoozed
  ON public.location_modifier_item_overrides (location_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

-- ============================================================================
-- 2. RPCs: snooze / un-snooze contract (called by POS and web)
-- ============================================================================

-- Item snooze. Writes ONLY snoozed_until/snooze_reason -- never is_available,
-- so a snooze/un-snooze can never collide with a manager's deliberate hide.
CREATE OR REPLACE FUNCTION public.set_item_snooze_v1(
  p_location_id   uuid,
  p_menu_item_id  uuid,
  p_snoozed_until timestamptz,   -- NULL = clear/un-86; future ts = timed; 'infinity' = until manual
  p_reason        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to snooze items for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.location_item_overrides AS lio
        (location_id, menu_item_id, snoozed_until, snooze_reason, updated_at)
  VALUES (p_location_id, p_menu_item_id, p_snoozed_until, p_reason, now())
  ON CONFLICT (location_id, menu_item_id) DO UPDATE
    SET snoozed_until = EXCLUDED.snoozed_until,
        snooze_reason = EXCLUDED.snooze_reason,
        updated_at    = now()
  RETURNING to_jsonb(lio.*) INTO v_row;

  RETURN v_row;
END;
$$;

-- Modifier snooze. location_modifier_item_overrides.merchant_id is NOT NULL,
-- so resolve it via modifier_group_items -> modifier_groups.merchant_id.
CREATE OR REPLACE FUNCTION public.set_modifier_snooze_v1(
  p_location_id             uuid,
  p_modifier_group_item_id  uuid,
  p_snoozed_until           timestamptz,
  p_reason                  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_row jsonb;
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
  FROM public.modifier_group_items mgi
  JOIN public.modifier_groups mg ON mg.id = mgi.modifier_group_id
  WHERE mgi.id = p_modifier_group_item_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Modifier not found: %', p_modifier_group_item_id;
  END IF;

  INSERT INTO public.location_modifier_item_overrides AS lmio
        (location_id, modifier_group_item_id, merchant_id, snoozed_until, snooze_reason, updated_at)
  VALUES (p_location_id, p_modifier_group_item_id, v_merchant_id, p_snoozed_until, p_reason, now())
  ON CONFLICT (location_id, modifier_group_item_id) DO UPDATE
    SET snoozed_until = EXCLUDED.snoozed_until,
        snooze_reason = EXCLUDED.snooze_reason,
        updated_at    = now()
  RETURNING to_jsonb(lmio.*) INTO v_row;

  RETURN v_row;
END;
$$;

-- Flat list of currently-active snoozes for the dashboard "86'd Items" view.
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

GRANT EXECUTE ON FUNCTION public.set_item_snooze_v1(uuid, uuid, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_modifier_snooze_v1(uuid, uuid, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_snoozes(uuid) TO authenticated, service_role;
