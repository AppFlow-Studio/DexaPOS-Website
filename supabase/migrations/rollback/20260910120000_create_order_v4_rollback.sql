-- Rollback for 20260910120000_create_order_v4.sql
--
-- This file is NOT applied automatically; run it manually if the forward
-- migration must be reverted.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260910120000_create_order_v4_rollback.sql
-- Remote: paste into the Supabase SQL editor and execute.
--
-- Safe at any time: create_order_v3 is untouched by that migration and the
-- client falls back to it whenever EXPO_PUBLIC_CLIENT_IDS is unset. Orders
-- already written with client-minted ids keep those ids — identity never
-- changes, which is the entire point — so nothing needs migrating back.
--
-- Order matters: drop the caller before the helper it depends on.

DROP FUNCTION IF EXISTS public.create_order_v4(uuid, uuid, order_type, text, text, text, text, text, uuid, uuid, uuid, uuid, text);

-- Only drop the helper if seat_guests_v4 is also rolled back — it uses it too.
-- DROP FUNCTION IF EXISTS public._display_number_from_order_number(text);
