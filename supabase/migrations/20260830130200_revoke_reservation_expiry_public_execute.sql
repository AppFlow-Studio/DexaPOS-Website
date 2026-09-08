-- [Website reservations] Close the execute grant the expiry functions shipped with.
--
-- Corrective. 20260830130000 and 20260830130100 revoked only `FROM PUBLIC`,
-- which is not enough on Supabase: default privileges GRANT EXECUTE to `anon`
-- and `authenticated` explicitly when a function in `public` is created, and
-- revoking from PUBLIC does not remove an explicit role grant. Both were
-- applied to staging before this was caught, and `proacl` read
-- `{postgres=X, anon=X, authenticated=X, service_role=X}`.
--
-- Why that mattered. `expire_stale_reservation_requests` is SECURITY DEFINER,
-- cancels bookings in bulk, and takes its own window as an argument. Reachable
-- by `anon` it is a PostgREST endpoint that anyone holding the publishable key
-- — which ships in every browser — could call as
-- `p_grace_minutes => 999999, p_lookback_hours => 999999` to cancel every
-- outstanding website request on the platform, at every merchant, reaching
-- arbitrarily far back. The `source = 'website'` guard bounds the blast radius
-- but does not make it acceptable.
--
-- The two functions this repo already exposes to the public booking flow,
-- `create_public_reservation` and `cancel_public_reservation`, both get this
-- right (`FROM PUBLIC, anon, authenticated` in 20260828160000). Their form is
-- the one adopted here and back-ported into the two files above, so a fresh
-- environment never has the window open at all.
--
-- Idempotent, and safe to run whether or not the grants are still there.

REVOKE ALL ON FUNCTION public.expire_stale_reservation_requests(int, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_reservation_requests(int, int, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.poke_reservation_request_expiry()
  FROM PUBLIC, anon, authenticated;

-- Verify after applying. Both must come back as exactly
-- {postgres=X, service_role=X} — `anon` and `authenticated` absent is the whole
-- point, and `service_role` is server-side only, so it stays on both:
--   select proname, proacl::text from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('expire_stale_reservation_requests',
--                      'poke_reservation_request_expiry');
