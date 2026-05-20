-- Bulldozer fix for the recurring `function get_my_claim(unknown) does not exist`,
-- `relation "menu_items" does not exist`, and similar errors on prod.
--
-- Background:
-- Lane I (20260427170000_security_hardening_lanes_e_to_i.sql) and follow-ups
-- (20260430160000, 20260430170000, 20260430180000) set `search_path = ''` on
-- many SECURITY DEFINER functions for hardening, then qualified each body
-- with `public.` to keep them working. That works as long as EVERY body in
-- the database is perfectly qualified.
--
-- In practice, prod has functions whose bodies were *not* fully qualified
-- (either older definitions still have `search_path=''` from earlier hardening
-- attempts, or a function was manually redefined without a SET clause). When
-- those run, unqualified references fail with 42P01 / 42883.
--
-- Fix: for every function in the `public` schema whose proconfig contains an
-- empty `search_path=` setting, reset its search_path to `public, pg_temp`.
-- Functions whose bodies are already fully qualified (Lane I helpers, the
-- 20260430160000/170000/180000 set) are unaffected — they continue to work
-- the same way, they just no longer claim the empty-search_path hardening.
-- Functions with unqualified bodies start working again.
--
-- This migration is idempotent and database-state-driven, so it produces
-- the correct outcome regardless of which env it's applied to (prod, staging,
-- preview) or what their current function-by-function state happens to be.

do $$
declare
  v_func record;
  v_count int := 0;
begin
  for v_func in
    select
      n.nspname  as schema_name,
      p.proname  as func_name,
      pg_get_function_identity_arguments(p.oid) as args,
      n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proconfig is not null
      and 'search_path=' = any(p.proconfig)
    order by p.proname, p.oid
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public, pg_temp',
      v_func.schema_name, v_func.func_name, v_func.args
    );
    raise notice 'Reset search_path on %', v_func.sig;
    v_count := v_count + 1;
  end loop;
  raise notice 'Total functions reset: %', v_count;
end;
$$;
-- Force PostgREST to refresh its schema cache so the changes take effect
-- immediately on the API surface.
notify pgrst, 'reload schema';
