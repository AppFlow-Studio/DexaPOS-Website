-- Rollback for 20260901120000_marketing_qr_codes.sql
--
-- This file is NOT applied automatically; run it manually if the forward
-- migration must be reverted.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260901120000_marketing_qr_codes_rollback.sql
-- Remote: paste into the Supabase SQL editor and execute.
--
-- ⚠️ DESTRUCTIVE, and in a way that cannot be undone from outside the database.
--
-- Dropping `marketing_qr_codes` destroys every short code a merchant has
-- already printed. A flyer, decal or delivery bag carrying one of those codes
-- becomes permanently dead — re-running the forward migration mints new random
-- codes, it does not restore the old ones. Take a copy first:
--
--   create table public.marketing_qr_codes_backup_20260901 as
--     select * from public.marketing_qr_codes;
--
-- The `qr_scan_events.marketing_qr_code_id` column is dropped too, which
-- discards the provenance of every marketing scan already logged. The event
-- rows themselves survive; they simply become indistinguishable from table
-- scans with a null table_qr_code_id, which is exactly the ambiguity D6 exists
-- to avoid. Consider archiving before dropping:
--
--   create table public.qr_scan_events_marketing_backup_20260901 as
--     select id, marketing_qr_code_id from public.qr_scan_events
--     where marketing_qr_code_id is not null;

-- Functions first: resolve_marketing_qr reads the table, and
-- create_marketing_qr_code writes it.
drop function if exists public.resolve_marketing_qr(text, text);
drop function if exists public.create_marketing_qr_code(uuid, text, text);
drop function if exists public.marketing_qr_generate_short_code();

-- The FK from qr_scan_events must go before the table it references.
drop index if exists public.ix_qr_scan_events_marketing;
alter table public.qr_scan_events
  drop column if exists marketing_qr_code_id;

drop trigger if exists set_marketing_qr_codes_updated_at on public.marketing_qr_codes;

drop policy if exists marketing_qr_codes_update_scope on public.marketing_qr_codes;
drop policy if exists marketing_qr_codes_insert_scope on public.marketing_qr_codes;
drop policy if exists marketing_qr_codes_select_scope on public.marketing_qr_codes;

drop index if exists public.ix_marketing_qr_codes_merchant;
drop index if exists public.ix_marketing_qr_codes_location_active;

drop table if exists public.marketing_qr_codes;

-- pgcrypto is deliberately NOT dropped: the forward migration only ensured it
-- exists, and other features (public receipt tokens, session tokens) depend on
-- it. Dropping it here would break them.
