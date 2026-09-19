-- =============================================================================
-- Migration: Register 'hq.merchant.menu.import' permission and grant to roles
-- =============================================================================
-- Two steps, in order:
--   1. Insert the permission row into public.permissions (parent table).
--      role_permissions.permission_code has an FK to permissions.code, so
--      this row MUST exist before any grant referencing it.
--   2. Grant the new permission to hq.super_admin and hq.platform_admin.
--      Super admin gets it as the canonical owner; platform admin gets it
--      so onboarding ops can run the importer without super-admin scope.
--
-- Both steps are idempotent (ON CONFLICT / WHERE NOT EXISTS) so the migration
-- is safe to re-run.
-- =============================================================================

-- Step 1: register the permission code itself.
-- Fresh previews apply migrations before seed.sql. Install all canonical base
-- roles here so later migrations can grant them permissions before seed runs.
INSERT INTO "public"."roles" ("id", "code", "name", "description", "organization_type", "level", "is_system_role", "created_at", "updated_at", "level_type", "requires_clerk_account") VALUES
	('052106ff-dd13-48d3-906a-4e7a37e368d2', 'hq.finance_manager', 'Finance Manager', 'Manage billing and finances', 'hq', 7, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('0ffd0069-07b8-4d48-bcb0-afa36e7721e9', 'carrier.manager', 'Manager', 'Manage merchant operations', 'carrier', 7, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('2a12a0e4-be17-4255-8cba-ddf11e7d6295', 'carrier.analyst', 'Analyst', 'View reports and analytics', 'carrier', 5, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'member', 'clerk'),
	('2c79e923-b896-4136-8b05-dc3da07bd29f', 'hq.super_admin', 'Super Admin', 'Full system access - can do everything', 'hq', 10, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'admin', 'clerk'),
	('2ee56cfc-8ded-44ff-ba97-20f7fe88fbee', 'hq.account_manager', 'Account Manager', 'Manage assigned carrier/merchant accounts', 'hq', 6, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('3fcaad15-f784-41e6-a634-aaf54b6e222d', 'carrier.support', 'Support', 'Provide merchant support', 'carrier', 4, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('48f64b5b-72ef-4f1b-8f9c-b289da84effd', 'hq.analyst', 'Analyst', 'View analytics and reports', 'hq', 5, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'member', 'clerk'),
	('49cff879-f2ac-4e13-b399-3d255bd006c3', 'merchant.owner', 'Owner', 'Merchant business owner', 'merchant', 10, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'admin', 'clerk'),
	('65877235-4f6a-4e6c-9e73-3043124a9816', 'merchant.shift_manager', 'Shift Manager', 'Manage shifts and staff', 'merchant', 6, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('660f91e1-8872-4f09-8c5a-60e7cffdd8b2', 'hq.operations_manager', 'Operations Manager', 'Manage daily operations', 'hq', 7, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('6d4a04dc-363e-494a-ac65-2100489c58c2', 'hq.platform_admin', 'Platform Admin', 'Manage carriers and merchants', 'hq', 9, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'admin', 'clerk'),
	('82fb806e-5c7a-47b2-bde8-75a53dfef566', 'carrier.owner', 'Owner', 'Carrier organization owner', 'carrier', 10, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'admin', 'clerk'),
	('a0f79621-47ef-467a-8097-ce88a552163d', 'merchant.manager', 'Manager', 'Store/business manager', 'merchant', 7, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('a824fdfb-e1da-4c0b-aa6d-3549af5ee533', 'hq.support_manager', 'Support Manager', 'Manage support operations', 'hq', 6, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('abefdd4f-c96e-492b-896e-5400edcb104f', 'merchant.admin', 'Admin', 'Full merchant administration', 'merchant', 9, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'admin', 'clerk'),
	('e8648633-1fce-44c9-8fa7-946077d92f2b', 'merchant.inventory_manager', 'Inventory Manager', 'Manage inventory', 'merchant', 5, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('deaa780e-9149-4ed5-98aa-8833019d5100', 'carrier.account_manager', 'Account Manager', 'Manage assigned merchants', 'carrier', 6, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('e9cd6ed4-75be-479d-8304-8fd07b1f750e', 'carrier.admin', 'Admin', 'Full carrier administration', 'carrier', 9, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'admin', 'clerk'),
	('f7cba7df-c631-40b8-8616-9b9e239ca601', 'hq.support_agent', 'Support Agent', 'Provide customer support', 'hq', 4, true, '2025-10-18 16:13:12.96273+00', '2025-10-18 16:13:12.96273+00', 'manager', 'clerk'),
	('1cd42a47-b3a0-4787-9d03-0515b3a1d677', 'merchant.staff', 'Staff', 'Basic store operations', 'merchant', 2, true, '2025-10-18 16:13:12.96273+00', '2025-12-14 18:22:14.950075+00', 'member', 'pos_only'),
	('9dd0f722-aa57-4316-a6e2-2009a9768a65', 'merchant.cashier', 'Cashier', 'Process sales and transactions', 'merchant', 3, true, '2025-10-18 16:13:12.96273+00', '2025-12-14 18:22:23.670548+00', 'member', 'pos_only'),
	('6b950b57-189d-4189-9780-763e12af90b9', 'hq.manager', 'Manager', 'Operational management - can view and edit assigned merchants, view team info', 'hq', 5, true, '2026-02-20 18:40:28.2752+00', '2026-02-20 18:40:28.2752+00', 'hq', 'clerk')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (code, name, description, category, scope)
VALUES (
    'hq.merchant.menu.import',
    'Import Merchant Menu',
    'Import a merchant menu from an external POS export (Clover, Square, Toast).',
    'merchant',
    'hq'
)
ON CONFLICT (code) DO NOTHING;
-- Step 2: grant to hq.super_admin.
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'hq.super_admin', 'hq.merchant.menu.import'
WHERE NOT EXISTS (
    SELECT 1
      FROM public.role_permissions
     WHERE role_code       = 'hq.super_admin'
       AND permission_code = 'hq.merchant.menu.import'
);
-- Step 3: also grant to hq.platform_admin. Remove this block for prod-only
-- environments if onboarding ops should NOT have menu-import access without
-- explicit promotion.
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'hq.platform_admin', 'hq.merchant.menu.import'
WHERE NOT EXISTS (
    SELECT 1
      FROM public.role_permissions
     WHERE role_code       = 'hq.platform_admin'
       AND permission_code = 'hq.merchant.menu.import'
);
