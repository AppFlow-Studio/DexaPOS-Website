-- Fix: POS sync error 42P01 — `relation "menus" does not exist`
--
-- Two SECURITY DEFINER RPCs were configured with `SET search_path = ''`
-- (empty). Their bodies reference `menus`, `menu_categories`, etc. without
-- schema qualification, so any unqualified table lookup fails — surfacing
-- as 42P01 "relation does not exist" even though the tables are present.
--
-- Restore `public` to each function's search_path. This is a metadata-only
-- ALTER and does not modify the function bodies.

ALTER FUNCTION public.get_menu_with_categories(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION public.upsert_category_item_override(
  uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  numeric, text, integer, boolean, text, integer, numeric
) SET search_path = public;

NOTIFY pgrst, 'reload schema';
