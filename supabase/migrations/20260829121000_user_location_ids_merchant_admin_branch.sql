-- ============================================================================
-- user_location_ids() — repair the merchant-level branch
-- ============================================================================
--
-- THE BUG. This helper decides which locations a signed-in user may read, and
-- it is consulted ~75 times across RLS policies and RPCs. It has two branches:
-- per-location membership, and a merchant-level branch meant to give an owner
-- or admin every location their merchant owns.
--
-- The second branch has never matched anybody:
--
--     AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.code = ur.role_code
--                 WHERE ur.user_id = get_my_claim('sub')
--                   AND r.organization_type = 'merchant'
--                   AND r.level_type IN ('merchant', 'organization'))
--
-- Every merchant role in `roles` carries a `level_type` of 'admin', 'manager'
-- or 'member'. Neither 'merchant' nor 'organization' is a value that exists for
-- organization_type = 'merchant', so the predicate is unsatisfiable — and
-- `user_roles` is empty for merchant users in any case. It is dead code.
--
-- WHAT THAT COST. With the branch dead, the helper means "active
-- location_members rows only", while `GetLocations`
-- (app/dashboard/actions/get-locations.ts) — the resolver behind the dashboard
-- location picker — reads the Clerk `members` table and hands an owner or admin
-- EVERY location the merchant owns. The picker therefore offers locations the
-- data layer refuses to answer for, and the screen renders an empty list rather
-- than an access error. Found via website reservations: bookings stored with
-- the correct merchant_id and location_id were invisible on
-- /dashboard/reservations because `get_reservations` gates on this helper.
--
-- WHY WE WIDEN THE HELPER RATHER THAN NARROW THE PICKER. Narrowing was the
-- other option and it is worse: on the test org the merchant OWNER holds an
-- active location_members row for one of their five locations, so matching the
-- picker to the helper would strip owners of most of their dashboard. The
-- picker's model is the correct one.
--
-- WHY is_merchant_owner AND NOT is_merchant_admin. `is_merchant_owner` reads
-- `members.role IN ('merchant.owner', 'merchant.admin')` — byte for byte the
-- set `GetLocations` grants all-locations to. `is_merchant_admin` also admits
-- 'merchant.manager', which would make this helper BROADER than the picker and
-- grant access nobody asked for. Both read the same `members` table the picker
-- reads, which is the entire point: the two stop being two models.
--
-- Identity matches too: `is_merchant_owner` resolves the caller through
-- `current_user_id()`, which is `get_my_claim('sub')::TEXT` — the same subject
-- the membership branch uses.
--
-- BLAST RADIUS. This can only WIDEN access, never narrow it: the membership
-- branch is preserved verbatim and the new branch is UNIONed alongside it. No
-- non-admin's access changes. For an HQ admin `user_merchant_id()` is NULL, so
-- `is_merchant_owner(NULL)` is false and the branch stays shut.
--
-- Deliberately NOT filtering `locations.is_active` — `GetLocations` does not
-- either, and an archived location's data must stay readable to the owner who
-- archived it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_location_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT location_id),
    ARRAY[]::UUID[]
  )
  FROM (
    -- Get locations from location_members where user is assigned
    -- Handles both Clerk users (user_id match) and POS-only users (staff_profile_id match)
    SELECT lm.location_id
    FROM public.location_members lm
    WHERE lm.is_active = true
      AND lm.merchant_id = user_merchant_id()
      AND (
        lm.user_id = get_my_claim('sub')  -- For Clerk users
        OR lm.staff_profile_id = user_staff_profile_id()  -- For POS-only users
      )

    UNION

    -- Merchant-level owners and admins get every location their merchant owns.
    -- Sourced from the Clerk `members` table via is_merchant_owner(), so this
    -- agrees with GetLocations by construction rather than by coincidence.
    SELECT l.id as location_id
    FROM public.locations l
    WHERE l.merchant_id = user_merchant_id()
      AND public.is_merchant_owner(user_merchant_id())
  ) all_locations
  WHERE location_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.user_location_ids() IS
  'Returns array of location IDs the user can access: active location_members rows, plus every merchant location when the user is a merchant.owner/merchant.admin in the Clerk members table (matching GetLocations).';
