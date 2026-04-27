-- Fix: "infinite recursion detected in policy for relation 'merchants'"
--
-- Cycle: `merchants_self_access` (SELECT on merchants) subqueries `members`,
-- and `members_tenant_select` (SELECT on members) subqueries `merchants` —
-- so evaluating either policy re-enters the other indefinitely.
--
-- Break the cycle by routing the org-membership lookup through a
-- SECURITY DEFINER helper that bypasses RLS.

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.members
  WHERE user_id = get_my_claim('sub'::text)
$$;

REVOKE ALL ON FUNCTION public.current_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids()
  TO authenticated, anon, service_role;

DROP POLICY IF EXISTS merchants_self_access ON public.merchants;

CREATE POLICY merchants_self_access ON public.merchants
  FOR SELECT
  USING (clerk_org_id IN (SELECT public.current_user_org_ids()));
