-- Central Dexa SaaS billing rail (Valor).
--
-- SaaS subscription fees must settle to Dexa's own bank, so they are charged
-- through a single Dexa-owned merchant-of-record (the "DEXA POS AI" Valor
-- merchant) rather than each merchant's own EPI (which would settle the money
-- right back to the merchant). This extends the existing platform billing rail
-- config -- originally built for the dormant NMI rail -- to hold the central
-- Valor credentials as the provider='valor' singleton. provisionSubscriptionBillingRail
-- clones these onto each merchant's purpose='subscription' account row, so the
-- charge + card-vault paths transparently run on the central EPI.

begin;

alter table public.platform_billing_provider_configs
  add column if not exists valor_epi text,
  add column if not exists valor_appid text;

-- tokenization_key is NMI-only (public NMI key); Valor rows have none.
alter table public.platform_billing_provider_configs
  alter column tokenization_key drop not null;

alter table public.platform_billing_provider_configs
  drop constraint if exists platform_billing_provider_configs_provider_check;
alter table public.platform_billing_provider_configs
  add constraint platform_billing_provider_configs_provider_check
    check (provider = any (array['nmi'::text, 'valor'::text]));

-- A Valor rail needs an EPI + app id; the paired app key lives in vault
-- (private_api_key_secret_id), same as the NMI private key.
alter table public.platform_billing_provider_configs
  drop constraint if exists platform_billing_provider_configs_valor_fields_check;
alter table public.platform_billing_provider_configs
  add constraint platform_billing_provider_configs_valor_fields_check
    check (
      provider <> 'valor'
      or (
        nullif(trim(coalesce(valor_epi, '')), '') is not null
        and nullif(trim(coalesce(valor_appid, '')), '') is not null
      )
    );

comment on column public.platform_billing_provider_configs.valor_epi is
  'Valor device EPI for the central Dexa SaaS billing merchant (DEXA POS AI). Only set for provider=valor rows.';
comment on column public.platform_billing_provider_configs.valor_appid is
  'Valor app id for the central Dexa SaaS billing EPI. Only set for provider=valor rows. The paired app key is vaulted via private_api_key_secret_id.';

-- ============================================================================
-- WRITE: set / rotate the central Valor SaaS credentials
-- ============================================================================
create or replace function public.upsert_platform_valor_saas_config(
  p_epi              text,
  p_appid            text,
  p_appkey           text default null,
  p_appkey_secret_id uuid default null,
  p_label            text default 'Dexa SaaS Billing (Valor)',
  p_is_active        boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing    public.platform_billing_provider_configs%rowtype;
  v_secret_id   uuid;
  v_secret_name text := 'platform_billing_provider:valor';
  v_epi         text := nullif(trim(coalesce(p_epi, '')), '');
  v_appid       text := nullif(trim(coalesce(p_appid, '')), '');
  v_appkey      text := nullif(trim(coalesce(p_appkey, '')), '');
  v_config_id   uuid;
begin
  if not (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.is_dexapos_admin()
  ) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if v_epi is null then
    raise exception 'Valor EPI is required' using errcode = '22023';
  end if;
  if v_appid is null then
    raise exception 'Valor app id is required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.platform_billing_provider_configs
  where provider = 'valor'
  limit 1;

  -- Resolve the vault secret holding the app key:
  --  1) an explicit existing secret id (reference an already-vaulted key), else
  --  2) a plaintext app key -> create/update the well-known secret, else
  --  3) reuse the existing row's secret.
  v_secret_id := p_appkey_secret_id;

  if v_secret_id is null and v_appkey is not null then
    select s.id into v_secret_id from vault.secrets s where s.name = v_secret_name limit 1;
    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_appkey, v_secret_name, 'Valor app key for the central Dexa SaaS billing rail'
      );
    else
      perform vault.update_secret(v_secret_id, v_appkey);
    end if;
  end if;

  if v_secret_id is null then
    v_secret_id := v_existing.private_api_key_secret_id;
  end if;

  if v_secret_id is null then
    raise exception 'Valor app key (or an existing vault secret id) is required for a new config'
      using errcode = '22023';
  end if;

  insert into public.platform_billing_provider_configs (
    provider, label, tokenization_key, private_api_key_secret_id,
    valor_epi, valor_appid, is_active
  )
  values (
    'valor', coalesce(nullif(trim(coalesce(p_label, '')), ''), 'Dexa SaaS Billing (Valor)'),
    null, v_secret_id, v_epi, v_appid, coalesce(p_is_active, true)
  )
  on conflict (provider) do update
    set label                     = excluded.label,
        private_api_key_secret_id = excluded.private_api_key_secret_id,
        valor_epi                 = excluded.valor_epi,
        valor_appid               = excluded.valor_appid,
        is_active                 = excluded.is_active,
        updated_at                = now()
  returning id into v_config_id;

  return v_config_id;
end;
$$;

-- ============================================================================
-- READ (provisioning source): epi/appid + the app-key vault secret id.
-- Returns only the secret *reference* (uuid), never the decrypted key; the
-- charge path decrypts via get_valor_account_credentials on the cloned row.
-- ============================================================================
create or replace function public.get_platform_valor_saas_source()
returns table (
  config_id              uuid,
  valor_epi              text,
  valor_appid            text,
  valor_appkey_secret_id uuid,
  is_active              boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.is_dexapos_admin()
  ) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select cfg.id, cfg.valor_epi, cfg.valor_appid, cfg.private_api_key_secret_id, cfg.is_active
  from public.platform_billing_provider_configs cfg
  where cfg.provider = 'valor' and cfg.is_active = true
  limit 1;
end;
$$;

revoke all on function public.upsert_platform_valor_saas_config(text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.upsert_platform_valor_saas_config(text, text, text, uuid, text, boolean) to authenticated, service_role;
revoke all on function public.get_platform_valor_saas_source() from public, anon;
grant execute on function public.get_platform_valor_saas_source() to authenticated, service_role;

commit;
