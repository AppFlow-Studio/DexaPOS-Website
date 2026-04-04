-- ============================================================================
-- Migration 039: Grant system.config.manage to Platform Admin
-- ============================================================================
-- The Device Catalog page requires system.config.manage.
-- This permission was previously only assigned to hq.super_admin.
-- Platform Admins should also be able to manage system config (device catalog, etc.).

INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'hq.platform_admin', 'system.config.manage'
WHERE EXISTS (
  SELECT 1
  FROM public.roles r
  WHERE r.code = 'hq.platform_admin'
)
AND EXISTS (
  SELECT 1
  FROM public.permissions p
  WHERE p.code = 'system.config.manage'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.role_permissions rp
  WHERE rp.role_code = 'hq.platform_admin'
    AND rp.permission_code = 'system.config.manage'
);
