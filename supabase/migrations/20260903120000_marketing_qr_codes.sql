-- Table-less marketing QR codes (Part B, PR B1)
--
-- A table QR is bolted to a floor-plan object and starts a dine-in order for
-- that table. A marketing QR has no table: it goes on a flyer, a door decal or
-- a delivery bag and points at the storefront. This lands the schema, RLS and
-- the two functions behind it.
--
-- Additive only. Nothing existing changes shape; `table_qr_codes` and its
-- `floor_plan_object_id NOT NULL` are untouched.
--
-- Plan: docs/features/qr-dine-in/PLAN-2026-09-01-MARKETING-QR-PART-B.md

-- pgcrypto lives in `extensions` and is NOT on search_path for SECURITY
-- DEFINER functions that pin search_path to public, so every gen_random_bytes
-- call below is schema-qualified. Learned the hard way in
-- 20260529000000_public_receipt_tokens.sql.
create extension if not exists pgcrypto with schema extensions;

-- ─── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.marketing_qr_codes (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null references public.merchants(id) on delete cascade,
  -- D1: NOT NULL, deliberately. The ticket's sketch made this nullable for
  -- "merchant-wide codes", which the storefront model cannot express: the slug
  -- is per-location (online_store_config.location_id is NOT NULL and slug is
  -- unique per config row), the branding a code renders with lives on that same
  -- row, and qr_scan_events.location_id is NOT NULL. A code with no location
  -- would have nothing to resolve to, nothing to brand with and nothing to log
  -- against. Merchant-wide is a later ticket that needs a merchant-level
  -- default config first.
  location_id       uuid not null references public.locations(id) on delete cascade,
  name              text not null,
  -- D5: a random pointer, NOT a signed claim.
  --
  -- This deliberately does not use sign_qr_table_token. That token is HMAC-
  -- signed because it *encodes claims* — a location, a floor-plan object, a
  -- version — which resolve_table_qr verifies against a rotating secret without
  -- trusting any row. A marketing code asserts nothing; it is an opaque pointer
  -- to the row below, which holds the truth. Signing a pointer buys no security
  -- that an unguessable pointer does not already have.
  --
  -- What differs is cost: a table token is ~120 characters. Invisible inside a
  -- QR, but a marketing code goes on a flyer where a human-typable fallback URL
  -- is a real feature. 10 Crockford base32 symbols is ~50 bits, unguessable
  -- against the rate limit in resolve_marketing_qr, and printable as text.
  short_code        text not null,
  -- Relative only. An absolute URL here would turn every printed code into an
  -- open redirect off our own domain, and a printed code cannot be recalled.
  destination_path  text not null default '/',
  is_active         boolean not null default true,
  scan_count        bigint not null default 0,
  last_scanned_at   timestamptz,
  deactivated_at    timestamptz,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint marketing_qr_codes_short_code_unique unique (short_code),
  constraint marketing_qr_codes_short_code_format
    check (short_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  constraint marketing_qr_codes_name_not_blank
    check (length(btrim(name)) > 0),
  constraint marketing_qr_codes_destination_relative
    check (destination_path ~ '^/' and destination_path !~ '^//'),
  constraint marketing_qr_codes_scan_count_nonnegative
    check (scan_count >= 0)
);

comment on table public.marketing_qr_codes is
  'Table-less QR codes for flyers, decals and packaging. One location per code (D1). Deactivate, never delete — a printed code outlives its row.';

create index if not exists ix_marketing_qr_codes_location_active
  on public.marketing_qr_codes(location_id) where is_active;

create index if not exists ix_marketing_qr_codes_merchant
  on public.marketing_qr_codes(merchant_id);

-- The POS tablet delta-syncs on updated_at, so every new table needs this.
drop trigger if exists set_marketing_qr_codes_updated_at on public.marketing_qr_codes;
create trigger set_marketing_qr_codes_updated_at
  before update on public.marketing_qr_codes
  for each row execute function public.update_updated_at_column();

-- ─── Scan events: one additive column (D6) ───────────────────────────────────
--
-- Closes the open B2 question, and takes neither option that was on the table.
-- A new `stage` value would mean altering a CHECK constraint on a live table.
-- Reusing 'scanned' and inferring marketing from `table_qr_code_id is null`
-- would silently absorb any future third scan source (kiosk, receipt, delivery
-- bag) into "marketing". An explicit FK cannot, and needs no CHECK migration.
--
-- `stage` keeps meaning a funnel position. Provenance is a different axis.

alter table public.qr_scan_events
  add column if not exists marketing_qr_code_id uuid references public.marketing_qr_codes(id);

create index if not exists ix_qr_scan_events_marketing
  on public.qr_scan_events(marketing_qr_code_id, occurred_at)
  where marketing_qr_code_id is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mirrors table_qr_codes exactly (20260522120000_qr_w1_schema.sql:130-215).
--
-- No delete policy, and none is coming: deactivating must leave the row so
-- /m/{code} can answer "no longer active" instead of 404-ing a customer
-- standing in the shop holding the flyer.

alter table public.marketing_qr_codes enable row level security;
alter table public.marketing_qr_codes force row level security;

drop policy if exists marketing_qr_codes_select_scope on public.marketing_qr_codes;
create policy marketing_qr_codes_select_scope
on public.marketing_qr_codes
for select
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists marketing_qr_codes_insert_scope on public.marketing_qr_codes;
create policy marketing_qr_codes_insert_scope
on public.marketing_qr_codes
for insert
to authenticated
with check (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

drop policy if exists marketing_qr_codes_update_scope on public.marketing_qr_codes;
create policy marketing_qr_codes_update_scope
on public.marketing_qr_codes
for update
to authenticated
using (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
)
with check (
  public.is_dexapos_admin()
  or (
    merchant_id = public.user_merchant_id()
    and location_id = any(public.user_location_ids())
  )
);

-- ─── Short-code generation ───────────────────────────────────────────────────

create or replace function public.marketing_qr_generate_short_code()
returns text
language plpgsql
volatile
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- Crockford base32: no I, L, O or U, so a code read off a printed flyer
  -- cannot be mistyped as 1/0 or turned into an unintended word.
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_out text := '';
  v_i integer;
begin
  for v_i in 0..9 loop
    -- 256 is an exact multiple of 32, so `byte % 32` is uniform over the
    -- alphabet — no modulo bias, and no bit-packing loop needed to avoid one.
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, v_i) % 32) + 1, 1);
  end loop;

  return v_out;
