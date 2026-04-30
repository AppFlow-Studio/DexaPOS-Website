-- Bug: prod's public.is_dexapos_admin was manually redefined (to swap the
-- hardcoded HQ org id from staging's value to prod's) without an explicit
-- `SET search_path` clause. When called from Lane I helpers (which have
-- `set search_path = ''`, e.g. user_belongs_to_merchant in
-- 20260427170000_security_hardening_lanes_e_to_i.sql), the function inherits
-- the empty search_path. The unqualified `get_my_claim('org_id')` inside its
-- body then fails with 42883: `function get_my_claim(unknown) does not exist`.
-- Staging/preview escape because they still carry the original definition
-- with `SET search_path TO 'public', 'pg_temp'` baked in.
--
-- Fix:
-- 1. Set `search_path = ''` explicitly so behaviour is independent of caller.
-- 2. Fully-qualify get_my_claim with an explicit text cast.
-- 3. Match against the known-good HQ Clerk org ids in an IN list, so the
--    same migration ships identically to every environment. Org ids are
--    public Clerk identifiers (not secrets); when a new env is added, append
--    its org id here in a new migration.

create or replace function public.is_dexapos_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.get_my_claim('org_id'::text) in (
    'org_33z36QibAMZy6kc2xZNYmDl5duh',  -- staging / preview HQ
    'org_3Bu8LTB01a5vXfYnOc9ZUznm8lL'   -- prod HQ
  );
$function$;

revoke all on function public.is_dexapos_admin() from public;
grant execute on function public.is_dexapos_admin() to authenticated, service_role;

notify pgrst, 'reload schema';
