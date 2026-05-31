-- =============================================================================
-- Migration: R-IMP-0 — Clover importer source-tracking columns
-- =============================================================================
-- Adds (source_external_id TEXT, source_system TEXT) to the five menu-domain
-- tables touched by the Clover Menu Importer. These columns are the natural key
-- for idempotent re-imports: (merchant_id, source_external_id) uniquely
-- identifies a row that originated in a foreign POS, scoped per source_system.
--
-- The matching partial unique indexes live in a sibling migration with the
-- `-- supabase no-transaction` directive, because CREATE INDEX CONCURRENTLY
-- cannot run inside a transaction (and Supabase wraps each migration file in
-- one by default).
--
-- Owned by R-IMP-0. Drafted as part of the Clover importer plan to unblock
-- downstream code; please review carefully — this columns/indexes pair becomes
-- the durable contract for *any* future importer (Square, Toast, etc.).
-- =============================================================================

ALTER TABLE public.menus
    ADD COLUMN IF NOT EXISTS source_external_id text,
    ADD COLUMN IF NOT EXISTS source_system      text;
ALTER TABLE public.menu_items
    ADD COLUMN IF NOT EXISTS source_external_id text,
    ADD COLUMN IF NOT EXISTS source_system      text;
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS source_external_id text,
    ADD COLUMN IF NOT EXISTS source_system      text;
ALTER TABLE public.modifier_groups
    ADD COLUMN IF NOT EXISTS source_external_id text,
    ADD COLUMN IF NOT EXISTS source_system      text;
ALTER TABLE public.modifier_group_items
    ADD COLUMN IF NOT EXISTS source_external_id text,
    ADD COLUMN IF NOT EXISTS source_system      text;
COMMENT ON COLUMN public.menu_items.source_external_id IS
    'External ID from a foreign POS (e.g. Clover item ID). Paired with source_system. NULL for rows created natively in Dexa.';
COMMENT ON COLUMN public.menu_items.source_system IS
    'Origin system for source_external_id. One of: ''clover'', ''square'', ''toast''. NULL when source_external_id is NULL.';
