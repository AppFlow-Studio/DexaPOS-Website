-- ============================================================================
-- OrderOut push_menu webhook infrastructure
-- ----------------------------------------------------------------------------
-- 1. Scoped unique index on (orderout_restaurant_id, oo_menu_id) for safe
--    fallback lookup when multiple restaurants reuse the same oo_menu_id.
-- 2. Change orderout_restaurants.connected_channels default from '[]' (array)
--    to '{}' (object keyed by platform), and backfill any existing array rows.
-- 3. Atomic JSONB merge RPCs so concurrent webhook deliveries can update
--    platform_statuses / connected_channels without read-modify-write races.
-- ============================================================================

-- 1. Unique index per restaurant + oo_menu_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_oo_menu_links_restaurant_menu
  ON public.orderout_menu_links (orderout_restaurant_id, oo_menu_id);

-- 2. Flip connected_channels default to '{}' (object shape)
ALTER TABLE public.orderout_restaurants
  ALTER COLUMN connected_channels SET DEFAULT '{}'::jsonb;

-- 3. Backfill: convert any existing array-shape rows to object shape
UPDATE public.orderout_restaurants
SET connected_channels = (
  SELECT COALESCE(
    jsonb_object_agg(
      upper(x::text),
      jsonb_build_object(
        'status', 'success',
        'last_updated', now(),
        'last_error', null
      )
    ),
    '{}'::jsonb
  )
  FROM jsonb_array_elements_text(connected_channels) AS x
)
WHERE jsonb_typeof(connected_channels) = 'array';

-- 4. Atomic JSONB merge RPCs — avoid read-modify-write races on concurrent webhooks
CREATE OR REPLACE FUNCTION public.merge_orderout_platform_statuses(
  p_link_id uuid,
  p_updates jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orderout_menu_links
  SET platform_statuses = COALESCE(platform_statuses, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_link_id;
$$;

CREATE OR REPLACE FUNCTION public.merge_orderout_connected_channels(
  p_restaurant_id uuid,
  p_updates jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orderout_restaurants
  SET connected_channels = COALESCE(connected_channels, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_restaurant_id;
$$;

REVOKE ALL ON FUNCTION public.merge_orderout_platform_statuses(uuid, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_orderout_platform_statuses(uuid, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.merge_orderout_connected_channels(uuid, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_orderout_connected_channels(uuid, jsonb)
  TO service_role;
