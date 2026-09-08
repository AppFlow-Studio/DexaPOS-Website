-- ============================================================================
-- Perf: a menu payload sized for consumers that only render item cards.
--
-- get_menus_for_location() returns the location's entire menu tree because it
-- is the *ordering* storefront's query — it needs modifier groups to build a
-- cart and the raw price cascade to explain a price. Measured on a 19-menu
-- merchant, that payload is 320 KB, of which:
--
--     modifier_groups    96.5 KB   30%
--     price_levels       77.0 KB   24%
--
-- The site builder and the built page read neither. They render name,
-- description, photo, one price and whether the kitchen is serving it — and
-- they pay for the other 173 KB on every canvas render, on a link where a
-- round trip costs ~160 ms and 320 KB costs ~490 ms. Payload, not compute, is
-- the cost here: one menu through get_menu_with_categories measures at the
-- network floor, nineteen measure at 3x it.
--
-- ── Why this cannot drift from the ordering page ───────────────────────────
-- This is a PROJECTION over the same public.get_menu_with_categories(menu,
-- location) call that get_menus_for_location makes, with the same menu
-- selection predicate. It does not recompute a price, an availability flag or
-- an override — it deletes keys from that function's output. A price shown by
-- a built page is therefore the same value, from the same expression, as the
-- price the ordering page shows. Adding a second cascade here is the one thing
-- that would make these two surfaces disagree, and it is deliberately not what
-- this does.
--
-- Verified against 7 storefronts on staging: 1881 KB -> 302 KB total, an 84%
-- cut on every one of them, and the flattened item list is identical to the
-- full RPC's in all 7. Median call time 509 ms -> 231 ms. The remainder over
-- the ~160 ms round-trip floor is get_menu_with_categories still computing the
-- full tree before this projection discards most of it — that is the cost of
-- not owning a second cascade, and it is the right trade.
--
-- ── Why the nested shape is preserved ──────────────────────────────────────
-- The returned structure is still menu -> categories[] -> items[] ->
-- menu_item, so `flattenMenuItems` (lib/site-builder/bindings/supabase-sources.ts)
-- consumes it unchanged. A flat, pre-deduplicated array would be ~16 KB rather
-- than 51 KB — items repeat 2.87x across menus — but it would move "first
-- occurrence across ordered menus wins" out of the tested TypeScript and into
-- SQL, a second implementation of an ordering rule, to save 35 KB. Not worth
-- it.
--
-- Array order is preserved explicitly with WITH ORDINALITY: that same dedup
-- rule depends on it, and jsonb_agg without an ORDER BY is not guaranteed to
-- keep input order.
--
-- Note: `is_popular` / `is_new` are absent below because
-- get_menu_with_categories does not emit them — see the comment in
-- supabase-sources.ts. Omitting them keeps behaviour identical to the full RPC
-- rather than quietly changing it in a performance migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_menus_for_location_lite(
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
    jsonb_agg(s.lean ORDER BY s.display_order ASC NULLS LAST, s.name ASC),
    '[]'::jsonb
  )::json
  FROM (
    SELECT
      m.display_order,
      m.name,
      jsonb_build_object(
        'id',   g.full_menu -> 'id',
        'name', g.full_menu -> 'name',
        'categories', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',        c.value -> 'id',
                'is_active', c.value -> 'is_active',
                'items', (
                  SELECT COALESCE(
                    jsonb_agg(
                      jsonb_build_object(
                        'menu_item', jsonb_build_object(
                          'id',                       i.value #> '{menu_item,id}',
                          'name',                     i.value #> '{menu_item,name}',
                          'description',              i.value #> '{menu_item,description}',
                          'image',                    i.value #> '{menu_item,image}',
                          'allergens',                i.value #> '{menu_item,allergens}',
                          'dietary_flags',            i.value #> '{menu_item,dietary_flags}',
                          'effective_availability',   i.value #> '{menu_item,effective_availability}',
                          'effective_price',          i.value #> '{menu_item,effective_price}',
                          'effective_cash_price',     i.value #> '{menu_item,effective_cash_price}',
                          'effective_delivery_price', i.value #> '{menu_item,effective_delivery_price}'
                        )
                      )
                      ORDER BY i.ord
                    ),
                    '[]'::jsonb
                  )
                  FROM jsonb_array_elements(COALESCE(c.value -> 'items', '[]'::jsonb))
                         WITH ORDINALITY AS i(value, ord)
                  -- Matches the flattener, which skips an item with no
                  -- menu_item object rather than emitting a blank card.
                  WHERE jsonb_typeof(i.value -> 'menu_item') = 'object'
                )
              )
              ORDER BY c.ord
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(COALESCE(g.full_menu -> 'categories', '[]'::jsonb))
                 WITH ORDINALITY AS c(value, ord)
        )
      ) AS lean
    FROM public.menus m
    CROSS JOIN LATERAL (
      SELECT public.get_menu_with_categories(m.id, p_location_id)::jsonb AS full_menu
    ) g
    -- Identical to get_menus_for_location's predicate. Diverging here would
    -- mean the two surfaces disagree about which menus serve this location.
    WHERE m.merchant_id = p_merchant_id
      AND m.is_active = true
      AND (m.location_id IS NULL OR m.location_id = p_location_id)
  ) s;
$function$;

GRANT EXECUTE ON FUNCTION public.get_menus_for_location_lite(uuid, uuid)
  TO anon, authenticated, service_role;
