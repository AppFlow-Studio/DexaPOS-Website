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
-- Fresh previews apply migrations before seed.sql; install the canonical role
-- rows first so the foreign-keyed grants below are not silently skipped.
INSERT INTO public.roles (
    id, code, name, description, organization_type, level, is_system_role,
    level_type, requires_clerk_account
)
VALUES
    ('2c79e923-b896-4136-8b05-dc3da07bd29f', 'hq.super_admin', 'Super Admin',
     'Full system access - can do everything', 'hq', 10, true, 'admin', 'clerk'),
    ('6d4a04dc-363e-494a-ac65-2100489c58c2', 'hq.platform_admin', 'Platform Admin',
     'Manage carriers and merchants', 'hq', 9, true, 'admin', 'clerk')
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
