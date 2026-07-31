-- Align the persisted Platform Admin role with the application permission map.
-- The permission rows already exist; this migration only adds missing grants.

INSERT INTO public.role_permissions (role_code, permission_code)
SELECT grants.role_code, grants.permission_code
FROM (
  VALUES
    ('hq.platform_admin'::text, 'hq.support.view'::text),
    ('hq.platform_admin'::text, 'hq.support.manage'::text)
) AS grants(role_code, permission_code)
WHERE EXISTS (
  SELECT 1
  FROM public.permissions permission
  WHERE permission.code = grants.permission_code
)
AND NOT EXISTS (
  SELECT 1
  FROM public.role_permissions existing_grant
  WHERE existing_grant.role_code = grants.role_code
    AND existing_grant.permission_code = grants.permission_code
);
