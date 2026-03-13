-- ============================================================================
-- Migration 044: Seed Data for Checkout Page Testing
-- Creates a complete merchant → location → menu → store config pipeline
-- so you can test /sites/demo-restaurant/checkout end-to-end.
-- ============================================================================
-- Run with: npx supabase db reset  (applies all migrations including seeds)
-- Or manually: psql -f supabase/migrations/044_seed_checkout_test_data.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Organization (Clerk stub)
-- ============================================================================
INSERT INTO public.organizations (id, name, created_at)
VALUES ('org_seed_checkout_001', 'Demo Restaurant Org', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Carrier
-- ============================================================================
INSERT INTO public.carriers (id, clerk_org_id, name, created_at)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'org_seed_checkout_001',
  'Dexa Direct',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. Merchant
-- ============================================================================
INSERT INTO public.merchants (id, clerk_org_id, carrier_id, name, created_at)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'org_seed_checkout_001',
  'a0000000-0000-4000-8000-000000000001',
  'Demo Restaurant',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. Location (with lat/lng for map embed)
-- ============================================================================
INSERT INTO public.locations (
  id, merchant_id, name, address_line1, city, state, postal_code,
  country, latitude, longitude, timezone, is_active, is_accepting_orders,
  phone, email, business_hours
)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Demo Restaurant - Main St',
  '123 Main Street',
  'New York',
  'NY',
  '10001',
  'US',
  40.7484,
  -73.9857,
  'America/New_York',
  true,
  true,
  '(555) 123-4567',
  'info@demorestaurant.com',
  '{
    "monday":    {"enabled": true, "from": "09:00", "to": "22:00", "is24Hours": false},
    "tuesday":   {"enabled": true, "from": "09:00", "to": "22:00", "is24Hours": false},
    "wednesday": {"enabled": true, "from": "09:00", "to": "22:00", "is24Hours": false},
    "thursday":  {"enabled": true, "from": "09:00", "to": "22:00", "is24Hours": false},
    "friday":    {"enabled": true, "from": "09:00", "to": "23:00", "is24Hours": false},
    "saturday":  {"enabled": true, "from": "10:00", "to": "23:00", "is24Hours": false},
    "sunday":    {"enabled": true, "from": "10:00", "to": "21:00", "is24Hours": false}
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. Tax Rate (8% default for the location)
-- ============================================================================
INSERT INTO public.tax_rates (id, location_id, name, percentage, tax_category, is_active)
VALUES (
  'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'NYC Sales Tax',
  8.875,
  'default',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. Menu
-- ============================================================================
INSERT INTO public.menus (id, merchant_id, name, is_active, display_order)
VALUES (
  'e0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Main Menu',
  true,
  1
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. Categories
-- ============================================================================
INSERT INTO public.categories (id, merchant_id, name, display_order, is_active) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Appetizers', 1, true),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Entrees',    2, true),
  ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Desserts',   3, true),
  ('f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Drinks',     4, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. Menu → Category links
-- ============================================================================
INSERT INTO public.menu_categories (id, menu_id, category_id, merchant_id, display_order, is_active) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 1, true),
  ('f1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 2, true),
  ('f1000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 3, true),
  ('f1000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 4, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. Menu Items
-- ============================================================================
INSERT INTO public.menu_items (id, merchant_id, name, description, price, image, availability) VALUES
  -- Appetizers
  ('a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Crispy Calamari',    'Golden fried with marinara dipping sauce',         12.99, NULL, true),
  ('a1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Bruschetta',         'Fresh tomatoes, basil, garlic on toasted ciabatta', 9.99,  NULL, true),
  ('a1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Loaded Nachos',      'House tortilla chips with queso, jalapeños, guac',  14.99, NULL, true),
  -- Entrees
  ('a1000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Classic Burger',     '8oz Angus beef, lettuce, tomato, special sauce',    16.99, NULL, true),
  ('a1000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'Grilled Salmon',     'Atlantic salmon with lemon dill butter, asparagus', 24.99, NULL, true),
  ('a1000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'Chicken Parmesan',   'Breaded chicken, mozzarella, marinara, spaghetti',  18.99, NULL, true),
  ('a1000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'Margherita Pizza',   '12-inch, fresh mozzarella, tomato, basil',          15.99, NULL, true),
  -- Desserts
  ('a1000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'Tiramisu',           'Classic Italian coffee-flavored dessert',            8.99,  NULL, true),
  ('a1000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001', 'Chocolate Lava Cake','Warm molten center with vanilla ice cream',          10.99, NULL, true),
  -- Drinks
  ('a1000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001', 'Fresh Lemonade',     'Freshly squeezed with a hint of mint',              4.99,  NULL, true),
  ('a1000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', 'Iced Coffee',        'Cold-brewed, served over ice',                      5.49,  NULL, true),
  ('a1000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', 'Craft Soda',         'House-made ginger beer or root beer',                3.99,  NULL, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10. Category → Item links
-- ============================================================================
INSERT INTO public.category_items (id, menu_item_id, category_id, merchant_id, display_order, is_available) VALUES
  -- Appetizers
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 1, true),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 2, true),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 3, true),
  -- Entrees
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 1, true),
  ('b1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 2, true),
  ('b1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 3, true),
  ('b1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 4, true),
  -- Desserts
  ('b1000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 1, true),
  ('b1000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 2, true),
  -- Drinks
  ('b1000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 1, true),
  ('b1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 2, true),
  ('b1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 3, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. Modifier Groups (Burger example)
-- ============================================================================
INSERT INTO public.modifier_groups (id, merchant_id, name, is_required, min_selections, max_selections, is_active)
VALUES (
  'c1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Add-Ons',
  false, 0, 3, true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.modifier_group_items (id, modifier_group_id, merchant_id, name, price_modifier, display_order, is_active) VALUES
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Extra Cheese',   1.50, 1, true),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Bacon',          2.00, 2, true),
  ('c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Avocado',        1.99, 3, true),
  ('c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Fried Egg',      1.50, 4, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 12. Online Store Config (the key table for /sites/[slug])
-- ============================================================================
INSERT INTO public.online_store_config (
  id,
  merchant_id,
  location_id,
  slug,
  store_name,
  template_id,
  primary_color,
  secondary_color,
  accent_color,
  background_color,
  text_color,
  logo_url,
  hero_image_url,
  description,
  phone,
  email,
  address,
  operating_hours,
  is_active,
  accepts_pickup,
  accepts_delivery,
  min_order_cents,
  estimated_prep_minutes,
  max_future_order_days,
  delivery_fee_cents,
  free_delivery_threshold_cents,
  tip_enabled,
  tip_presets,
  published_at
)
VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'demo-restaurant',
  'Demo Restaurant',
  'classic',
  '#2DD4BF',
  '#10b981',
  '#2DD4BF',
  '#FFFFFF',
  '#111827',
  NULL,
  NULL,
  'A cozy neighborhood restaurant serving fresh, delicious food. Order online for pickup or delivery!',
  '(555) 123-4567',
  'info@demorestaurant.com',
  '{
    "line1": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "lat": 40.7484,
    "lng": -73.9857
  }'::jsonb,
  '[
    {"day": 0, "open": "10:00", "close": "21:00", "is_closed": false},
    {"day": 1, "open": "09:00", "close": "22:00", "is_closed": false},
    {"day": 2, "open": "09:00", "close": "22:00", "is_closed": false},
    {"day": 3, "open": "09:00", "close": "22:00", "is_closed": false},
    {"day": 4, "open": "09:00", "close": "22:00", "is_closed": false},
    {"day": 5, "open": "09:00", "close": "23:00", "is_closed": false},
    {"day": 6, "open": "10:00", "close": "23:00", "is_closed": false}
  ]'::jsonb,
  true,   -- is_active
  true,   -- accepts_pickup
  true,   -- accepts_delivery
  0,      -- min_order_cents (no minimum)
  20,     -- estimated_prep_minutes
  7,      -- max_future_order_days
  499,    -- delivery_fee_cents ($4.99)
  3500,   -- free_delivery_threshold_cents ($35.00)
  true,   -- tip_enabled
  '[15, 18, 20, 25]'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 13. Customer (for testing auth flow)
-- ============================================================================
INSERT INTO public.customers (id, merchant_id, name, phone, email, created_at)
VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Jane Doe',
  '5551234567',
  'jane@example.com',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 14. Order sequence (needed for process_online_order RPC)
-- ============================================================================
INSERT INTO public.order_sequences (location_id, sequence_date, last_order_number)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  CURRENT_DATE,
  0
)
ON CONFLICT (location_id, sequence_date) DO NOTHING;

-- ============================================================================
-- 15. Delivery Zone (optional — tests delivery flow)
-- ============================================================================
INSERT INTO public.delivery_zones (
  id, store_config_id, zone_name, zone_type, radius_miles,
  delivery_fee_cents, min_order_cents, estimated_minutes, is_active
)
VALUES (
  'e2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'Standard Zone',
  'radius',
  5.00,
  499,
  0,
  30,
  true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================================
-- USAGE:
--   Visit: http://localhost:3000/sites/demo-restaurant
--   Checkout: http://localhost:3000/sites/demo-restaurant/checkout
--
-- This seeds:
--   - 1 merchant "Demo Restaurant"
--   - 1 location with NYC coordinates (shows Google Maps embed)
--   - 1 tax rate (8.875% NYC sales tax)
--   - 1 menu with 4 categories (Appetizers, Entrees, Desserts, Drinks)
--   - 12 menu items with descriptions and prices
--   - 1 modifier group with 4 options (for the burger)
--   - 1 online_store_config with slug "demo-restaurant"
--   - 1 test customer (jane@example.com / 555-123-4567)
--   - 1 delivery zone ($4.99 within 5 miles)
-- ============================================================================
