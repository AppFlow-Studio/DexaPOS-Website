-- [OrderOut] Designate the canonical online-ordering menu for a location.
-- Swap-safe (unset current primary, then set target) so the one-primary-per-
-- restaurant partial unique index (uq_oo_menu_links_primary) is never transiently
-- violated. Permission-checked; the menu must already be linked + active.

CREATE OR REPLACE FUNCTION public.set_primary_online_menu_v1(
  p_location_id uuid,
  p_menu_id     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_restaurant_id uuid;
  v_link_exists   boolean;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.is_location_member(p_location_id)
    OR public.user_has_location_permission(p_location_id, 'location.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to set the online menu for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_restaurant_id
  FROM public.orderout_restaurants
  WHERE location_id = p_location_id;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Location % is not onboarded to OrderOut', p_location_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orderout_menu_links
    WHERE orderout_restaurant_id = v_restaurant_id
      AND menu_id = p_menu_id
      AND is_active
  ) INTO v_link_exists;

  IF NOT v_link_exists THEN
    RAISE EXCEPTION 'Menu % is not linked/active on OrderOut for this location', p_menu_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orderout_menu_links
     SET is_primary = false, updated_at = now()
   WHERE orderout_restaurant_id = v_restaurant_id AND is_primary;

  UPDATE public.orderout_menu_links
     SET is_primary = true, updated_at = now()
   WHERE orderout_restaurant_id = v_restaurant_id
     AND menu_id = p_menu_id
     AND is_active;

  RETURN jsonb_build_object(
    'orderout_restaurant_id', v_restaurant_id,
    'menu_id', p_menu_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_primary_online_menu_v1(uuid, uuid) TO authenticated, service_role;
