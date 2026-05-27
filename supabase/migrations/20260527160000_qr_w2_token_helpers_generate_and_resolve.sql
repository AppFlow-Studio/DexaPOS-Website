-- QR Dine-In Wave 2b: token helpers, shared generate path, and scan bootstrap
--
-- This wave unlocks:
-- - QR-5 HMAC-backed token signing and verification
-- - shared generate/reprint/regenerate path for dashboard + POS
-- - QR-2 resolve_table_qr bootstrap RPC
-- - scan rate limiting per IP/table

create table if not exists public.qr_scan_rate_limit (
  id bigserial primary key,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  table_qr_code_id uuid not null references public.table_qr_codes(id) on delete cascade,
  ip_hash text,
  scanned_at timestamptz not null default now()
);

create index if not exists idx_qr_scan_rate_limit_table_time
  on public.qr_scan_rate_limit (table_qr_code_id, scanned_at desc);

create index if not exists idx_qr_scan_rate_limit_ip_time
  on public.qr_scan_rate_limit (ip_hash, scanned_at desc)
  where ip_hash is not null;

comment on table public.qr_scan_rate_limit is
  'Atomic scan rate-limit ledger for QR bootstrap requests. SECURITY DEFINER RPCs only.';

alter table public.qr_scan_rate_limit enable row level security;
alter table only public.qr_scan_rate_limit force row level security;

revoke all on table public.qr_scan_rate_limit from public, anon, authenticated;
grant all on table public.qr_scan_rate_limit to service_role;

create or replace function public.qr_base64url_encode(p_value bytea)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select translate(trim(trailing '=' from encode(p_value, 'base64')), '+/', '-_');
$function$;

create or replace function public.qr_base64url_decode(p_value text)
returns bytea
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select decode(
    replace(replace(coalesce(p_value, ''), '-', '+'), '_', '/')
    || repeat('=', (4 - length(coalesce(p_value, '')) % 4) % 4),
    'base64'
  );
$function$;

create or replace function public.qr_get_vault_secret(p_secret_name text)
returns text
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_secret text;
begin
  select nullif(ds.decrypted_secret, '')
    into v_secret
  from vault.decrypted_secrets ds
  where ds.name = p_secret_name
  limit 1;

  return v_secret;
end;
$function$;