end;
$function$;

comment on function public.marketing_qr_generate_short_code() is
  '10 Crockford base32 symbols, about 50 bits. Uniform: 256 is an exact multiple of 32, so there is no modulo bias.';

-- ─── create_marketing_qr_code ────────────────────────────────────────────────

create or replace function public.create_marketing_qr_code(
  p_location_id uuid,
  p_name text,
  p_destination_path text default '/'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_merchant_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_destination text := coalesce(nullif(btrim(coalesce(p_destination_path, '')), ''), '/');
  v_short_code text;
  v_id uuid;
  v_attempt integer := 0;
begin
  if v_name = '' then
    return jsonb_build_object('success', false, 'error', 'A name is required.');
  end if;

  if v_destination !~ '^/' or v_destination ~ '^//' then
    return jsonb_build_object(
      'success', false,
      'error', 'The destination must be a path on this store, starting with /.'
    );
  end if;

  select l.merchant_id into v_merchant_id
  from public.locations l
  where l.id = p_location_id;

  if v_merchant_id is null then
    return jsonb_build_object('success', false, 'error', 'Location not found.');
  end if;

  -- SECURITY DEFINER bypasses RLS, so authorize explicitly and identically to
  -- the policies above.
  if not (
    public.is_dexapos_admin()
    or (
      v_merchant_id = public.user_merchant_id()
      and p_location_id = any(public.user_location_ids())
    )
  ) then
    return jsonb_build_object('success', false, 'error', 'Not authorized for this location.');
  end if;

  -- Retry on collision rather than pre-checking: two concurrent creates both
  -- pass a pre-check and one still fails on the unique index. At ~50 bits a
  -- second attempt is already vanishingly unlikely; five is generous.
  loop
    v_attempt := v_attempt + 1;
    v_short_code := public.marketing_qr_generate_short_code();

    begin
      insert into public.marketing_qr_codes (
        merchant_id, location_id, name, short_code, destination_path, created_by
      )
      values (
        v_merchant_id,
        p_location_id,
        v_name,
        v_short_code,
        v_destination,
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )
      returning id into v_id;

      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          return jsonb_build_object(
            'success', false,
            'error', 'Could not allocate a unique code. Please try again.'
          );
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'id', v_id,
    'short_code', v_short_code,
    'destination_path', v_destination
  );
