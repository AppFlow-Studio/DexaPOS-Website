-- Fix archive_location RPC: cash_drawer_sessions.notes does not exist.
-- The actual column on cash_drawer_sessions is variance_notes. The original RPC
-- (20260503000000_archive_location_rpc.sql) referenced a non-existent column,
-- so archiving any location whose drawer had open sessions failed with
-- 42703 "column \"notes\" does not exist".

CREATE OR REPLACE FUNCTION archive_location(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id uuid;
  v_location_name text;
  v_active_count integer;
BEGIN
  SELECT merchant_id, name
  INTO v_merchant_id, v_location_name
  FROM locations
  WHERE id = p_location_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Location not found');
  END IF;

  -- Every merchant must keep at least one active location
  SELECT COUNT(*)
  INTO v_active_count
  FROM locations
  WHERE merchant_id = v_merchant_id
    AND is_active = true
    AND id <> p_location_id;

  IF v_active_count = 0 THEN
    RETURN jsonb_build_object(
      'error',
      'Cannot archive the only active location. Add or activate another location first.'
    );
  END IF;

  -- Archive the location
  UPDATE locations
  SET is_active           = false,
      is_accepting_orders = false,
      updated_at          = now()
  WHERE id = p_location_id;

  -- Deactivate members who are scoped exclusively to this location
  UPDATE location_members lm
  SET is_active = false
  WHERE lm.location_id = p_location_id
    AND lm.is_active   = true
    AND NOT EXISTS (
      SELECT 1
      FROM location_members lm2
      WHERE lm2.user_id      = lm.user_id
        AND lm2.location_id <> p_location_id
        AND lm2.is_active    = true
    );

  -- Flag open cash drawer sessions so the merchant can close them out manually.
  -- Was previously writing to a non-existent `notes` column.
  UPDATE cash_drawer_sessions
  SET variance_notes = COALESCE(variance_notes || ' ', '') || '[Location archived – close-out required]'
  WHERE location_id = p_location_id
    AND status      = 'open';

  RETURN jsonb_build_object('success', true, 'name', v_location_name);
END;
$$;
