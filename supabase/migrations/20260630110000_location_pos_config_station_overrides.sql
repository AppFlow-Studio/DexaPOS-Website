-- [POS/Web] Location-level POS Settings surface + per-station overrides
-- Web/dashboard backend contract only: location defaults in locations.pos_config,
-- station overrides in stations.pos_config_overrides, and one effective resolver.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS pos_config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.stations.pos_config_overrides IS
  'Station-level POS config overrides. Merged over locations.pos_config by get_effective_pos_config().';

CREATE OR REPLACE FUNCTION public.pos_config_deep_merge(
  p_base jsonb,
  p_overlay jsonb
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb := COALESCE(p_base, '{}'::jsonb);
  v_key text;
  v_value jsonb;
BEGIN
  IF p_overlay IS NULL THEN
    RETURN v_result;
  END IF;

  IF jsonb_typeof(v_result) <> 'object' OR jsonb_typeof(p_overlay) <> 'object' THEN
    RETURN p_overlay;
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_overlay)
  LOOP
    IF
      v_result ? v_key
      AND jsonb_typeof(v_result -> v_key) = 'object'
      AND jsonb_typeof(v_value) = 'object'
    THEN
      v_result := jsonb_set(
        v_result,
        ARRAY[v_key],
        public.pos_config_deep_merge(v_result -> v_key, v_value),
        true
      );
    ELSE
      v_result := jsonb_set(v_result, ARRAY[v_key], v_value, true);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_pos_config_v1()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT '{
    "_schema": "pos_config_v1",
    "_version": 0,
    "printing": {
      "showTaxBreakdown": true,
      "showItemizedList": true,
      "showTipOptions": true,
      "footerMessage": "",
      "showGuestCount": true,
      "showCourseNumber": true
    },
    "payment": {
      "cashEnabled": true,
      "splitByItem": true,
      "splitEvenly": true,
      "splitByAmount": true
    },
    "display": {
      "uiScale": "comfortable",
      "appTheme": "system"
    },
    "notifications": {
      "soundEnabled": true,
      "volume": 70
    }
  }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_pos_config_for_location(
  p_location_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    auth.role() = 'service_role'
    OR public.user_has_location_permission(p_location_id, 'location.manage'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_pos_config_for_location(
  p_location_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.get_effective_pos_config(
  p_station_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_location_id uuid;
  v_location_config jsonb;
  v_station_overrides jsonb;
BEGIN
  SELECT
    s.location_id,
    COALESCE(l.pos_config, '{}'::jsonb),
    COALESCE(s.pos_config_overrides, '{}'::jsonb)
  INTO v_location_id, v_location_config, v_station_overrides
  FROM public.stations s
  JOIN public.locations l ON l.id = s.location_id
  WHERE s.id = p_station_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found: %', p_station_id;
  END IF;

  IF NOT public.can_view_pos_config_for_location(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to view POS config for station %', p_station_id
      USING ERRCODE = '42501';
  END IF;

  RETURN public.pos_config_deep_merge(
    public.pos_config_deep_merge(public.default_pos_config_v1(), v_location_config),
    v_station_overrides
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_location_pos_config_v1(
  p_location_id uuid,
  p_pos_config jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_existing jsonb;
  v_next jsonb;
  v_version integer;
BEGIN
  IF NOT public.can_manage_pos_config_for_location(p_location_id) THEN
    RAISE EXCEPTION 'Not authorized to update POS config for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pos_config, '{}'::jsonb)
  INTO v_existing
  FROM public.locations
  WHERE id = p_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_version := CASE
    WHEN COALESCE(v_existing ->> '_version', '') ~ '^[0-9]+$'
      THEN (v_existing ->> '_version')::integer
    ELSE 0
  END;

  v_next := public.pos_config_deep_merge(
    public.pos_config_deep_merge(public.default_pos_config_v1(), v_existing),
    COALESCE(p_pos_config, '{}'::jsonb)
  );
  v_next := jsonb_set(v_next, '{_schema}', to_jsonb('pos_config_v1'::text), true);
  v_next := jsonb_set(v_next, '{_version}', to_jsonb(v_version + 1), true);
  v_next := jsonb_set(v_next, '{_updated_at}', to_jsonb(now()::text), true);

  UPDATE public.locations
  SET pos_config = v_next,
      updated_at = now()
  WHERE id = p_location_id
  RETURNING pos_config INTO v_next;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_station_pos_config_overrides_v1(
  p_station_id uuid,
  p_overrides jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_location_id uuid;
  v_next jsonb;
BEGIN
  SELECT location_id
  INTO v_location_id
  FROM public.stations
  WHERE id = p_station_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found: %', p_station_id;
  END IF;

  IF NOT public.can_manage_pos_config_for_location(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to update POS config overrides for station %', p_station_id
      USING ERRCODE = '42501';
  END IF;

  -- V1 intentionally limits per-station overrides to visual/audio settings.
  v_next := '{}'::jsonb;
  IF COALESCE(p_overrides, '{}'::jsonb) ? 'display' THEN
    v_next := jsonb_set(v_next, '{display}', p_overrides -> 'display', true);
  END IF;
  IF COALESCE(p_overrides, '{}'::jsonb) ? 'notifications' THEN
    v_next := jsonb_set(v_next, '{notifications}', p_overrides -> 'notifications', true);
  END IF;

  UPDATE public.stations
  SET pos_config_overrides = v_next,
      updated_at = now()
  WHERE id = p_station_id
  RETURNING pos_config_overrides INTO v_next;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_config_deep_merge(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_pos_config_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_pos_config_for_location(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_pos_config_for_location(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_pos_config(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_location_pos_config_v1(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_station_pos_config_overrides_v1(uuid, jsonb) TO authenticated, service_role;