end;
$function$;

revoke all on function public.create_marketing_qr_code(uuid, text, text) from public;
grant execute on function public.create_marketing_qr_code(uuid, text, text)
  to authenticated, service_role;

-- ─── resolve_marketing_qr ────────────────────────────────────────────────────
--
-- Anonymous callers reach this: it is what a stranger scanning a flyer hits.
-- Modelled on resolve_table_qr, minus token verification and the table/session
-- machinery.

create or replace function public.resolve_marketing_qr(
  p_slug text,
  p_short_code text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_store record;
  v_code public.marketing_qr_codes%rowtype;
  v_ip_hash text;
  v_headers jsonb;
  v_user_agent text;
  v_ip_count integer;
  v_limit_per_ip constant integer := 60;
begin
  select
    osc.merchant_id,
    osc.location_id,
    osc.store_name,
    osc.slug,
    osc.custom_domain,
    osc.logo_url,
    osc.primary_color,
    osc.secondary_color,
    osc.background_color
  into v_store
  from public.online_store_config osc
  where (osc.slug = p_slug or osc.custom_domain = p_slug)
    and osc.is_active = true
  limit 1;

  -- Deliberately does NOT require accepts_dine_in. That is a dine-in flag; a
  -- marketing code is not dine-in and must not be gated behind it (D3).
  if not found then
    return jsonb_build_object('success', false, 'error', 'store_unavailable');
  end if;

  select * into v_code
  from public.marketing_qr_codes
  where short_code = upper(btrim(coalesce(p_short_code, '')));

  -- A code belonging to another store is reported exactly like one that does
  -- not exist. Never confirm that a code exists somewhere else.
  if not found or v_code.location_id <> v_store.location_id then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  if not v_code.is_active then
    return jsonb_build_object('success', false, 'error', 'inactive');
  end if;

  -- Rate limit per IP, not per code: a flyer is scanned by many people from
  -- many networks, so a per-code limit would throttle a campaign that works.
  -- Per-IP is what keeps 50 bits of entropy sufficient against enumeration.
  v_ip_hash := public.qr_request_ip_hash();

  if v_ip_hash is not null then
    select count(*) into v_ip_count
    from public.qr_scan_events
    where ip_hash = v_ip_hash
      and marketing_qr_code_id is not null
      and occurred_at > now() - interval '1 minute';

    if v_ip_count >= v_limit_per_ip then
      return jsonb_build_object('success', false, 'error', 'rate_limited');
    end if;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      v_headers := null;
  end;
  v_user_agent := left(coalesce(v_headers->>'user-agent', ''), 512);

  insert into public.qr_scan_events (
    merchant_id, location_id, marketing_qr_code_id, stage, user_agent, ip_hash
  )
  values (
    v_code.merchant_id,
    v_code.location_id,
    v_code.id,
    'scanned',
    nullif(v_user_agent, ''),
    v_ip_hash
  );

  update public.marketing_qr_codes
  set scan_count = scan_count + 1,
      last_scanned_at = now()
  where id = v_code.id;

  return jsonb_build_object(
    'success', true,
    'destination_path', v_code.destination_path,
    'name', v_code.name,
    'store', jsonb_build_object(
      'merchant_id', v_store.merchant_id,
      'location_id', v_store.location_id,
      'store_name', v_store.store_name,
      'slug', v_store.slug,
      'logo_url', v_store.logo_url,
      'primary_color', v_store.primary_color,
      'secondary_color', v_store.secondary_color,
      'background_color', v_store.background_color
    )
  );
end;
$function$;

revoke all on function public.resolve_marketing_qr(text, text) from public;
grant execute on function public.resolve_marketing_qr(text, text)
  to anon, authenticated, service_role;
