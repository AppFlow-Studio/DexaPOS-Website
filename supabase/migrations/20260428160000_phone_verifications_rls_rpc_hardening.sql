-- =============================================================================
-- Phone verifications hardening
-- Scope:
-- - resolve the rls_enabled_no_policy state on public.phone_verifications
-- - stop storing plaintext OTP codes
-- - move legitimate phone_verifications reads/writes into SECURITY DEFINER RPCs
-- - add scheduled cleanup for expired verification rows
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Store hashed OTP values instead of plaintext codes
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'phone_verifications'
      and column_name = 'code'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'phone_verifications'
      and column_name = 'code_hash'
  ) then
    execute 'alter table public.phone_verifications rename column code to code_hash';
  end if;
end
$$;

alter table public.phone_verifications
  add column if not exists request_ip inet;

comment on column public.phone_verifications.code_hash is
  'bcrypt hash of the OTP code. Plaintext OTP values must never be stored.';

comment on column public.phone_verifications.request_ip is
  'Request IP captured during OTP issuance for coarse rate limiting and abuse review.';

update public.phone_verifications
set code_hash = extensions.crypt(code_hash, extensions.gen_salt('bf', 10))
where code_hash is not null
  and code_hash !~ '^\$2[aby]\$';

create index if not exists idx_phone_verifications_request_ip_created
  on public.phone_verifications (request_ip, created_at desc)
  where request_ip is not null;

-- -----------------------------------------------------------------------------
-- 2. RLS policy: no direct table access for anon/authenticated
--    Legitimate access goes through SECURITY DEFINER RPCs below.
-- -----------------------------------------------------------------------------

drop policy if exists phone_verifications_direct_access_denied on public.phone_verifications;
drop policy if exists phone_verifications_insert on public.phone_verifications;
drop policy if exists phone_verifications_select on public.phone_verifications;
drop policy if exists phone_verifications_update on public.phone_verifications;
drop policy if exists phone_verifications_delete on public.phone_verifications;

create policy phone_verifications_direct_access_denied
on public.phone_verifications
for all
to anon, authenticated
using (false)
with check (false);

-- -----------------------------------------------------------------------------
-- 3. OTP issue RPC
-- -----------------------------------------------------------------------------

create or replace function public.issue_phone_verification_otp(
  p_phone text,
  p_merchant_id uuid,
  p_code text,
  p_request_ip inet default null,
  p_expires_at timestamptz default (now() + interval '5 minutes')
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rate_limit_per_phone constant integer := 5;
  v_rate_limit_per_ip constant integer := 30;
  v_phone text := btrim(coalesce(p_phone, ''));
  v_recent_phone_count integer := 0;
  v_recent_ip_count integer := 0;
  v_verification_id uuid;
begin
  if v_phone = '' or p_merchant_id is null or btrim(coalesce(p_code, '')) = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid verification request'
    );
  end if;

  select count(*)::integer
  into v_recent_phone_count
  from public.phone_verifications
  where phone = v_phone
    and merchant_id = p_merchant_id
    and created_at >= now() - interval '1 hour';

  if v_recent_phone_count >= v_rate_limit_per_phone then
    return jsonb_build_object(
      'success', false,
      'error', 'Too many attempts. Try again later.'
    );
  end if;

  if p_request_ip is not null then
    select count(*)::integer
    into v_recent_ip_count
    from public.phone_verifications
    where request_ip = p_request_ip
      and created_at >= now() - interval '1 hour';

    if v_recent_ip_count >= v_rate_limit_per_ip then
      return jsonb_build_object(
        'success', false,
        'error', 'Too many requests from this network. Try again later.'
      );
    end if;
  end if;

  insert into public.phone_verifications (
    id,
    phone,
    code_hash,
    merchant_id,
    attempts,
    max_attempts,
    expires_at,
    verified_at,
    created_at,
    request_ip
  )
  values (
    extensions.gen_random_uuid(),
    v_phone,
    extensions.crypt(p_code, extensions.gen_salt('bf', 10)),
    p_merchant_id,
    0,
    3,
    p_expires_at,
    null,
    now(),
    p_request_ip
  )
  returning id into v_verification_id;

  return jsonb_build_object(
    'success', true,
    'verification_id', v_verification_id
  );
end;
$function$;

revoke all on function public.issue_phone_verification_otp(text, uuid, text, inet, timestamptz) from public;
revoke all on function public.issue_phone_verification_otp(text, uuid, text, inet, timestamptz) from anon;
revoke all on function public.issue_phone_verification_otp(text, uuid, text, inet, timestamptz) from authenticated;
grant execute on function public.issue_phone_verification_otp(text, uuid, text, inet, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- 4. OTP verify RPC
-- -----------------------------------------------------------------------------

create or replace function public.verify_phone_verification_otp(
  p_phone text,
  p_merchant_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text := btrim(coalesce(p_phone, ''));
  v_verification record;
  v_new_attempts integer;
begin
  if v_phone = '' or p_merchant_id is null or btrim(coalesce(p_code, '')) = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid verification request'
    );
  end if;

  select
    id,
    code_hash,
    attempts,
    max_attempts,
    verified_at,
    expires_at,
    created_at
  into v_verification
  from public.phone_verifications
  where phone = v_phone
    and merchant_id = p_merchant_id
    and verified_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'No active verification found. Request a new code.'
    );
  end if;

  if v_verification.attempts >= v_verification.max_attempts then
    return jsonb_build_object(
      'success', false,
      'error', 'Too many failed attempts. Request a new code.'
    );
  end if;

  if extensions.crypt(p_code, v_verification.code_hash) = v_verification.code_hash then
    update public.phone_verifications
    set verified_at = now()
    where id = v_verification.id;

    return jsonb_build_object(
      'success', true,
      'verification_id', v_verification.id
    );
  end if;

  v_new_attempts := v_verification.attempts + 1;

  update public.phone_verifications
  set attempts = v_new_attempts
  where id = v_verification.id;

  return jsonb_build_object(
    'success', false,
    'error', 'Invalid code',
    'attempts', v_new_attempts,
    'remaining_attempts', greatest(v_verification.max_attempts - v_new_attempts, 0)
  );
end;
$function$;

revoke all on function public.verify_phone_verification_otp(text, uuid, text) from public;
revoke all on function public.verify_phone_verification_otp(text, uuid, text) from anon;
revoke all on function public.verify_phone_verification_otp(text, uuid, text) from authenticated;
grant execute on function public.verify_phone_verification_otp(text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Cleanup function + daily schedule
-- -----------------------------------------------------------------------------

create or replace function public.cleanup_phone_verifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
begin
  delete from public.phone_verifications
  where (verified_at is null and expires_at < now() - interval '24 hours')
     or (verified_at is not null and verified_at < now() - interval '7 days');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.cleanup_phone_verifications() from public;
grant execute on function public.cleanup_phone_verifications() to service_role;

do $$
declare
  v_job_id bigint;
begin
  begin
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'cleanup-phone-verifications'
    limit 1;
  exception
    when undefined_table then
      v_job_id := null;
  end;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  begin
    perform cron.schedule(
      'cleanup-phone-verifications',
      '15 3 * * *',
      'select public.cleanup_phone_verifications();'
    );
  exception
    when undefined_function then
      raise notice 'cron.schedule is unavailable; schedule public.cleanup_phone_verifications() manually';
    when insufficient_privilege then
      raise notice 'insufficient privilege to schedule cleanup-phone-verifications; schedule manually';
  end;
end
$$;

commit;
