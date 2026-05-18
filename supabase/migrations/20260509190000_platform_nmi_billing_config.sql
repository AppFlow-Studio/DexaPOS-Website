create table if not exists public.platform_billing_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  label text not null default 'Dexa Billing',
  tokenization_key text not null,
  private_api_key_secret_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_billing_provider_configs_provider_check
    check (provider = any (array['nmi'::text]))
);

comment on table public.platform_billing_provider_configs is
  'Platform-level billing rail credentials owned by Dexa. Separate from location payment devices and used only for Dexa subscription billing and merchant billing-card vault storage.';

comment on column public.platform_billing_provider_configs.tokenization_key is
  'Public NMI tokenization key for the Dexa Billing merchant account.';

comment on column public.platform_billing_provider_configs.private_api_key_secret_id is
  'Vault secret id for the Dexa Billing merchant account private NMI API key.';

alter table public.merchant_billing_profiles
  add column if not exists platform_billing_config_id uuid references public.platform_billing_provider_configs(id) on delete set null;

create index if not exists idx_merchant_billing_profiles_platform_billing_config
  on public.merchant_billing_profiles(platform_billing_config_id);

alter table public.platform_billing_provider_configs enable row level security;
alter table public.platform_billing_provider_configs force row level security;

drop policy if exists platform_billing_provider_configs_select on public.platform_billing_provider_configs;
create policy platform_billing_provider_configs_select
  on public.platform_billing_provider_configs
  for select
  to authenticated
  using (public.is_dexapos_admin());

drop policy if exists platform_billing_provider_configs_insert on public.platform_billing_provider_configs;
create policy platform_billing_provider_configs_insert
  on public.platform_billing_provider_configs
  for insert
  to authenticated
  with check (public.is_dexapos_admin());

drop policy if exists platform_billing_provider_configs_update on public.platform_billing_provider_configs;
create policy platform_billing_provider_configs_update
  on public.platform_billing_provider_configs
  for update
  to authenticated
  using (public.is_dexapos_admin())
  with check (public.is_dexapos_admin());

create or replace function public.get_platform_billing_provider_config(
  p_provider text default 'nmi'
)
returns table (
  id uuid,
  provider text,
  label text,
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
    cfg.id,
    cfg.provider,
    cfg.label,
    cfg.tokenization_key,
    cfg.is_active,
    cfg.created_at,
    cfg.updated_at,
    cfg.private_api_key_secret_id is not null as api_key_configured
  from public.platform_billing_provider_configs cfg
  where cfg.provider = coalesce(nullif(trim(p_provider), ''), 'nmi')
    and (
      coalesce(auth.jwt()->>'role', '') = 'service_role'
      or public.is_dexapos_admin()
    )
  limit 1;
$$;

create or replace function public.get_platform_billing_provider_secret(
  p_provider text default 'nmi'
)
returns table (
  config_id uuid,
  provider text,
  label text,
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
  v_config public.platform_billing_provider_configs%rowtype;
begin
  if not (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_dexapos_admin()
  ) then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  select *
  into v_config
  from public.platform_billing_provider_configs cfg
  where cfg.provider = coalesce(nullif(trim(p_provider), ''), 'nmi')
    and cfg.is_active = true
  limit 1;

  if v_config.id is null then
    return;
  end if;

  return query
  select
    v_config.id,
    v_config.provider,
    v_config.label,
    v_config.tokenization_key,
    ds.decrypted_secret,
    v_config.is_active
  from vault.decrypted_secrets ds
  where ds.id = v_config.private_api_key_secret_id
  limit 1;
end;
$$;

create or replace function public.upsert_platform_billing_provider_config(
  p_provider text default 'nmi',
  p_label text default 'Dexa Billing',
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
  v_existing public.platform_billing_provider_configs%rowtype;
  v_secret_id uuid;
  v_secret_name text;
  v_provider text := coalesce(nullif(trim(p_provider), ''), 'nmi');
  v_label text := coalesce(nullif(trim(p_label), ''), 'Dexa Billing');
  v_tokenization_key text := nullif(trim(coalesce(p_tokenization_key, '')), '');
  v_private_api_key text := nullif(trim(coalesce(p_private_api_key, '')), '');
  v_config_id uuid;
begin
  if not (
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_dexapos_admin()
  ) then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  if v_provider <> 'nmi' then
    raise exception 'Unsupported payment provider: %', v_provider
      using errcode = '22023';
  end if;

  if v_tokenization_key is null then
    raise exception 'Tokenization key is required'
      using errcode = '22023';
  end if;

  select *
  into v_existing
  from public.platform_billing_provider_configs cfg
  where cfg.provider = v_provider
  limit 1;

  v_secret_name := format('platform_billing_provider:%s', v_provider);
  v_secret_id := v_existing.private_api_key_secret_id;

  if v_secret_id is null then
    select s.id
    into v_secret_id
    from vault.secrets s
    where s.name = v_secret_name
    limit 1;
  end if;

  if v_secret_id is null and v_private_api_key is null then
    raise exception 'Private API key is required for a new platform billing config'
      using errcode = '22023';
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_private_api_key,
      v_secret_name,
      'NMI private API key for Dexa platform billing rail'
    );
  elsif v_private_api_key is not null then
    perform vault.update_secret(v_secret_id, v_private_api_key);
  end if;

  insert into public.platform_billing_provider_configs (
    provider,
    label,
    tokenization_key,
    private_api_key_secret_id,
    is_active
  )
  values (
    v_provider,
    v_label,
    v_tokenization_key,
    v_secret_id,
    coalesce(p_is_active, true)
  )
  on conflict (provider) do update
    set label = excluded.label,
        tokenization_key = excluded.tokenization_key,
        private_api_key_secret_id = excluded.private_api_key_secret_id,
        is_active = excluded.is_active,
        updated_at = now()
  returning id into v_config_id;

  return v_config_id;
end;
$$;

revoke all on function public.get_platform_billing_provider_config(text) from public, anon;
grant execute on function public.get_platform_billing_provider_config(text) to authenticated, service_role;

revoke all on function public.get_platform_billing_provider_secret(text) from public, anon;
grant execute on function public.get_platform_billing_provider_secret(text) to authenticated, service_role;

revoke all on function public.upsert_platform_billing_provider_config(text, text, text, text, boolean) from public, anon;
grant execute on function public.upsert_platform_billing_provider_config(text, text, text, text, boolean) to authenticated, service_role;
