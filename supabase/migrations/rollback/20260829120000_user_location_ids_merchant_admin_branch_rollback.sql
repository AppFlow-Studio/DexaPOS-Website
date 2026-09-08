-- Rollback for 20260829120000_user_location_ids_merchant_admin_branch.sql
--
-- Restores user_location_ids() to its pre-2026-08-29 definition, dead
-- merchant-level branch and all. Running this re-breaks the picker/RLS
-- disagreement it fixed: owners and admins lose every location they do not hold
-- an active `location_members` row for, across the whole dashboard.
--
-- Only run this if the widened branch is implicated in a live incident.

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

    -- If user has merchant-level role, include all merchant locations
    SELECT l.id as location_id
    FROM public.locations l
    WHERE l.merchant_id = user_merchant_id()
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        INNER JOIN public.roles r ON r.code = ur.role_code
        WHERE ur.user_id = get_my_claim('sub')
          AND r.organization_type = 'merchant'
          AND r.level_type IN ('merchant', 'organization')
      )
  ) all_locations
  WHERE location_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.user_location_ids() IS
  'Returns array of location IDs the user can access from location_members table or merchant-level roles';
