-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 1 verification — run AFTER phase1-reservations-combined.sql
-- ═════════════════════════════════════════════════════════════════════════════
-- Read-only except for section 6, which is wrapped in an explicit ROLLBACK.
-- Run each section and compare against the "expect" note above it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. All five tables exist, and every one of them has RLS ON
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: 5 rows, rls_enabled = true on all 5.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'reservation_service_periods', 'reservation_blackouts',
    'reservation_holds', 'reservation_settings', 'reservation_alerts'
  )
ORDER BY c.relname;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE IMPORTANT ONE — no policy anywhere grants anon anything
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: ZERO rows. Any row here is a data leak: these tables hold strangers'
-- names, emails and phone numbers.
SELECT tablename, policyname, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'reservation_service_periods', 'reservation_blackouts',
    'reservation_holds', 'reservation_settings', 'reservation_alerts',
    'reservations'
  )
  AND ('anon' = ANY (roles) OR 'public' = ANY (roles));

-- Expect: 5 rows, one `*_merchant_rw` policy per table, roles = {authenticated}.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'reservation\_%'
ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Table-level grants — anon must not hold SELECT on any of them either
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: ZERO rows.
SELECT table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'reservation_service_periods', 'reservation_blackouts',
    'reservation_holds', 'reservation_settings', 'reservation_alerts'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. New columns on reservations and merchant_sites
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: 7 rows. manage_token is_nullable = YES (deliberate — see the
-- migration comment on the table-rewrite lock).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reservations'
  AND column_name IN (
    'service_period_id', 'occasion_tags', 'dietary_tags',
    'marketing_opt_in', 'sms_opt_in', 'manage_token', 'cancelled_by'
  )
ORDER BY column_name;

-- Expect: 2 rows.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'merchant_sites'
  AND column_name IN ('reservations_page_id', 'reservations_page_provisioned_at')
ORDER BY column_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: reservations_manage_token_idx (UNIQUE), reservations_blocking_by_date_idx
-- (partial, WHERE status IN (...)), reservation_holds_live_idx,
-- reservation_holds_expiry_idx, reservation_blackouts_location_date_idx,
-- reservation_service_periods_location_idx, reservation_alerts_match_idx.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE 'reservation%' OR indexname LIKE 'reservations_%')
ORDER BY indexname;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Behaviour — constraints and the tenancy trigger actually fire
-- ─────────────────────────────────────────────────────────────────────────────
-- Wrapped in a ROLLBACK, so this writes nothing. Replace the location id with a
-- real one from your database first.
BEGIN;

-- Pick any real location.
CREATE TEMP TABLE _probe AS
SELECT id AS location_id, merchant_id FROM public.locations LIMIT 1;

-- 6a. The tenancy trigger fills merchant_id even though we never supply it.
-- Expect: derived_ok = true.
INSERT INTO public.reservation_service_periods
  (location_id, name, days_of_week, start_time, end_time)
SELECT location_id, 'Probe Dinner', ARRAY[2,3,4,5,6]::smallint[], '17:00', '22:00'
FROM _probe;

SELECT (sp.merchant_id = p.merchant_id) AS derived_ok
FROM public.reservation_service_periods sp, _probe p
WHERE sp.name = 'Probe Dinner';

-- 6b. An empty days_of_week must be REJECTED. This is the cardinality() fix —
-- with array_length() it would have been silently accepted.
-- Expect: ERROR  violates check constraint "reservation_service_periods_days"
INSERT INTO public.reservation_service_periods
  (location_id, name, days_of_week, start_time, end_time)
SELECT location_id, 'Probe Empty', ARRAY[]::smallint[], '17:00', '22:00' FROM _probe;

ROLLBACK;

-- If 6b raised the expected error, the transaction is already aborted — the
-- ROLLBACK above is then a no-op and nothing was written either way. Re-run
-- section 6 without 6b to confirm 6a on its own.

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Token generator
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: len = 64, lowercase hex, and the two values DIFFERENT (the function is
-- volatile — if these matched, every reservation would share a manage link).
SELECT
  public.generate_reservation_manage_token() AS token_a,
  public.generate_reservation_manage_token() AS token_b,
  length(public.generate_reservation_manage_token()) AS len,
  public.generate_reservation_manage_token() ~ '^[0-9a-f]{64}$' AS url_safe_hex;
