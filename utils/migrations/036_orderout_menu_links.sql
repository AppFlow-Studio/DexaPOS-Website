-- ============================================================================
-- Migration 036: orderout_menu_links table
-- Persistent menu-to-OrderOut mapping (separates from sync audit log)
-- ============================================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS orderout_menu_links (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orderout_restaurant_id uuid NOT NULL REFERENCES orderout_restaurants(id) ON DELETE CASCADE,
  menu_id                uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  oo_menu_id             text NOT NULL,
  oo_menu_name           text,
  is_active              boolean NOT NULL DEFAULT true,
  platform_statuses      jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_pushed_at         timestamptz,
  last_sync_id           uuid REFERENCES orderout_menu_syncs(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_oo_menu_links_restaurant_menu UNIQUE (orderout_restaurant_id, menu_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_oo_menu_links_restaurant
  ON orderout_menu_links(orderout_restaurant_id);

CREATE INDEX IF NOT EXISTS idx_oo_menu_links_menu
  ON orderout_menu_links(menu_id);

CREATE INDEX IF NOT EXISTS idx_oo_menu_links_oo_menu_id
  ON orderout_menu_links(oo_menu_id);

-- 3. Trigger for updated_at (reuse set_updated_at from migration 023)
CREATE TRIGGER trg_oo_menu_links_updated_at
  BEFORE UPDATE ON orderout_menu_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. RLS
ALTER TABLE orderout_menu_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oo_menu_links_select_own" ON orderout_menu_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      WHERE orr.id = orderout_menu_links.orderout_restaurant_id
        AND is_merchant_admin(orr.merchant_id)
    )
  );

CREATE POLICY "oo_menu_links_insert_own" ON orderout_menu_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      WHERE orr.id = orderout_menu_links.orderout_restaurant_id
        AND is_merchant_admin(orr.merchant_id)
    )
  );

CREATE POLICY "oo_menu_links_update_own" ON orderout_menu_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      WHERE orr.id = orderout_menu_links.orderout_restaurant_id
        AND is_merchant_admin(orr.merchant_id)
    )
  );

CREATE POLICY "oo_menu_links_delete_own" ON orderout_menu_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      WHERE orr.id = orderout_menu_links.orderout_restaurant_id
        AND is_merchant_admin(orr.merchant_id)
    )
  );

-- 5. Add missing UPDATE policy for orderout_menu_syncs
-- (Only SELECT and INSERT existed — UPDATE was missing, causing sync record
--  updates to silently fail via RLS: status stayed 'pending', items_synced stayed 0)
CREATE POLICY "oo_menu_syncs_update_own" ON orderout_menu_syncs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orderout_restaurants orr
      WHERE orr.id = orderout_menu_syncs.orderout_restaurant_id
        AND is_merchant_admin(orr.merchant_id)
    )
  );

-- 6. Backfill orderout_menu_links from existing successful sync records
-- Match sync records to local menus by name from payload snapshot
INSERT INTO orderout_menu_links (
  orderout_restaurant_id,
  menu_id,
  oo_menu_id,
  oo_menu_name,
  is_active,
  last_pushed_at,
  last_sync_id
)
SELECT DISTINCT ON (s.orderout_restaurant_id, m.id)
  s.orderout_restaurant_id,
  m.id AS menu_id,
  s.oo_menu_id,
  (s.menu_payload_snapshot->>'name')::text AS oo_menu_name,
  true,
  s.synced_at,
  s.id
FROM orderout_menu_syncs s
JOIN menus m ON m.name = (s.menu_payload_snapshot->>'name')
WHERE s.sync_status = 'success'
  AND s.oo_menu_id IS NOT NULL
  AND s.menu_payload_snapshot IS NOT NULL
  AND s.menu_payload_snapshot->>'name' IS NOT NULL
ORDER BY s.orderout_restaurant_id, m.id, s.created_at DESC
ON CONFLICT (orderout_restaurant_id, menu_id) DO NOTHING;

-- 7. Fix stuck pending sync records older than 1 hour
UPDATE orderout_menu_syncs
SET sync_status = 'failed',
    error_details = '"Timed out - stuck in pending state"'::jsonb
WHERE sync_status = 'pending'
  AND created_at < now() - interval '1 hour';

-- 8. Backfill menu_id on sync records where it's NULL but name-matchable
UPDATE orderout_menu_syncs s
SET menu_id = m.id
FROM menus m
WHERE s.menu_id IS NULL
  AND s.menu_payload_snapshot IS NOT NULL
  AND s.menu_payload_snapshot->>'name' IS NOT NULL
  AND m.name = (s.menu_payload_snapshot->>'name');
