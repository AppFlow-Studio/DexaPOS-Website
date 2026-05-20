-- ============================================================================
-- NMI online ordering hard cut
-- Description:
--   Replace Dejavoo/iPOS online-ordering credential storage with a merchant-
--   scoped NMI credential model. The public tokenization key is stored in-table
--   and the private API key is stored in Supabase Vault.
-- ============================================================================

create table if not exists public.merchant_payment_credentials (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider text not null,
  tokenization_key text not null,
  private_api_key_secret_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_payment_credentials_provider_check
    check (provider = any (array['nmi'::text])),
  constraint merchant_payment_credentials_unique_provider
    unique (merchant_id, provider)
);
create table if not exists public.merchant_payment_credential_access_log (
  id uuid primary key default gen_random_uuid(),
  merchant_payment_credential_id uuid references public.merchant_payment_credentials(id) on delete set null,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  function_name text not null,
  store_config_id uuid references public.online_store_config(id) on delete set null,
  actor_user_id text,
  called_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_merchant_payment_credentials_merchant
  on public.merchant_payment_credentials (merchant_id, provider, is_active);
create index if not exists idx_merchant_payment_credential_access_log_credential_called_at
  on public.merchant_payment_credential_access_log (merchant_payment_credential_id, called_at desc);
create index if not exists idx_merchant_payment_credential_access_log_merchant_called_at
  on public.merchant_payment_credential_access_log (merchant_id, called_at desc);
alter table public.merchant_payment_credentials enable row level security;
alter table public.merchant_payment_credentials force row level security;
alter table public.merchant_payment_credential_access_log enable row level security;
alter table public.merchant_payment_credential_access_log force row level security;
drop policy if exists merchant_payment_credentials_select on public.merchant_payment_credentials;
create policy merchant_payment_credentials_select
  on public.merchant_payment_credentials
  for select
  to authenticated
  using (
    public.is_dexapos_admin()
  );
drop policy if exists merchant_payment_credentials_insert on public.merchant_payment_credentials;
create policy merchant_payment_credentials_insert
  on public.merchant_payment_credentials
  for insert
  to authenticated
  with check (
    public.is_dexapos_admin()
  );
drop policy if exists merchant_payment_credentials_update on public.merchant_payment_credentials;
create policy merchant_payment_credentials_update
  on public.merchant_payment_credentials
  for update
  to authenticated
  using (
    public.is_dexapos_admin()
  )
  with check (
    public.is_dexapos_admin()
  );
drop policy if exists merchant_payment_credential_access_log_select on public.merchant_payment_credential_access_log;
create policy merchant_payment_credential_access_log_select
  on public.merchant_payment_credential_access_log
  for select
  to authenticated
  using (
    public.is_dexapos_admin()
  );
create or replace function public.list_merchant_payment_credentials(
  p_merchant_id uuid
)
returns table (
  id uuid,
  merchant_id uuid,
  provider text,
  tokenization_key text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  api_key_configured boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    mpc.id,
    mpc.merchant_id,
    mpc.provider,
    mpc.tokenization_key,
    mpc.is_active,
    mpc.created_at,
    mpc.updated_at,
    mpc.private_api_key_secret_id is not null as api_key_configured
  from public.merchant_payment_credentials mpc
  where mpc.merchant_id = p_merchant_id
    and (
      coalesce(auth.jwt()->>'role', '') = 'service_role'
      or public.is_dexapos_admin()
    );
$$;
create or replace function public.get_merchant_payment_api_secret(
  p_merchant_id uuid,
  p_provider text default 'nmi'
)
returns table (
  credential_id uuid,
  merchant_id uuid,
  provider text,
  tokenization_key text,
  decrypted_secret text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_credential public.merchant_payment_credentials%rowtype;
begin
  if not (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_dexapos_admin()
  ) then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  select *
  into v_credential
  from public.merchant_payment_credentials mpc
  where mpc.merchant_id = p_merchant_id
    and mpc.provider = p_provider
    and mpc.is_active = true
  limit 1;

  if v_credential.id is null then
    return;
  end if;

  return query
  select
    v_credential.id,
    v_credential.merchant_id,
    v_credential.provider,
    v_credential.tokenization_key,
    ds.decrypted_secret,
    v_credential.is_active
  from vault.decrypted_secrets ds
  where ds.id = v_credential.private_api_key_secret_id
  limit 1;
end;
$$;
create or replace function public.upsert_merchant_payment_credentials(
  p_merchant_id uuid,
  p_provider text default 'nmi',
  p_tokenization_key text default null,
  p_private_api_key text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_existing public.merchant_payment_credentials%rowtype;
  v_secret_id uuid;
  v_secret_name text;
  v_tokenization_key text := nullif(trim(coalesce(p_tokenization_key, '')), '');
  v_private_api_key text := nullif(trim(coalesce(p_private_api_key, '')), '');
begin
  if not (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_dexapos_admin()
  ) then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  select *
  into v_merchant
  from public.merchants m
  where m.id = p_merchant_id
  limit 1;

  if v_merchant.id is null then
    raise exception 'Merchant % not found', p_merchant_id
      using errcode = '42501';
  end if;

  if p_provider is null or trim(p_provider) <> 'nmi' then
    raise exception 'Unsupported payment provider: %', p_provider
      using errcode = '22023';
  end if;

  if v_tokenization_key is null then
    raise exception 'Tokenization key is required'
      using errcode = '22023';
  end if;

  select *
  into v_existing
  from public.merchant_payment_credentials mpc
  where mpc.merchant_id = p_merchant_id
    and mpc.provider = 'nmi'
  limit 1;

  v_secret_name := format('nmi_api_key:%s:%s', p_merchant_id, 'nmi');
  v_secret_id := v_existing.private_api_key_secret_id;

  if v_secret_id is null then
    select s.id
    into v_secret_id
    from vault.secrets s
    where s.name = v_secret_name
    limit 1;
  end if;

  if v_secret_id is null and v_private_api_key is null then
    raise exception 'Private API key is required for a new merchant credential'
      using errcode = '22023';
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_private_api_key,
      v_secret_name,
      'NMI private API key for merchant ' || p_merchant_id
    );
  elsif v_private_api_key is not null then
    perform vault.update_secret(v_secret_id, v_private_api_key);
  end if;

  insert into public.merchant_payment_credentials (
    merchant_id,
    provider,
    tokenization_key,
    private_api_key_secret_id,
    is_active
  )
  values (
    p_merchant_id,
    'nmi',
    v_tokenization_key,
    v_secret_id,
    coalesce(p_is_active, true)
  )
  on conflict (merchant_id, provider) do update
    set tokenization_key = excluded.tokenization_key,
        private_api_key_secret_id = excluded.private_api_key_secret_id,
        is_active = excluded.is_active,
        updated_at = now()
  returning id into v_secret_id;

  return v_secret_id;
end;
$$;
revoke all on function public.list_merchant_payment_credentials(uuid) from public, anon;
grant execute on function public.list_merchant_payment_credentials(uuid) to authenticated, service_role;
revoke all on function public.get_merchant_payment_api_secret(uuid, text) from public, anon;
grant execute on function public.get_merchant_payment_api_secret(uuid, text) to authenticated, service_role;
revoke all on function public.upsert_merchant_payment_credentials(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.upsert_merchant_payment_credentials(uuid, text, text, text, boolean) to authenticated, service_role;
