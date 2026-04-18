create extension if not exists "supabase_vault" with schema "vault";

create table if not exists public.location_payment_devices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  provider text not null default 'dejavoo' check (provider in ('dejavoo', 'ipospays')),
  device_label text,
  tpn text not null,
  ftd_ecom_key_secret_id uuid not null,
  whitelist_origins text[] not null default '{}'::text[],
  whitelist_synced_at timestamptz,
  last_synced_from_crm_at timestamptz,
  is_active boolean not null default true,
  use_for_online_ordering boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_payment_devices_location_tpn_key unique (location_id, tpn)
);

create unique index if not exists location_payment_devices_one_online_per_location
  on public.location_payment_devices (location_id)
  where use_for_online_ordering = true and is_active = true;

create index if not exists idx_location_payment_devices_location
  on public.location_payment_devices (merchant_id, location_id);

create index if not exists idx_location_payment_devices_carrier
  on public.location_payment_devices (carrier_id);

create trigger update_location_payment_devices_updated_at
before update on public.location_payment_devices
for each row execute function public.update_updated_at_column();

create table if not exists public.payment_credential_access_log (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.location_payment_devices(id) on delete cascade,
  function_name text not null,
  store_config_id uuid references public.online_store_config(id) on delete set null,
  actor_user_id text,
  called_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_payment_credential_access_log_device_called_at
  on public.payment_credential_access_log (device_id, called_at desc);

alter table public.location_payment_devices enable row level security;
alter table public.payment_credential_access_log enable row level security;

create policy location_payment_devices_select
on public.location_payment_devices
for select
to authenticated
using (
  public.is_dexapos_admin()
  or public.is_merchant_admin(merchant_id)
  or public.is_location_member(location_id)
  or carrier_id = public.get_my_carrier_id()
);

create policy location_payment_devices_insert
on public.location_payment_devices
for insert
to authenticated
with check (
  public.is_dexapos_admin()
  or public.is_merchant_admin(merchant_id)
  or carrier_id = public.get_my_carrier_id()
);

create policy location_payment_devices_update
on public.location_payment_devices
for update
to authenticated
using (
  public.is_dexapos_admin()
  or public.is_merchant_admin(merchant_id)
  or carrier_id = public.get_my_carrier_id()
)
with check (
  public.is_dexapos_admin()
  or public.is_merchant_admin(merchant_id)
  or carrier_id = public.get_my_carrier_id()
);

create policy payment_credential_access_log_select
on public.payment_credential_access_log
for select
to authenticated
using (
  public.is_dexapos_admin()
  or exists (
    select 1
    from public.location_payment_devices lpd
    where lpd.id = payment_credential_access_log.device_id
      and (
        public.is_merchant_admin(lpd.merchant_id)
        or public.is_location_member(lpd.location_id)
        or lpd.carrier_id = public.get_my_carrier_id()
      )
  )
);

create or replace function public.list_location_payment_devices(
  p_location_id uuid
)
returns table (
  id uuid,
  merchant_id uuid,
  location_id uuid,
  provider text,
  device_label text,
  tpn text,
  whitelist_origins text[],
  whitelist_synced_at timestamptz,
  last_synced_from_crm_at timestamptz,
  is_active boolean,
  use_for_online_ordering boolean,
  created_at timestamptz,
  updated_at timestamptz,
  ftd_key_configured boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_merchant_id uuid;
  v_carrier_id uuid;
begin
  select l.merchant_id, m.carrier_id
  into v_merchant_id, v_carrier_id
  from public.locations l
  join public.merchants m on m.id = l.merchant_id
  where l.id = p_location_id;

  if v_merchant_id is null then
    raise exception 'Location % not found', p_location_id
      using errcode = '42501';
  end if;

  if not (
    public.is_dexapos_admin()
    or public.is_merchant_admin(v_merchant_id)
    or public.is_location_member(p_location_id)
    or v_carrier_id = public.get_my_carrier_id()
  ) then
    raise exception 'Unauthorized: no access to location %', p_location_id
      using errcode = '42501';
  end if;

  return query
  select
    lpd.id,
    lpd.merchant_id,
    lpd.location_id,
    lpd.provider,
    lpd.device_label,
    lpd.tpn,
    lpd.whitelist_origins,
    lpd.whitelist_synced_at,
    lpd.last_synced_from_crm_at,
    lpd.is_active,
    lpd.use_for_online_ordering,
    lpd.created_at,
    lpd.updated_at,
    true as ftd_key_configured
  from public.location_payment_devices lpd
  where lpd.location_id = p_location_id
  order by lpd.use_for_online_ordering desc, lpd.updated_at desc, lpd.created_at desc;
end;
$function$;

create or replace function public.upsert_location_payment_device(
  p_location_id uuid,
  p_tpn text,
  p_ftd_ecom_key text default null,
  p_device_label text default null,
  p_use_for_online_ordering boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $function$
declare
  v_merchant_id uuid;
  v_carrier_id uuid;
  v_device_id uuid;
  v_existing_secret_id uuid;
  v_secret_id uuid;
  v_secret_name text;
  v_trimmed_tpn text := nullif(trim(p_tpn), '');
  v_trimmed_ftd_key text := nullif(trim(coalesce(p_ftd_ecom_key, '')), '');
begin
  select l.merchant_id, m.carrier_id
  into v_merchant_id, v_carrier_id
  from public.locations l
  join public.merchants m on m.id = l.merchant_id
  where l.id = p_location_id;

  if v_merchant_id is null then
    raise exception 'Location % not found', p_location_id
      using errcode = '42501';
  end if;

  if not (
    public.is_dexapos_admin()
    or public.is_merchant_admin(v_merchant_id)
    or v_carrier_id = public.get_my_carrier_id()
  ) then
    raise exception 'Unauthorized: no access to location %', p_location_id
      using errcode = '42501';
  end if;

  if v_trimmed_tpn is null then
    raise exception 'TPN is required' using errcode = '22023';
  end if;

  select lpd.id, lpd.ftd_ecom_key_secret_id
  into v_device_id, v_existing_secret_id
  from public.location_payment_devices lpd
  where lpd.location_id = p_location_id
    and lpd.tpn = v_trimmed_tpn
  limit 1;

  v_secret_name := format('dejavoo_ftd:%s:%s', p_location_id, v_trimmed_tpn);

  if v_existing_secret_id is not null then
    v_secret_id := v_existing_secret_id;
  else
    select id
    into v_secret_id
    from vault.secrets
    where name = v_secret_name
    limit 1;
  end if;

  if v_secret_id is null and v_trimmed_ftd_key is null then
    raise exception 'FTD Ecom/TOP key is required for a new online-ordering payment device'
      using errcode = '22023';
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_trimmed_ftd_key,
      v_secret_name,
      'Dejavoo FTD Ecom/TOP key for location ' || p_location_id
    );
  elsif v_trimmed_ftd_key is not null then
    perform vault.update_secret(v_secret_id, v_trimmed_ftd_key);
  end if;

  if p_use_for_online_ordering then
    update public.location_payment_devices
    set use_for_online_ordering = false
    where location_id = p_location_id
      and use_for_online_ordering = true
      and tpn <> v_trimmed_tpn;
  end if;

  insert into public.location_payment_devices (
    merchant_id,
    carrier_id,
    location_id,
    provider,
    device_label,
    tpn,
    ftd_ecom_key_secret_id,
    last_synced_from_crm_at,
    is_active,
    use_for_online_ordering
  )
  values (
    v_merchant_id,
    v_carrier_id,
    p_location_id,
    'dejavoo',
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_trimmed_tpn,
    v_secret_id,
    now(),
    true,
    p_use_for_online_ordering
  )
  on conflict (location_id, tpn) do update
    set ftd_ecom_key_secret_id = excluded.ftd_ecom_key_secret_id,
        device_label = excluded.device_label,
        last_synced_from_crm_at = now(),
        is_active = true,
        use_for_online_ordering = excluded.use_for_online_ordering,
        updated_at = now()
  returning id into v_device_id;

  if p_use_for_online_ordering then
    update public.online_store_config
    set ipospays_tpn = v_trimmed_tpn,
        updated_at = now()
    where location_id = p_location_id;
  end if;

  return v_device_id;
end;
$function$;

revoke all on function public.list_location_payment_devices(uuid) from public;
grant execute on function public.list_location_payment_devices(uuid) to authenticated;
grant execute on function public.list_location_payment_devices(uuid) to service_role;

revoke all on function public.upsert_location_payment_device(uuid, text, text, text, boolean) from public;
grant execute on function public.upsert_location_payment_device(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.upsert_location_payment_device(uuid, text, text, text, boolean) to service_role;

do $$
declare
  v_config record;
  v_secret_id uuid;
  v_secret_name text;
begin
  for v_config in
    select
      osc.location_id,
      osc.merchant_id,
      m.carrier_id,
      trim(osc.ipospays_tpn) as tpn,
      trim(osc.ipospays_ftd_ecom_key) as ftd_key,
      coalesce(nullif(trim(osc.store_name), ''), nullif(trim(l.name), ''), 'Online ordering terminal') as device_label
    from public.online_store_config osc
    join public.merchants m on m.id = osc.merchant_id
    join public.locations l on l.id = osc.location_id
    where nullif(trim(coalesce(osc.ipospays_tpn, '')), '') is not null
      and nullif(trim(coalesce(osc.ipospays_ftd_ecom_key, '')), '') is not null
  loop
    v_secret_name := format('dejavoo_ftd:%s:%s', v_config.location_id, v_config.tpn);

    select id
    into v_secret_id
    from vault.secrets
    where name = v_secret_name
    limit 1;

    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_config.ftd_key,
        v_secret_name,
        'Migrated Dejavoo FTD Ecom/TOP key for location ' || v_config.location_id
      );
    else
      perform vault.update_secret(v_secret_id, v_config.ftd_key);
    end if;

    update public.location_payment_devices
    set use_for_online_ordering = false
    where location_id = v_config.location_id
      and use_for_online_ordering = true
      and tpn <> v_config.tpn;

    insert into public.location_payment_devices (
      merchant_id,
      carrier_id,
      location_id,
      provider,
      device_label,
      tpn,
      ftd_ecom_key_secret_id,
      last_synced_from_crm_at,
      is_active,
      use_for_online_ordering
    )
    values (
      v_config.merchant_id,
      v_config.carrier_id,
      v_config.location_id,
      'dejavoo',
      v_config.device_label,
      v_config.tpn,
      v_secret_id,
      now(),
      true,
      true
    )
    on conflict (location_id, tpn) do update
      set merchant_id = excluded.merchant_id,
          carrier_id = excluded.carrier_id,
          device_label = excluded.device_label,
          ftd_ecom_key_secret_id = excluded.ftd_ecom_key_secret_id,
          last_synced_from_crm_at = now(),
          is_active = true,
          use_for_online_ordering = true,
          updated_at = now();
  end loop;

  update public.online_store_config
  set ipospays_ftd_ecom_key = null,
      updated_at = now()
  where nullif(trim(coalesce(ipospays_ftd_ecom_key, '')), '') is not null;
end $$;
