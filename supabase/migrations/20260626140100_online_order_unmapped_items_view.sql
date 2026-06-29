-- ============================================================================
-- online_order_unmapped_items — ops visibility for online lines that failed to
-- link to a POS menu item (and therefore can't be routed to a prep station).
-- ----------------------------------------------------------------------------
-- After 20260626140000_process_online_order_uuid_extract.sql, an online line is
-- only left as an open item (is_open_item=true, menu_item_matched=false) when it
-- could neither be matched by an embedded external_id UUID nor by a unique item
-- name. Those are exactly the lines that need a catalog/menu-sync fix, so expose
-- them with the provider identifiers needed to chase them down.
--
-- Companion ad-hoc diagnostic (orders sent to kitchen but with zero KDS rows):
--   SELECT o.id, o.order_number, o.created_at
--   FROM orders o
--   WHERE o.order_source='online' AND o.sent_to_kitchen_at IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM order_items oi
--       JOIN kds_item_status kis ON kis.order_item_id = oi.id
--       WHERE oi.order_id = o.id);
-- ============================================================================

CREATE OR REPLACE VIEW public.online_order_unmapped_items AS
SELECT
  o.location_id,
  l.name                                AS location_name,
  o.id                                  AS order_id,
  o.order_number,
  o.display_number,
  o.created_at,
  oi.id                                 AS order_item_id,
  oi.item_name,
  oi.metadata->>'provider'              AS provider,
  oi.metadata->>'provider_external_id'  AS provider_external_id,
  oi.metadata->>'provider_item_id'      AS provider_item_id
FROM public.order_items oi
JOIN public.orders o            ON o.id = oi.order_id
LEFT JOIN public.locations l    ON l.id = o.location_id
WHERE o.order_source = 'online'
  AND oi.is_open_item = true
  AND COALESCE((oi.metadata->>'menu_item_matched')::boolean, false) = false;

COMMENT ON VIEW public.online_order_unmapped_items IS
  'Online order lines that failed to link to a POS menu item (open items). Use provider_external_id / provider_item_id to fix the menu sync or catalog.';
