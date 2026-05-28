-- QR Dine-In: fix base64url token formatting and re-sign existing QR rows
--
-- Why this exists:
-- Postgres base64 encoding inserts line breaks for longer payloads. Our QR
-- payload (uuid + hex signature) is long enough to trigger that, which can
-- leave malformed tokens at rest and in generated URLs. This migration makes
-- the base64url helpers whitespace-safe and re-signs all existing QR rows
-- using the normalized encoder.

create or replace function public.qr_base64url_encode(p_value bytea)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select translate(
    trim(
      trailing '=' from regexp_replace(encode(p_value, 'base64'), '\s+', '', 'g')
    ),
    '+/',
    '-_'
  );
$function$;

create or replace function public.qr_base64url_decode(p_value text)
returns bytea
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select decode(
    replace(
      replace(
        regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'),
        '-',
        '+'
      ),
      '_',
      '/'
    ) || repeat('=', (4 - length(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g')) % 4) % 4),
    'base64'
  );
$function$;

update public.table_qr_codes
   set token = public.sign_qr_table_token(
     id,
     location_id,
     floor_plan_object_id,
     token_version
   );

comment on function public.qr_base64url_encode(bytea) is
  'Whitespace-safe base64url encoder used for QR dine-in token generation.';

comment on function public.qr_base64url_decode(text) is
  'Whitespace-safe base64url decoder used for QR dine-in token verification.';
