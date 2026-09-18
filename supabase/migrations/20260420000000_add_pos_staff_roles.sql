-- =============================================================================
-- Migration: Add POS Staff Roles (Server, Busser, Cook, Line Cook)
-- =============================================================================
-- Adds 4 new POS-only staff roles for employee assignment, payroll, and tip pools:
--   FOH: merchant.server (Level 3), merchant.busser (Level 1)
--   BOH: merchant.cook (Level 2), merchant.line_cook (Level 2)
--
-- Pure additive (INSERT only). Idempotent for roles via ON CONFLICT (code).
-- =============================================================================

BEGIN;

-- Migrations run before seed.sql on fresh previews, so ensure every referenced
-- permission exists before inserting the role mappings below.
INSERT INTO public.permissions (id, code, name, description, category, scope, created_at)
VALUES
  ('ae12e11b-1a20-465c-a58d-80031ec1cb73', 'merchant.pos.use', 'Use POS', 'Use the POS tablet application', 'organization', 'merchant', now()),
  ('5d36f19e-b350-484d-82eb-0ab326323c29', 'merchant.products.view', 'View Products', 'View product catalog', 'organization', 'merchant', now()),
  ('66417eb2-7e0b-46bd-a7bc-ced26e614f96', 'merchant.inventory.view', 'View Inventory', 'View inventory levels', 'organization', 'merchant', now()),
  ('5c87be0e-fae0-4a89-8a70-85a10bc2bd9d', 'merchant.orders.view', 'View Orders', 'View customer orders', 'organization', 'merchant', now()),
  ('7cbd9acf-0bc3-4681-ab55-b51f4889581e', 'merchant.orders.manage', 'Manage Orders', 'Process and manage orders', 'organization', 'merchant', now()),
  ('2d1bb8c9-d1a8-4ac5-9dba-9d743b82db7f', 'merchant.transactions.view', 'View Transactions', 'View transaction history', 'organization', 'merchant', now()),
  ('ee9d36e3-ad98-4bba-959b-55a9615d62e9', 'merchant.customers.view', 'View Customers', 'View customer data', 'organization', 'merchant', now()),
  ('c3d8bcde-e4fb-49bd-9103-aba2bf9d1551', 'location.view', 'View Location', 'View location details', 'location', 'location', now()),
  ('fe22c9d1-5396-47f9-8b91-b4c89e330e89', 'location.menu.view', 'View Location Menu', 'View location menu settings', 'menu', 'location', now()),
  ('6926338f-dd19-4e56-a698-7e90aeeff20a', 'location.orders.view', 'View Location Orders', 'View orders at location', 'orders', 'location', now()),
  ('41516883-cd8f-4b45-aed8-8ad821631f35', 'location.orders.manage', 'Manage Location Orders', 'Process orders at location', 'orders', 'location', now()),
  ('bafe6e15-6792-44fa-8166-728d8412eed9', 'location.transactions.view', 'View Location Transactions', 'View transactions at location', 'transactions', 'location', now())
ON CONFLICT (code) DO NOTHING;
-- ─── Insert new roles ───────────────────────────────────────────────────────

INSERT INTO public.roles (id, code, name, description, organization_type, level, is_system_role, level_type, requires_clerk_account, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'merchant.server',    'Server',    'Take orders and serve customers',  'merchant', 3, true, 'member', 'pos_only', now(), now()),
  (gen_random_uuid(), 'merchant.busser',    'Busser',    'Clear and set tables',             'merchant', 1, true, 'member', 'pos_only', now(), now()),
  (gen_random_uuid(), 'merchant.cook',      'Cook',      'Kitchen food preparation',         'merchant', 2, true, 'member', 'pos_only', now(), now()),
  (gen_random_uuid(), 'merchant.line_cook', 'Line Cook', 'Prepare food items on the line',   'merchant', 2, true, 'member', 'pos_only', now(), now())
ON CONFLICT (code) DO NOTHING;
-- ─── merchant.server permissions (same as cashier — full FOH access) ────────

INSERT INTO public.role_permissions (id, role_code, permission_code, created_at) VALUES
  -- Merchant-level
  (gen_random_uuid(), 'merchant.server', 'merchant.pos.use',           now()),
  (gen_random_uuid(), 'merchant.server', 'merchant.products.view',     now()),
  (gen_random_uuid(), 'merchant.server', 'merchant.inventory.view',    now()),
  (gen_random_uuid(), 'merchant.server', 'merchant.orders.view',       now()),
  (gen_random_uuid(), 'merchant.server', 'merchant.orders.manage',     now()),
  (gen_random_uuid(), 'merchant.server', 'merchant.transactions.view', now()),
  (gen_random_uuid(), 'merchant.server', 'merchant.customers.view',    now()),
  -- Location-level
  (gen_random_uuid(), 'merchant.server', 'location.view',              now()),
  (gen_random_uuid(), 'merchant.server', 'location.menu.view',         now()),
  (gen_random_uuid(), 'merchant.server', 'location.orders.view',       now()),
  (gen_random_uuid(), 'merchant.server', 'location.orders.manage',     now()),
  (gen_random_uuid(), 'merchant.server', 'location.transactions.view', now());
-- ─── merchant.busser permissions (minimal FOH) ─────────────────────────────

INSERT INTO public.role_permissions (id, role_code, permission_code, created_at) VALUES
  -- Merchant-level
  (gen_random_uuid(), 'merchant.busser', 'merchant.products.view', now()),
  (gen_random_uuid(), 'merchant.busser', 'merchant.orders.view',   now()),
  -- Location-level
  (gen_random_uuid(), 'merchant.busser', 'location.view',          now()),
  (gen_random_uuid(), 'merchant.busser', 'location.orders.view',   now());
-- ─── merchant.cook permissions (BOH — kitchen-focused) ─────────────────────

INSERT INTO public.role_permissions (id, role_code, permission_code, created_at) VALUES
  -- Merchant-level
  (gen_random_uuid(), 'merchant.cook', 'merchant.pos.use',       now()),
  (gen_random_uuid(), 'merchant.cook', 'merchant.products.view', now()),
  (gen_random_uuid(), 'merchant.cook', 'merchant.orders.view',   now()),
  -- Location-level
  (gen_random_uuid(), 'merchant.cook', 'location.view',          now()),
  (gen_random_uuid(), 'merchant.cook', 'location.menu.view',     now()),
  (gen_random_uuid(), 'merchant.cook', 'location.orders.view',   now());
-- ─── merchant.line_cook permissions (BOH — same as cook) ───────────────────

INSERT INTO public.role_permissions (id, role_code, permission_code, created_at) VALUES
  -- Merchant-level
  (gen_random_uuid(), 'merchant.line_cook', 'merchant.pos.use',       now()),
  (gen_random_uuid(), 'merchant.line_cook', 'merchant.products.view', now()),
  (gen_random_uuid(), 'merchant.line_cook', 'merchant.orders.view',   now()),
  -- Location-level
  (gen_random_uuid(), 'merchant.line_cook', 'location.view',          now()),
  (gen_random_uuid(), 'merchant.line_cook', 'location.menu.view',     now()),
  (gen_random_uuid(), 'merchant.line_cook', 'location.orders.view',   now());
COMMIT;
