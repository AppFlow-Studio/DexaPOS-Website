-- ============================================================================
-- Migration 031: Grant system analytics visibility to HQ Manager
-- ============================================================================
-- Ticket alignment:
-- - Managers should see the Analytics section in HQ dashboard navigation.
-- - Sidebar "analytics.view" currently maps to "system.analytics.view".
--
-- This migration is idempotent and only inserts one role-permission mapping
-- when both the role and permission rows exist.

INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'hq.manager', 'system.analytics.view'
WHERE EXISTS (
  SELECT 1
  FROM public.roles r
  WHERE r.code = 'hq.manager'
)
AND EXISTS (
  SELECT 1
  FROM public.permissions p
  WHERE p.code = 'system.analytics.view'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.role_permissions rp
  WHERE rp.role_code = 'hq.manager'
    AND rp.permission_code = 'system.analytics.view'
);
