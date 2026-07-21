-- ============================================================================
-- Perf: batch the storefront menu fetch into a single round-trip.
--
-- The storefront fetched menus by calling get_menu_with_categories() once PER
-- menu from the app (Promise.all of N Supabase RPCs). For a store with ~15
-- menus that is ~15 network round-trips to the DB, and it dominated the
-- storefront-root render time.
--
-- get_menus_for_location() runs the same per-menu logic entirely inside Postgres
-- and returns all menus in one call — 15 round-trips collapse to 1. It reuses
-- the existing get_menu_with_categories() verbatim, so the (intricate) pricing
-- cascade and availability logic stays identical; this is purely a batching
-- wrapper. Menu selection matches the app's previous query exactly:
--   merchant_id = p_merchant_id
--   AND is_active = true
--   AND (location_id IS NULL OR location_id = p_location_id)
--   ORDER BY display_order
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_menus_for_location(
  p_merchant_id uuid,
  p_location_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    json_agg(
      public.get_menu_with_categories(m.id, p_location_id)
      ORDER BY m.display_order ASC NULLS LAST, m.name ASC
    ),
    '[]'::json
  )
  FROM public.menus m
  WHERE m.merchant_id = p_merchant_id
    AND m.is_active = true
    AND (m.location_id IS NULL OR m.location_id = p_location_id);
$function$;

GRANT EXECUTE ON FUNCTION public.get_menus_for_location(uuid, uuid) TO anon, authenticated, service_role;
