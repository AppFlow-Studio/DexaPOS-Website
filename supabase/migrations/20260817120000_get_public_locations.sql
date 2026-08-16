-- Public read path for the presentational fields of a location.
--
-- Why a function and not a policy on `locations`:
--
-- The built site renders with the anon key (lib/supabase/anon.ts), and every
-- SELECT policy on `locations` is `authenticated`-only, so every location
-- binding on a published page resolved to nothing — address, phone, hours and
-- map silently absent from the live HTML while the editor showed them, because
-- the editor reads as a signed-in merchant.
--
-- The obvious fix — an anon SELECT policy — is the wrong one. RLS is row level,
-- not column level, so it would publish the whole row, and `locations` carries
-- `ein`, `tax_id`, `luqra_mid`, `sales_tax_rate` and `processor_fee_percentage`
-- alongside the address. A merchant's tax id is not part of their web page.
--
-- So this follows the pattern already ratified for `get_public_site_page`
-- (gap-closure plan §0.3): anon keeps **zero** table grants, and one function
-- with an explicit column list is the only door. A column added to `locations`
-- later is private by default — it has to be named here to become public, which
-- is the safe direction for that mistake to fall.
--
-- `email` is deliberately absent. An earlier draft of this function returned it,
-- and verifying against a live page showed it being handed to anon and rendered
-- by nothing — no section reads `ResolvedLocation.email`. The only effect was
-- making a merchant's contact address, often the account's own mailbox, bulk
-- readable by anyone who can call this. That is the exact mistake the explicit
-- column list exists to prevent. If a section ever needs to show an email,
-- adding it back is a deliberate act.
--
-- DROP before CREATE, not CREATE OR REPLACE: Postgres refuses to replace a
-- function whose RETURNS TABLE signature has changed, and staging already
-- carries the earlier draft.
drop function if exists public.get_public_locations(uuid, uuid[]);

create function public.get_public_locations(
  p_merchant_id uuid,
  p_ids uuid[]
)
returns table (
  id uuid,
  name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  phone text,
  latitude numeric,
  longitude numeric,
  timezone text,
  business_hours jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.id,
    l.name,
    l.address_line1,
    l.address_line2,
    l.city,
    l.state,
    l.postal_code,
    l.country,
    l.phone,
    l.latitude,
    l.longitude,
    l.timezone,
    l.business_hours
  from locations l
  where l.merchant_id = p_merchant_id
    and l.id = any(p_ids)
    and l.is_active
    -- Only for a merchant who has already chosen to be publicly reachable,
    -- either through a built website or an ordering storefront. Without this
    -- the function is an enumeration surface over every merchant on the
    -- platform; with it, it can only return details that merchant is already
    -- publishing somewhere.
    and (
      exists (
        select 1 from merchant_sites ms
        where ms.merchant_id = p_merchant_id
          and ms.render_mode = 'builder'
          and ms.subdomain is not null
      )
      or exists (
        select 1
        from online_store_config osc
        join locations ol on ol.id = osc.location_id
        where ol.merchant_id = p_merchant_id
          and osc.is_active
      )
    );
$$;

comment on function public.get_public_locations(uuid, uuid[]) is
  'Presentational location fields for public site rendering. Explicit column list; never exposes contact email, tax or processor columns.';

revoke all on function public.get_public_locations(uuid, uuid[]) from public;
grant execute on function public.get_public_locations(uuid, uuid[]) to anon, authenticated;
