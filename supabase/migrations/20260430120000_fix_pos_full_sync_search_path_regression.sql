-- ============================================================================
-- Fix: get_pos_full_sync regression — "relation \"menus\" does not exist"
--      Plus belt-and-braces re-apply of search_path on get_categories_for_location
--
-- Background:
--   * The canonical get_pos_full_sync (20260413223430_remote_schema.sql) was
--     correctly defined with `SET search_path TO 'public', 'pg_temp'`.
--   * In the Dexa-POS app repo, a side migration
--     (utils/supabase/migrations/fix_menu_display_order_per_location.sql)
--     CREATE OR REPLACE'd this function to add per-location display_order
--     ordering — but omitted `SET search_path`. Once that ran on staging,
--     the function lost its search_path setting and unqualified
--     `FROM menus` started failing with 42P01.
--   * Likewise, get_categories_for_location was patched in
--     20260427120000_fix_remaining_empty_search_path_rpcs.sql, but staging
--     was still erroring with `relation "categories" does not exist` on
--     2026-04-30, suggesting that earlier search_path fix never reached this
--     environment. Re-applying it here is idempotent and safe.
--
-- This migration:
--   1. Re-creates get_pos_full_sync with the per-location display_order
--      logic AND the proper `SET search_path TO 'public', 'pg_temp'`,
--      with all table references fully schema-qualified as defense in depth.
--   2. Re-asserts the search_path setting on get_categories_for_location
--      and the helper get_menu_with_categories.
--
-- Confirmed reproduced on staging (dfwqakoyittmrwbqvxgw) on 2026-04-30
-- via direct REST RPC invocation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pos_full_sync(p_location_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'synced_at', NOW(),
        'location_id', p_location_id,
        'menus', (
            SELECT COALESCE(json_agg(
                -- Inject display_order into the menu JSON
                (public.get_menu_with_categories(m.id, p_location_id)::jsonb
                 || jsonb_build_object(
                      'display_order',
                      COALESCE(lm.display_order, m.display_order)
                    )
                )::json
                ORDER BY COALESCE(lm.display_order, m.display_order) NULLS LAST, m.name
            ), '[]'::json)
            FROM public.menus m
            LEFT JOIN public.location_menus lm
              ON lm.menu_id = m.id
              AND lm.location_id = p_location_id
            WHERE m.merchant_id = (
                SELECT merchant_id FROM public.locations WHERE id = p_location_id
            )
            AND (
                (m.location_id IS NULL)
                OR
                (m.location_id = p_location_id)
            )
            AND (
                -- For location-specific menus, check their is_active
                (m.location_id = p_location_id AND m.is_active = true)
                OR
                -- For global menus, check global is_active OR location override is_active
                (m.location_id IS NULL AND (m.is_active = true OR lm.is_active = true))
            )
        )
    ) INTO result;

    RETURN result;
END;
$function$;
-- Re-assert search_path on dependent / sibling RPCs in case earlier
-- search_path fixes never reached this DB. Metadata-only ALTERs.
ALTER FUNCTION public.get_categories_for_location(uuid, uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_menu_with_categories(uuid, uuid)
  SET search_path TO 'public', 'pg_temp';
NOTIFY pgrst, 'reload schema';
