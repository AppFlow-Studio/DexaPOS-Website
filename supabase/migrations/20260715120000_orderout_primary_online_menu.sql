-- [OrderOut] Canonical "online ordering menu" per location.
--
-- OrderOut effectively serves ONE menu per store, but orderout_menu_links allows
-- multiple links per restaurant (one per internal menu). Mark exactly one active
-- link as the primary online menu so availability re-pushes (86ing) target it
-- rather than every linked menu.

ALTER TABLE public.orderout_menu_links
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orderout_menu_links.is_primary IS
  'Canonical online-ordering menu for this restaurant/location. At most one per '
  'restaurant (partial unique index). The 86 resync pushes only this menu.';

-- At most one primary per restaurant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oo_menu_links_primary
  ON public.orderout_menu_links (orderout_restaurant_id)
  WHERE is_primary;

-- Backfill: flag each restaurant's most-relevant active link as primary
-- (latest last_pushed_at, tiebreak created_at). Idempotent — skips restaurants
-- that already have a primary.
UPDATE public.orderout_menu_links l
SET is_primary = true
FROM (
  SELECT DISTINCT ON (orderout_restaurant_id) id
  FROM public.orderout_menu_links
  WHERE is_active
    AND orderout_restaurant_id NOT IN (
      SELECT orderout_restaurant_id
      FROM public.orderout_menu_links
      WHERE is_primary
    )
  ORDER BY orderout_restaurant_id, last_pushed_at DESC NULLS LAST, created_at DESC
) pick
WHERE l.id = pick.id;