create or replace function public.qr_compute_table_signature(
  p_location_id uuid,
  p_floor_plan_object_id uuid,
  p_token_version integer,
  p_secret text
)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select encode(
    extensions.hmac(
      convert_to(
        p_location_id::text || '|' || p_floor_plan_object_id::text || '|' || greatest(coalesce(p_token_version, 0), 0)::text,
        'utf8'
      ),
      convert_to(coalesce(p_secret, ''), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function public.qr_parse_table_token(p_table_token text)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload text;
  v_parts text[];
  v_qr_code_id uuid;
  v_signature text;
begin
  if nullif(trim(coalesce(p_table_token, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  v_payload := convert_from(public.qr_base64url_decode(trim(p_table_token)), 'utf8');
  v_parts := string_to_array(v_payload, '.');

  if coalesce(array_length(v_parts, 1), 0) <> 2 then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  begin
    v_qr_code_id := v_parts[1]::uuid;
  exception
    when others then
      return jsonb_build_object('success', false, 'error', 'invalid_token');
  end;

  v_signature := lower(coalesce(v_parts[2], ''));
  if v_signature !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  return jsonb_build_object(
    'success', true,
    'qr_code_id', v_qr_code_id,
    'provided_signature', v_signature
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
end;
$function$;

create or replace function public.sign_qr_table_token(
  p_qr_code_id uuid,
  p_location_id uuid,
  p_floor_plan_object_id uuid,
  p_token_version integer
)
returns text
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_secret text;
  v_signature text;
begin
  v_secret := public.qr_get_vault_secret('qr_hmac_secret_current');

  if v_secret is null then
    raise exception 'QR HMAC current secret is missing'
      using errcode = 'P0001';
  end if;

  v_signature := public.qr_compute_table_signature(
    p_location_id,
    p_floor_plan_object_id,
    p_token_version,
    v_secret
  );

  return public.qr_base64url_encode(
    convert_to(p_qr_code_id::text || '.' || v_signature, 'utf8')
  );
end;
$function$;

create or replace function public.verify_qr_table_token(
  p_table_token text,
  p_location_id uuid,
  p_floor_plan_object_id uuid,
  p_token_version integer
)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_parsed jsonb;
  v_qr_code_id uuid;
  v_provided_signature text;
  v_current_secret text;
  v_previous_secret text;
  v_expected_signature text;
begin
  v_parsed := public.qr_parse_table_token(p_table_token);
  if coalesce((v_parsed->>'success')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  v_qr_code_id := (v_parsed->>'qr_code_id')::uuid;
  v_provided_signature := lower(v_parsed->>'provided_signature');

  v_current_secret := public.qr_get_vault_secret('qr_hmac_secret_current');
  if v_current_secret is null then
    return jsonb_build_object('success', false, 'error', 'missing_current_secret');
  end if;

  v_expected_signature := public.qr_compute_table_signature(
    p_location_id,
    p_floor_plan_object_id,
    p_token_version,
    v_current_secret
  );

  if v_expected_signature = v_provided_signature then
    return jsonb_build_object(
      'success', true,
      'qr_code_id', v_qr_code_id,
      'matched_secret', 'current'
    );
  end if;

  v_previous_secret := public.qr_get_vault_secret('qr_hmac_secret_previous');
  if v_previous_secret is not null then
    v_expected_signature := public.qr_compute_table_signature(
      p_location_id,
      p_floor_plan_object_id,
      p_token_version,
      v_previous_secret
    );

    if v_expected_signature = v_provided_signature then
      return jsonb_build_object(
        'success', true,
        'qr_code_id', v_qr_code_id,
        'matched_secret', 'previous'
      );
    end if;
  end if;

  return jsonb_build_object(
    'success', false,
    'error', 'signature_mismatch',
    'qr_code_id', v_qr_code_id
  );
end;
$function$;

create or replace function public.qr_request_ip_hash()
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_headers jsonb;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      v_headers := null;
  end;

  v_ip := nullif(trim(
    coalesce(
      nullif(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), ''),
      nullif(v_headers->>'cf-connecting-ip', ''),
      nullif(v_headers->>'x-real-ip', ''),
      ''
    )
  ), '');

  if v_ip is null then
    return null;
  end if;

  return encode(extensions.digest(lower(v_ip), 'sha256'), 'hex');
end;
$function$;

create or replace function public.qr_validate_operating_hours(
  p_operating_hours jsonb,
  p_check_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hours jsonb := coalesce(p_operating_hours, '[]'::jsonb);
  v_day integer := extract(dow from p_check_at)::integer;
  v_minutes integer := extract(hour from p_check_at)::integer * 60 + extract(minute from p_check_at)::integer;
  v_today record;
  v_candidate record;
  v_check_day integer;
  v_open_minutes integer;
  v_close_minutes integer;
  v_day_name text;
begin
  if jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) = 0 then
    return jsonb_build_object('open', true);
  end if;

  select
    value
  into v_today
  from jsonb_array_elements(v_hours) as value
  where coalesce((value->>'day')::integer, -1) = v_day
  limit 1;

  if v_today.value is not null and coalesce((v_today.value->>'is_closed')::boolean, false) = false then
    v_open_minutes := split_part(coalesce(v_today.value->>'open', '00:00'), ':', 1)::integer * 60
      + split_part(coalesce(v_today.value->>'open', '00:00'), ':', 2)::integer;
    v_close_minutes := split_part(coalesce(v_today.value->>'close', '00:00'), ':', 1)::integer * 60
      + split_part(coalesce(v_today.value->>'close', '00:00'), ':', 2)::integer;

    if v_close_minutes < v_open_minutes then
      if v_minutes >= v_open_minutes or v_minutes < v_close_minutes then
        return jsonb_build_object('open', true);
      end if;
    elsif v_minutes >= v_open_minutes and v_minutes < v_close_minutes then
      return jsonb_build_object('open', true);
    end if;
  end if;

  for v_check_day in 1..7 loop
    select
      value
    into v_candidate
    from jsonb_array_elements(v_hours) as value
    where coalesce((value->>'day')::integer, -1) = ((v_day + v_check_day) % 7)
      and coalesce((value->>'is_closed')::boolean, false) = false
    limit 1;

    if v_candidate.value is not null then
      v_day_name := case ((v_day + v_check_day) % 7)
        when 0 then 'Sunday'
        when 1 then 'Monday'
        when 2 then 'Tuesday'
        when 3 then 'Wednesday'
        when 4 then 'Thursday'
        when 5 then 'Friday'
        else 'Saturday'
      end;

      return jsonb_build_object(
        'open', false,
        'reason', 'Store is currently closed',
        'next_open', v_day_name || ' at ' || coalesce(v_candidate.value->>'open', '00:00')
      );
    end if;
  end loop;

  return jsonb_build_object(
    'open', false,
    'reason', 'Store is currently closed'
  );
end;
$function$;

create or replace function public.generate_table_qr_code(
  p_floor_plan_object_id uuid,
  p_regenerate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor text := coalesce(auth.jwt()->>'sub', 'service_role');
  v_table record;
  v_existing_active public.table_qr_codes%rowtype;
  v_latest public.table_qr_codes%rowtype;
  v_qr_code_id uuid;
  v_token_version integer;
  v_token text;
  v_table_label text;
begin
  select
    fpo.id,
    fpo.location_id,
    fpo.merchant_id,
    fpo.name,
    fpo.label_override,
    fpo.category::text as category,
    fpo.section_id,
    fpo.zone_name,
    fpo.capacity,
    fpo.is_active
  into v_table
  from public.floor_plan_objects fpo
  where fpo.id = p_floor_plan_object_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Table not found');
  end if;

  perform public.authorize_location_access(v_table.location_id);

  if v_table.category not in ('table', 'booth') then
    return jsonb_build_object('success', false, 'error', 'Object is not a table');
  end if;

  if coalesce(v_table.is_active, false) is not true then
    return jsonb_build_object('success', false, 'error', 'Table is inactive');
  end if;

  v_table_label := coalesce(nullif(btrim(v_table.label_override), ''), v_table.name);

  select *
    into v_existing_active
  from public.table_qr_codes
  where floor_plan_object_id = p_floor_plan_object_id
    and is_active = true
  order by created_at desc
  limit 1;

  if found and coalesce(p_regenerate, false) is false then
    return jsonb_build_object(
      'success', true,
      'action', 'reprint_existing',
      'id', v_existing_active.id,
      'merchant_id', v_existing_active.merchant_id,
      'location_id', v_existing_active.location_id,
      'floor_plan_object_id', v_existing_active.floor_plan_object_id,
      'table_label', v_existing_active.table_label,
      'token', v_existing_active.token,
      'token_version', v_existing_active.token_version,
      'is_active', v_existing_active.is_active,
      'scan_count', v_existing_active.scan_count,
      'last_scanned_at', v_existing_active.last_scanned_at,
      'created_at', v_existing_active.created_at,
      'section_id', v_table.section_id,
      'zone_name', v_table.zone_name,
      'capacity', v_table.capacity
    );
  end if;

  select *
    into v_latest
  from public.table_qr_codes
  where floor_plan_object_id = p_floor_plan_object_id
  order by created_at desc
  limit 1;

  if coalesce(p_regenerate, false) is true then
    update public.table_qr_codes
       set is_active = false,
           rotated_at = now()
     where floor_plan_object_id = p_floor_plan_object_id
       and is_active = true;
  end if;

  v_token_version := greatest(coalesce(v_latest.token_version, 0), 0) + 1;
  v_qr_code_id := extensions.gen_random_uuid();
  v_token := public.sign_qr_table_token(
    v_qr_code_id,
    v_table.location_id,
    p_floor_plan_object_id,
    v_token_version
  );

  insert into public.table_qr_codes (
    id,
    merchant_id,
    location_id,
    floor_plan_object_id,
    table_label,
    token,
    token_version,
    is_active,
    created_by
  ) values (
    v_qr_code_id,
    v_table.merchant_id,
    v_table.location_id,
    p_floor_plan_object_id,
    v_table_label,
    v_token,
    v_token_version,
    true,
    v_actor
  );

  return jsonb_build_object(
    'success', true,
    'action', case when coalesce(p_regenerate, false) then 'regenerated' else 'generated' end,
    'id', v_qr_code_id,
    'merchant_id', v_table.merchant_id,
    'location_id', v_table.location_id,
    'floor_plan_object_id', p_floor_plan_object_id,
    'table_label', v_table_label,
    'token', v_token,
    'token_version', v_token_version,
    'is_active', true,
    'scan_count', 0,
    'last_scanned_at', null,
    'created_at', now(),
    'section_id', v_table.section_id,
    'zone_name', v_table.zone_name,
    'capacity', v_table.capacity
  );
end;
$function$;

create or replace function public.resolve_table_qr(
  p_slug text,
  p_table_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_store record;
  v_parsed jsonb;
  v_qr_code_id uuid;
  v_qr public.table_qr_codes%rowtype;
  v_verification jsonb;
  v_hours jsonb;
  v_ip_hash text;
  v_headers jsonb;
  v_user_agent text;
  v_ip_count integer;
  v_table_count integer;
  v_limit_per_ip integer := 30;
  v_limit_per_table integer := 60;
  v_session record;
begin
  select
    osc.id,
    osc.merchant_id,
    osc.location_id,
    osc.store_name,
    osc.slug,
    osc.custom_domain,
    osc.description,
    osc.logo_url,
    osc.hero_image_url,
    osc.primary_color,
    osc.secondary_color,
    osc.operating_hours,
    osc.estimated_prep_minutes,
    osc.qr_fulfillment_mode,
    osc.qr_geofence_enabled,
    osc.qr_service_fee_pct
  into v_store
  from public.online_store_config osc
  where (osc.slug = p_slug or osc.custom_domain = p_slug)
    and osc.is_active = true
    and osc.accepts_dine_in = true
    and osc.qr_kill_switch = false
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'QR ordering is unavailable for this store'
    );
  end if;

  v_parsed := public.qr_parse_table_token(p_table_token);
  if coalesce((v_parsed->>'success')::boolean, false) is not true then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid or inactive QR code'
    );
  end if;

  v_qr_code_id := (v_parsed->>'qr_code_id')::uuid;

  select *
    into v_qr
  from public.table_qr_codes
  where id = v_qr_code_id
    and is_active = true;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid or inactive QR code'
    );
  end if;

  if v_qr.location_id is distinct from v_store.location_id
     or v_qr.merchant_id is distinct from v_store.merchant_id then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid or inactive QR code'
    );
  end if;

  v_verification := public.verify_qr_table_token(
    p_table_token,
    v_qr.location_id,
    v_qr.floor_plan_object_id,
    v_qr.token_version
  );

  if coalesce((v_verification->>'success')::boolean, false) is not true then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid or inactive QR code'
    );
  end if;

  v_hours := public.qr_validate_operating_hours(v_store.operating_hours, v_now);
  if coalesce((v_hours->>'open')::boolean, false) is not true then
    return jsonb_build_object(
      'success', false,
      'error', coalesce(v_hours->>'reason', 'Store is currently closed'),
      'next_open', v_hours->>'next_open'
    );
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      v_headers := null;
  end;

  v_ip_hash := public.qr_request_ip_hash();
  v_user_agent := left(coalesce(v_headers->>'user-agent', ''), 512);

  perform pg_advisory_xact_lock(
    hashtextextended(
      'qr_scan_rate_limit:' || coalesce(v_ip_hash, v_qr.id::text),
      0
    )
  );

  if v_ip_hash is not null then
    select count(*)
      into v_ip_count
    from public.qr_scan_rate_limit
    where ip_hash = v_ip_hash
      and scanned_at > v_now - interval '1 minute';

    if v_ip_count >= v_limit_per_ip then
      return jsonb_build_object(
        'success', false,
        'error', 'Please wait before scanning again',
        'reason', 'rate_limit_exceeded'
      );
    end if;
  end if;

  select count(*)
    into v_table_count
  from public.qr_scan_rate_limit
  where table_qr_code_id = v_qr.id
    and scanned_at > v_now - interval '1 minute';

  if v_table_count >= v_limit_per_table then
    return jsonb_build_object(
      'success', false,
      'error', 'Please wait before scanning again',
      'reason', 'rate_limit_exceeded'
    );
  end if;

  insert into public.qr_scan_rate_limit (
    merchant_id,
    location_id,
    table_qr_code_id,
    ip_hash
  ) values (
    v_store.merchant_id,
    v_store.location_id,
    v_qr.id,
    v_ip_hash
  );

  insert into public.online_order_sessions (
    store_config_id,
    is_authenticated,
    order_type,
    delivery_address,
    cart_data,
    expires_at,
    floor_plan_object_id,
    table_label,
    table_qr_code_id
  ) values (
    v_store.id,
    false,
    'pickup',
    null,
    '[]'::jsonb,
    v_now + interval '2 hours',
    v_qr.floor_plan_object_id,
    v_qr.table_label,
    v_qr.id
  )
  returning id, session_token, expires_at
    into v_session;

  insert into public.qr_scan_events (
    merchant_id,
    location_id,
    floor_plan_object_id,
    table_qr_code_id,
    online_order_session_id,
    stage,
    user_agent,
    ip_hash
  ) values (
    v_store.merchant_id,
    v_store.location_id,
    v_qr.floor_plan_object_id,
    v_qr.id,
    v_session.id,
    'scanned',
    nullif(v_user_agent, ''),
    v_ip_hash
  );

  update public.table_qr_codes
     set scan_count = scan_count + 1,
         last_scanned_at = v_now
   where id = v_qr.id;

  return jsonb_build_object(
    'success', true,
    'session_token', v_session.session_token,
    'session_expires_at', v_session.expires_at,
    'table_label', v_qr.table_label,
    'store', jsonb_build_object(
      'store_config_id', v_store.id,
      'merchant_id', v_store.merchant_id,
      'location_id', v_store.location_id,
      'store_name', v_store.store_name,
      'slug', v_store.slug,
      'custom_domain', v_store.custom_domain,
      'description', v_store.description,
      'logo_url', v_store.logo_url,
      'hero_image_url', v_store.hero_image_url,
      'primary_color', v_store.primary_color,
      'secondary_color', v_store.secondary_color,
      'estimated_prep_minutes', v_store.estimated_prep_minutes,
      'qr_fulfillment_mode', v_store.qr_fulfillment_mode,
      'qr_geofence_enabled', v_store.qr_geofence_enabled,
      'qr_service_fee_pct', v_store.qr_service_fee_pct
    )
  );
end;
$function$;

revoke all on function public.qr_base64url_encode(bytea) from public;
revoke all on function public.qr_base64url_decode(text) from public;
revoke all on function public.qr_get_vault_secret(text) from public;
revoke all on function public.qr_compute_table_signature(uuid, uuid, integer, text) from public;
revoke all on function public.qr_parse_table_token(text) from public;
revoke all on function public.sign_qr_table_token(uuid, uuid, uuid, integer) from public;
revoke all on function public.verify_qr_table_token(text, uuid, uuid, integer) from public;
revoke all on function public.qr_request_ip_hash() from public;
revoke all on function public.qr_validate_operating_hours(jsonb, timestamptz) from public;
revoke all on function public.generate_table_qr_code(uuid, boolean) from public;
revoke all on function public.resolve_table_qr(text, text) from public, anon, authenticated;

grant execute on function public.generate_table_qr_code(uuid, boolean) to authenticated, service_role;
grant execute on function public.resolve_table_qr(text, text) to anon, authenticated, service_role;

comment on function public.sign_qr_table_token(uuid, uuid, uuid, integer) is
  'Signs a QR dine-in token using the current Vault-backed HMAC secret.';

comment on function public.verify_qr_table_token(text, uuid, uuid, integer) is
  'Verifies a QR dine-in token against current and previous Vault-backed HMAC secrets.';

comment on function public.generate_table_qr_code(uuid, boolean) is
  'Shared generate/reprint/regenerate path for dashboard and POS QR printing.';

comment on function public.resolve_table_qr(text, text) is
  'Anon-safe QR bootstrap RPC. Validates store + token + hours, rate-limits scans, and returns a table-bound session token.';
