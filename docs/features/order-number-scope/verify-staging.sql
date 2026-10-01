-- Staging checks for 20260930170000_order_number_scope_per_location.
-- Sections 1-5 are read-only. Section 6 runs in a transaction that is rolled
-- back; use a TEST location, because nextval on a sequence that already
-- existed is not rolled back.

-- 1. Uniqueness: only (location_id, order_number) guards order_number.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.orders'::regclass and contype = 'u';
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'orders' and indexdef ilike '%order_number%';
-- expect: orders_order_number_location_key only; no orders_order_number_merchant_key,
--         no idx_unique_order_number_per_merchant

-- 2. No session-level advisory lock; definer + search_path on every function.
select p.proname,
       pg_get_functiondef(p.oid) !~ 'pg_advisory_lock\(' as no_session_lock,
       p.prosecdef as security_definer,
       p.proconfig as config
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('generate_order_number', 'generate_order_number_internal', 'create_order_v4',
                     '_unused_order_number', '_order_number_scope_switched');
-- expect: no_session_lock = true, security_definer = true,
--         config = {"search_path=public, pg_temp"} on all five

-- 3. Trigger and default config.
select tgname, tgenabled from pg_trigger where tgname = 'trg_locations_order_number_scope_switched';
select public.default_pos_config_v1() #>> '{ordering,orderNumberScope}';  -- per_station

-- 4. Every location-keyed day sequence is registered (cleanup drops by registry).
select c.relname
  from pg_class c
 where c.relkind = 'S' and c.relname like 'ord\_seq\_l%'
   and not exists (select 1 from public.order_number_day_sequences r where r.sequence_name = c.relname);
-- expect: no rows

-- 5. Locations and their scope.
select id, name, pos_config #>> '{ordering,orderNumberScope}' as scope
  from public.locations
 where pos_config #>> '{ordering,orderNumberScope}' is not null;

-- 6. Generator behaviour on a TEST location (replace both placeholders).
begin;
select public.generate_order_number('<test-location-id>', '<station-1-id>');
-- expect ORD-<local date>-S1-NNNN
update public.locations
   set pos_config = jsonb_set(pos_config, '{ordering}',
                              jsonb_build_object('orderNumberScope', 'location_wide'))
 where id = '<test-location-id>';
select public.generate_order_number('<test-location-id>', '<station-1-id>') as first,
       public.generate_order_number('<test-location-id>', '<station-1-id>') as second;
-- expect ORD-<local date>-NNNN twice, consecutive, above every S{n} number the
-- location used today
rollback;

-- create_order_v4 checks need a staff JWT; run them from the tablet
-- (README "Verification → On devices").
