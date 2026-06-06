-- Adds the KDS void-acknowledgement path:
--   - kds_item_status.acknowledged_at timestamptz
--   - kds_item_status.acknowledged_by uuid
--   - acknowledge_kds_item_void(p_order_item_id, p_kds_display_id) RPC
--   - acknowledge_kds_notice(p_order_item_id, p_kds_display_id) RPC
--
-- Mirrors the staging migrations `kds_void_acknowledgements` and
-- `kds_acknowledge_notice`. The KDS clearing screen on prod currently has
-- nowhere to send the ack, so void notices stay on screen.

ALTER TABLE public.kds_item_status
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

CREATE OR REPLACE FUNCTION public.acknowledge_kds_item_void(p_order_item_id uuid, p_kds_display_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff_id uuid;
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  SELECT sp.id
  INTO v_staff_id
  FROM public.staff_profiles sp
  WHERE sp.user_id = public.get_my_claim('sub')
    AND sp.is_active = true
  ORDER BY sp.created_at DESC
  LIMIT 1;

  UPDATE public.kds_item_status kis
  SET
    status = 'cancelled',
    acknowledged_at = NOW(),
    acknowledged_by = v_staff_id
  WHERE kis.order_item_id = p_order_item_id
    AND kis.kds_display_id = p_kds_display_id
    AND kis.status <> 'completed'
    AND kis.acknowledged_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    INSERT INTO public.kds_item_status (
      order_item_id,
      order_id,
      kds_display_id,
      status,
      acknowledged_at,
      acknowledged_by
    )
    SELECT
      oi.id,
      oi.order_id,
      p_kds_display_id,
      'cancelled',
      NOW(),
      v_staff_id
    FROM public.order_items oi
    WHERE oi.id = p_order_item_id
      AND COALESCE(oi.is_voided, false) = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_item_status existing
        WHERE existing.order_item_id = p_order_item_id
          AND existing.kds_display_id = p_kds_display_id
      );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_item_id', p_order_item_id,
    'kds_display_id', p_kds_display_id,
    'acknowledged', true,
    'updated_count', v_updated_count,
    'inserted_count', v_inserted_count,
    'acknowledged_by', v_staff_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.acknowledge_kds_notice(p_order_item_id uuid, p_kds_display_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff_id uuid;
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  SELECT sp.id
  INTO v_staff_id
  FROM public.staff_profiles sp
  WHERE sp.user_id = public.get_my_claim('sub')
    AND sp.is_active = true
  ORDER BY sp.created_at DESC
  LIMIT 1;

  -- Update existing rows. When p_kds_display_id is NULL, update all rows for this item.
  UPDATE public.kds_item_status kis
  SET
    status = 'cancelled',
    acknowledged_at = NOW(),
    acknowledged_by = v_staff_id
  WHERE kis.order_item_id = p_order_item_id
    AND kis.acknowledged_at IS NULL
    AND (p_kds_display_id IS NULL OR kis.kds_display_id = p_kds_display_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Insert a new row only when a specific display is given and no row existed yet
  IF v_updated_count = 0 AND p_kds_display_id IS NOT NULL THEN
    INSERT INTO public.kds_item_status (
      order_item_id,
      order_id,
      kds_display_id,
      status,
      acknowledged_at,
      acknowledged_by
    )
    SELECT
      oi.id,
      oi.order_id,
      p_kds_display_id,
      'cancelled',
      NOW(),
      v_staff_id
    FROM public.order_items oi
    WHERE oi.id = p_order_item_id
      AND (
        COALESCE(oi.is_voided, false) = true
        OR COALESCE(oi.refunded_quantity, 0) > 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_item_status existing
        WHERE existing.order_item_id = p_order_item_id
          AND existing.kds_display_id = p_kds_display_id
      );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_item_id', p_order_item_id,
    'kds_display_id', p_kds_display_id,
    'acknowledged', true,
    'updated_count', v_updated_count,
    'inserted_count', v_inserted_count,
    'acknowledged_by', v_staff_id
  );
END;
$function$;
