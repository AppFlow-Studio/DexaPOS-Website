-- Migration: Store oo_account_id per location on orderout_restaurants
-- OrderOut creates a unique account per onboarding call (per location).
-- This migration denormalizes oo_account_id and merchant_id onto restaurants
-- for simpler queries and RLS policies.

-- Add oo_account_id to orderout_restaurants (each location has its own)
ALTER TABLE orderout_restaurants
  ADD COLUMN IF NOT EXISTS oo_account_id text;

-- Backfill from orderout_accounts for existing rows
UPDATE orderout_restaurants r
SET oo_account_id = a.oo_account_id
FROM orderout_accounts a
WHERE r.orderout_account_id = a.id
  AND r.oo_account_id IS NULL
  AND a.oo_account_id IS NOT NULL;

-- Add merchant_id directly for simpler RLS (denormalized from locations.merchant_id)
ALTER TABLE orderout_restaurants
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE;

-- Backfill merchant_id from locations
UPDATE orderout_restaurants r
SET merchant_id = l.merchant_id
FROM locations l
WHERE r.location_id = l.id
  AND r.merchant_id IS NULL;

-- Index for RLS lookups
CREATE INDEX IF NOT EXISTS idx_oo_restaurants_merchant
  ON orderout_restaurants (merchant_id);

-- Replace RLS policies: restaurants (old joins through accounts, new uses direct merchant_id)
DROP POLICY IF EXISTS "oo_restaurants_select_own" ON orderout_restaurants;
DROP POLICY IF EXISTS "oo_restaurants_insert_own" ON orderout_restaurants;
DROP POLICY IF EXISTS "oo_restaurants_update_own" ON orderout_restaurants;

CREATE POLICY "oo_restaurants_select_own" ON orderout_restaurants
  FOR SELECT USING (is_merchant_admin(merchant_id));
CREATE POLICY "oo_restaurants_insert_own" ON orderout_restaurants
  FOR INSERT WITH CHECK (is_merchant_admin(merchant_id));
CREATE POLICY "oo_restaurants_update_own" ON orderout_restaurants
  FOR UPDATE USING (is_merchant_admin(merchant_id));

-- Replace RLS policies: menu_syncs (remove account join)
DROP POLICY IF EXISTS "oo_menu_syncs_select_own" ON orderout_menu_syncs;
DROP POLICY IF EXISTS "oo_menu_syncs_insert_own" ON orderout_menu_syncs;

CREATE POLICY "oo_menu_syncs_select_own" ON orderout_menu_syncs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orderout_restaurants orr
            WHERE orr.id = orderout_menu_syncs.orderout_restaurant_id
              AND is_merchant_admin(orr.merchant_id))
  );
CREATE POLICY "oo_menu_syncs_insert_own" ON orderout_menu_syncs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM orderout_restaurants orr
            WHERE orr.id = orderout_menu_syncs.orderout_restaurant_id
              AND is_merchant_admin(orr.merchant_id))
  );

-- Replace RLS policies: orders (remove account join)
DROP POLICY IF EXISTS "oo_orders_select_own" ON orderout_orders;
DROP POLICY IF EXISTS "oo_orders_update_own" ON orderout_orders;

CREATE POLICY "oo_orders_select_own" ON orderout_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orderout_restaurants orr
            WHERE orr.id = orderout_orders.orderout_restaurant_id
              AND is_merchant_admin(orr.merchant_id))
  );
CREATE POLICY "oo_orders_update_own" ON orderout_orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM orderout_restaurants orr
            WHERE orr.id = orderout_orders.orderout_restaurant_id
              AND is_merchant_admin(orr.merchant_id))
  );
