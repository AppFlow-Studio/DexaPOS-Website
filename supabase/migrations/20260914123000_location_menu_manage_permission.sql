-- ============================================================================
-- Unblock writes to location_menus (RLS 42501).
--
-- SYMPTOM. SetLocationMenuChannelVisibility fails with
--   'new row violates row-level security policy for table "location_menus"'
-- on every attempt, for every menu.
--
-- CAUSE, in two parts — either one alone is enough to deny the write.
--
--   1. THE PERMISSION IS NEVER GRANTED TO ANYONE. Nine RLS policies gate writes
--      on 'location.menu.manage' (location_menus, location_category_overrides
--      and location_exclusive_items, insert/update/delete each). Search the
--      whole migration history and that code appears ONLY inside those policy
--      bodies — it is registered in no permissions row and granted in no
--      role_permissions row. Its sibling 'location.menu.view' IS seeded (see
--      20260420000000_add_pos_staff_roles.sql), which is why reading the menu
--      has always worked and writing it has never been possible through RLS.
--
--   2. MERCHANT ADMINS ARE SHADOWED BY THEIR OWN MEMBERSHIP.
--      user_has_location_permission looks the caller up in location_members
--      first and, if it finds a row, RETURNS the verdict of that role's
--      permissions immediately. The `is_merchant_admin` fallback below it —
--      commented "they have all location permissions" — is therefore
--      unreachable for anybody who is also a location member. An owner
--      assigned to their own store is denied as if they were a busser.
--
-- Fixing only (1) leaves any owner whose location_members role is a narrow
-- staff role still denied; fixing only (2) leaves owners who are NOT location
-- members relying on a permission nobody holds. So both, together.
--
-- BLAST RADIUS. Step 3 touches a function used by every location-scoped RLS
-- policy in the schema, so it deserves the scrutiny: the edit can only ever
-- turn a `false` into a `true`, only for merchant.owner / merchant.admin /
-- merchant.manager, and only within their own merchant — is_merchant_admin is
-- merchant-scoped and unchanged. No non-admin gains anything, and no tenant
-- boundary moves. It restores the behaviour the function already documents.
--
-- ROLLBACK: delete the two seeded rows and restore the function body from
-- 20260413215901_remote_schema.sql:30526.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Register the permission code. role_permissions.permission_code carries an
--    FK to permissions.code, so the grant below fails without this row first.
-- ----------------------------------------------------------------------------
INSERT INTO public.permissions (code, name, description, category, scope)
VALUES (
    'location.menu.manage',
    'Manage Location Menu',
    'Change which menus a location serves, their order, and their POS / kiosk / online visibility.',
    'menu',
    'location'
)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Grant it to exactly the roles is_merchant_admin already treats as admins.
--    Deliberately NOT granted to merchant.server / merchant.cook /
--    merchant.line_cook / merchant.busser: those hold location.menu.view so
--    they can read the menu on the POS, and menu design is not theirs to edit.
-- ----------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT r.code, 'location.menu.manage'
  FROM (VALUES ('merchant.owner'), ('merchant.admin'), ('merchant.manager'))
       AS r(code)
 WHERE NOT EXISTS (
     SELECT 1
       FROM public.role_permissions rp
      WHERE rp.role_code       = r.code
        AND rp.permission_code = 'location.menu.manage'
 );

-- ----------------------------------------------------------------------------
-- 3. Stop the membership lookup from shadowing the merchant-admin fallback.
--
--    Verbatim from 20260413215901_remote_schema.sql except for the control
--    flow: the member branch now returns only on SUCCESS and otherwise falls
--    through, instead of returning its EXISTS result and ending the function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_location_permission(
    p_location_id uuid,
    p_permission_code text
) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'public', 'pg_temp'
    AS $$
DECLARE
    v_user_id TEXT;
    v_merchant_id UUID;
    v_role_code TEXT;
BEGIN
    v_user_id := current_user_id();

    -- Fast path: check location membership first (most common case).
    SELECT lm.role_code, l.merchant_id
      INTO v_role_code, v_merchant_id
      FROM location_members lm
      JOIN locations l ON l.id = lm.location_id
     WHERE lm.user_id = v_user_id
       AND lm.location_id = p_location_id
       AND lm.is_active = true;

    -- A member whose role carries the permission is done here.
    IF v_role_code IS NOT NULL
       AND EXISTS (
             SELECT 1
               FROM role_permissions
              WHERE role_code       = v_role_code
                AND permission_code = p_permission_code
           )
    THEN
        RETURN true;
    END IF;

    -- FALL THROUGH, rather than returning false. A member whose role does not
    -- carry the permission may still be a merchant admin, and merchant admins
    -- hold every location permission.
    IF v_merchant_id IS NULL THEN
        SELECT merchant_id INTO v_merchant_id
          FROM locations WHERE id = p_location_id;
    END IF;

    RETURN is_merchant_admin(v_merchant_id);
END;
$$;

-- Verification after deployment:
--   SELECT role_code FROM role_permissions
--    WHERE permission_code = 'location.menu.manage';       -- 3 rows
--
--   -- As the signed-in dashboard user, must now be true:
--   SELECT public.user_has_location_permission(
--            '<location-id>'::uuid, 'location.menu.manage');
