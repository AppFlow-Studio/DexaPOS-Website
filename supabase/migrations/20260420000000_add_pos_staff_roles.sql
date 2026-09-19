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
