-- Floor plan RPCs: allow HQ admins with an active impersonation session to
-- pass merchant-scope checks. The original guards used `user_merchant_id()`,
-- which resolves strictly via `staff_profiles.user_id = clerk sub` and
-- therefore returns NULL for an HQ admin impersonating a merchant — causing
-- "Floor plan not found" / "Object not found or access denied" the moment an
-- impersonating admin tried to add or move tables.
--
-- Replace the guard with `is_merchant_admin_or_impersonating(merchant_id)`,
-- the existing helper introduced in 20260504122349_hq_merchant_impersonation.sql.
-- Function signatures, return shapes, and SECURITY DEFINER settings are
-- preserved so callers do not change.

CREATE OR REPLACE FUNCTION public.add_floor_plan_object(
  p_floor_plan_id uuid,
  p_name text,
  p_shape_id text,
  p_category public.floor_object_category,
  p_x numeric DEFAULT 100,
  p_y numeric DEFAULT 100,
  p_rotation numeric DEFAULT 0,
  p_capacity integer DEFAULT NULL,
  p_width numeric DEFAULT NULL,
  p_height numeric DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $$
DECLARE
  v_floor_plan RECORD;
  v_object_id uuid;
BEGIN
  SELECT fp.*, fp.merchant_id, fp.location_id
  INTO v_floor_plan
  FROM public.floor_plans fp
  WHERE fp.id = p_floor_plan_id
    AND public.is_merchant_admin_or_impersonating(fp.merchant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Floor plan not found';
  END IF;

  INSERT INTO public.floor_plan_objects (
    floor_plan_id, merchant_id, location_id,
    name, shape_id, category,
    x, y, rotation,
    capacity, width, height
  ) VALUES (
    p_floor_plan_id, v_floor_plan.merchant_id, v_floor_plan.location_id,
    p_name, p_shape_id, p_category,
    p_x, p_y, p_rotation,
    p_capacity, p_width, p_height
  )
  RETURNING id INTO v_object_id;

  RETURN json_build_object(
    'success', true,
    'object_id', v_object_id,
    'name', p_name,
    'shape_id', p_shape_id
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.update_floor_plan_object_position(
  p_object_id uuid,
  p_x numeric,
  p_y numeric,
  p_rotation numeric DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.floor_plan_objects
  SET
    x = p_x,
    y = p_y,
    rotation = COALESCE(p_rotation, rotation),
    updated_at = NOW()
  WHERE id = p_object_id
    AND public.is_merchant_admin_or_impersonating(merchant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Object not found or access denied';
  END IF;

  RETURN json_build_object(
    'success', true,
    'object_id', p_object_id,
    'x', p_x,
    'y', p_y,
    'rotation', p_rotation
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.update_floor_plan_objects_batch(
  p_updates jsonb
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $$
DECLARE
  v_update jsonb;
  v_updated_count integer := 0;
BEGIN
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE public.floor_plan_objects
    SET
      x = (v_update->>'x')::numeric,
      y = (v_update->>'y')::numeric,
      rotation = COALESCE((v_update->>'rotation')::numeric, rotation),
      updated_at = NOW()
    WHERE id = (v_update->>'id')::uuid
      AND public.is_merchant_admin_or_impersonating(merchant_id);

    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_floor_plan_status(
  p_floor_plan_id uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'floor_plan_id', p_floor_plan_id,
      'timestamp', NOW(),
      'tables', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'id', fpo.id,
            'name', fpo.name,
            'shape_id', fpo.shape_id,
            'category', fpo.category,
            'x', fpo.x,
            'y', fpo.y,
            'rotation', fpo.rotation,
            'capacity', fpo.capacity,
            'is_active', fpo.is_active,
            'session', (
              SELECT json_build_object(
                'id', ts.id,
                'session_number', ts.session_number,
                'status', ts.status,
                'party_size', ts.party_size,
                'guest_name', ts.guest_name,
                'server_staff_id', ts.server_staff_id,
                'order_id', ts.order_id,
                'seated_at', ts.seated_at,
                'current_course', ts.current_course,
                'needs_attention', ts.needs_attention,
                'is_vip', ts.is_vip,
                'minutes_seated', EXTRACT(EPOCH FROM (NOW() - ts.seated_at)) / 60,
                'merged_tables', (
                  SELECT json_agg(tst2.table_id)
                  FROM public.table_session_tables tst2
                  WHERE tst2.session_id = ts.id AND tst2.table_id != fpo.id
                )
              )
              FROM public.table_sessions ts
              JOIN public.table_session_tables tst ON tst.session_id = ts.id
              WHERE tst.table_id = fpo.id AND ts.is_active = TRUE
            ),
            'next_reservation', (
              SELECT json_build_object(
                'id', r.id,
                'party_name', r.party_name,
                'party_size', r.party_size,
                'time', r.reservation_time,
                'status', r.status
              )
              FROM public.reservations r
              WHERE r.assigned_table_ids @> ARRAY[fpo.id]
                AND r.reservation_date = CURRENT_DATE
                AND r.status IN ('pending', 'confirmed', 'reminded')
              ORDER BY r.reservation_time
              LIMIT 1
            )
          )
        ), '[]'::json)
        FROM public.floor_plan_objects fpo
        WHERE fpo.floor_plan_id = p_floor_plan_id
          AND fpo.category IN ('table', 'booth')
          AND fpo.is_active = TRUE
      ),
      'summary', (
        SELECT json_build_object(
          'total_tables', COUNT(*),
          'available', COUNT(*) FILTER (WHERE session_id IS NULL),
          'occupied', COUNT(*) FILTER (WHERE session_id IS NOT NULL),
          'total_capacity', SUM(capacity),
          'current_covers', SUM(COALESCE(party_size, 0))
        )
        FROM (
          SELECT
            fpo.id,
            fpo.capacity,
            ts.id as session_id,
            ts.party_size
          FROM public.floor_plan_objects fpo
          LEFT JOIN public.table_session_tables tst ON tst.table_id = fpo.id
          LEFT JOIN public.table_sessions ts ON ts.id = tst.session_id AND ts.is_active = TRUE
          WHERE fpo.floor_plan_id = p_floor_plan_id
            AND fpo.category IN ('table', 'booth')
            AND fpo.is_active = TRUE
        ) sub
      )
    )
    FROM public.floor_plans fp
    WHERE fp.id = p_floor_plan_id
      AND public.is_merchant_admin_or_impersonating(fp.merchant_id)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_location_floor_plans(
  p_location_id uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'id', fp.id,
        'name', fp.name,
        'description', fp.description,
        'is_active', fp.is_active,
        'is_default', fp.is_default,
        'display_order', fp.display_order,
        'table_count', (
          SELECT COUNT(*) FROM public.floor_plan_objects fpo
          WHERE fpo.floor_plan_id = fp.id AND fpo.category IN ('table', 'booth')
        ),
        'total_capacity', (
          SELECT COALESCE(SUM(fpo.capacity), 0) FROM public.floor_plan_objects fpo
          WHERE fpo.floor_plan_id = fp.id AND fpo.category IN ('table', 'booth')
        ),
        'objects', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', fpo.id,
              'name', fpo.name,
              'shape_id', fpo.shape_id,
              'category', fpo.category,
              'x', fpo.x,
              'y', fpo.y,
              'rotation', fpo.rotation,
              'width', fpo.width,
              'height', fpo.height,
              'capacity', fpo.capacity,
              'min_capacity', fpo.min_capacity,
              'is_reservable', fpo.is_reservable,
              'is_combinable', fpo.is_combinable,
              'default_turn_time', fpo.default_turn_time,
              'section_id', fpo.section_id,
              'zone_name', fpo.zone_name,
              'label_override', fpo.label_override,
              'color_override', fpo.color_override,
              'z_index', fpo.z_index,
              'is_visible', fpo.is_visible,
              'is_active', fpo.is_active
            ) ORDER BY fpo.z_index ASC, fpo.created_at ASC
          ), '[]'::json)
          FROM public.floor_plan_objects fpo
          WHERE fpo.floor_plan_id = fp.id
        )
      ) ORDER BY fp.display_order, fp.name
    ), '[]'::json)
    FROM public.floor_plans fp
    WHERE fp.location_id = p_location_id
      AND public.is_merchant_admin_or_impersonating(fp.merchant_id)
  );
END;
$$;
