-- Phone verifications hardening validation
-- Run after applying:
--   supabase/migrations/20260428160000_phone_verifications_rls_rpc_hardening.sql

-- -----------------------------------------------------------------------------
-- 1. Table shape and policy presence
-- -----------------------------------------------------------------------------
select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'phone_verifications';

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'phone_verifications';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'phone_verifications'
order by ordinal_position;

-- -----------------------------------------------------------------------------
-- 2. Direct anon table access remains blocked
-- -----------------------------------------------------------------------------
begin;
set local role anon;

select count(*) as anon_visible_rows
from public.phone_verifications;

rollback;

-- -----------------------------------------------------------------------------
-- 3. Direct anon RPC execution is blocked
-- -----------------------------------------------------------------------------
begin;
set local role anon;

select has_function_privilege(
  'anon',
  'public.issue_phone_verification_otp(text, uuid, text, inet, timestamptz)',
  'EXECUTE'
) as anon_can_issue_otp;

select has_function_privilege(
  'anon',
  'public.verify_phone_verification_otp(text, uuid, text)',
  'EXECUTE'
) as anon_can_verify_otp;

rollback;

-- -----------------------------------------------------------------------------
-- 4. Service role still sees full count and can execute the RPCs
-- -----------------------------------------------------------------------------
begin;
set local role service_role;

select count(*) as service_role_visible_rows
from public.phone_verifications;

select has_function_privilege(
  'service_role',
  'public.issue_phone_verification_otp(text, uuid, text, inet, timestamptz)',
  'EXECUTE'
) as service_role_can_issue_otp;

select has_function_privilege(
  'service_role',
  'public.verify_phone_verification_otp(text, uuid, text)',
  'EXECUTE'
) as service_role_can_verify_otp;

rollback;

-- -----------------------------------------------------------------------------
-- 5. Cleanup job metadata
-- -----------------------------------------------------------------------------
select
  jobid,
  jobname,
  schedule,
  command
from cron.job
where jobname = 'cleanup-phone-verifications';
