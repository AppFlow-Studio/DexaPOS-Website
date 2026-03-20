-- ============================================================================
-- Device Registry Foundation Validation
-- Part 2: Behavioral Checks
-- Safe to run in SQL editor: fixture writes are wrapped in a transaction/rollback
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_hq_user_id            text;
  v_catalog_id            uuid;
  v_merchant_id           uuid;
  v_location_id           uuid;
  v_station_id            uuid;
  v_device_id             uuid;
  v_duplicate_failed      boolean := false;
  v_update_failed         boolean := false;
  v_delete_failed         boolean := false;
  v_result                jsonb;
  v_linked_station_after  uuid;
  v_view_row_count        integer;
BEGIN
  SELECT m.user_id
  INTO v_hq_user_id
  FROM public.members m
  JOIN public.roles r ON r.code = m.role
  WHERE r.organization_type = 'hq'
  ORDER BY m.created_at NULLS LAST
  LIMIT 1;

  IF v_hq_user_id IS NULL THEN
    RAISE EXCEPTION 'Validation failed: no HQ user found for request.jwt.claims emulation';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_hq_user_id)::text,
    true
  );

  SELECT dc.id
  INTO v_catalog_id
  FROM public.device_catalog dc
  WHERE dc.device_category = 'pos_tablet'
  ORDER BY dc.created_at
  LIMIT 1;

  IF v_catalog_id IS NULL THEN
    RAISE EXCEPTION 'Validation failed: no device_catalog row found for pos_tablet';
  END IF;

  SELECT l.merchant_id, l.id
  INTO v_merchant_id, v_location_id
  FROM public.locations l
  ORDER BY l.created_at NULLS LAST, l.name
  LIMIT 1;

  IF v_merchant_id IS NULL OR v_location_id IS NULL THEN
    RAISE EXCEPTION 'Validation failed: no merchant/location pair exists';
  END IF;

  SELECT s.id
  INTO v_station_id
  FROM public.stations s
  WHERE s.merchant_id = v_merchant_id
    AND s.location_id = v_location_id
  ORDER BY s.created_at NULLS LAST, s.station_name
  LIMIT 1;

  INSERT INTO public.device_inventory (
    catalog_id,
    serial_number,
    status,
    condition,
    created_by
  )
  VALUES (
    v_catalog_id,
    'VALIDATION-DEVICE-046',
    'in_warehouse',
    'new',
    'validation-script'
  )
  RETURNING id INTO v_device_id;

  BEGIN
    INSERT INTO public.device_inventory (
      catalog_id,
      serial_number,
      status,
      condition,
      created_by
    )
    VALUES (
      v_catalog_id,
      'VALIDATION-DEVICE-046',
      'in_warehouse',
      'new',
      'validation-script'
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_duplicate_failed := true;
  END;

  IF NOT v_duplicate_failed THEN
    RAISE EXCEPTION 'Validation failed: unique serial per catalog constraint did not fire';
  END IF;

  UPDATE public.device_inventory
  SET linked_station_id = v_station_id
  WHERE id = v_device_id
    AND v_station_id IS NOT NULL;

  INSERT INTO public.device_notes (
    device_id,
    note_type,
    content,
    created_by,
    created_by_name
  )
  VALUES (
    v_device_id,
    'general',
    'Validation note',
    'validation-script',
    'Validation Script'
  );

  v_result := public.assign_device(
    v_device_id,
    'allocated',
    v_merchant_id,
    NULL,
    NULL,
    'validation allocated',
    '046 validation'
  );

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation failed: allocated transition rejected: %', v_result::text;
  END IF;

  v_result := public.assign_device(
    v_device_id,
    'shipped',
    v_merchant_id,
    NULL,
    'TRACK-046',
    'validation shipped',
    '046 validation'
  );

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation failed: shipped transition rejected: %', v_result::text;
  END IF;

  v_result := public.assign_device(
    v_device_id,
    'provisioning',
    v_merchant_id,
    v_location_id,
    NULL,
    'validation provisioning',
    '046 validation'
  );

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation failed: provisioning transition rejected: %', v_result::text;
  END IF;

  v_result := public.assign_device(
    v_device_id,
    'deployed',
    v_merchant_id,
    v_location_id,
    NULL,
    'validation deployed',
    '046 validation'
  );

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation failed: deployed transition rejected: %', v_result::text;
  END IF;

  UPDATE public.device_inventory
  SET linked_station_id = v_station_id
  WHERE id = v_device_id
    AND v_station_id IS NOT NULL;

  v_result := public.assign_device(
    v_device_id,
    'in_repair',
    NULL,
    NULL,
    NULL,
    'validation repair',
    '046 validation'
  );

  IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Validation failed: in_repair transition rejected: %', v_result::text;
  END IF;

  SELECT linked_station_id
  INTO v_linked_station_after
  FROM public.device_inventory
  WHERE id = v_device_id;

  IF v_station_id IS NOT NULL AND v_linked_station_after IS NOT NULL THEN
    RAISE EXCEPTION 'Validation failed: linked_station_id was not cleared on in_repair';
  END IF;

  v_result := public.assign_device(
    v_device_id,
    'shipped',
    v_merchant_id,
    NULL,
    NULL,
    'validation invalid',
    '046 validation'
  );

  IF COALESCE((v_result->>'success')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'Validation failed: invalid transition unexpectedly succeeded: %', v_result::text;
  END IF;

  BEGIN
    UPDATE public.device_assignments
    SET notes = 'should fail'
    WHERE device_id = v_device_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_update_failed := true;
  END;

  IF NOT v_update_failed THEN
    RAISE EXCEPTION 'Validation failed: append-only update guard did not fire for device_assignments';
  END IF;

  BEGIN
    DELETE FROM public.device_notes
    WHERE device_id = v_device_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_delete_failed := true;
  END;

  IF NOT v_delete_failed THEN
    RAISE EXCEPTION 'Validation failed: append-only delete guard did not fire for device_notes';
  END IF;

  SELECT COUNT(*)
  INTO v_view_row_count
  FROM public.admin_device_inventory
  WHERE id = v_device_id;

  IF v_view_row_count <> 1 THEN
    RAISE EXCEPTION 'Validation failed: admin_device_inventory did not expose inserted device';
  END IF;

  RAISE NOTICE '046 validation passed for device %, merchant %, location %', v_device_id, v_merchant_id, v_location_id;
END
$$;

ROLLBACK;
