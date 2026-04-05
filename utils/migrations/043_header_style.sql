-- ============================================================================
-- Migration 043: Header style configuration
-- Adds header_style and header_text_color to online_store_config
-- ============================================================================

BEGIN;

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS header_style text NOT NULL DEFAULT 'filled'
    CHECK (header_style IN ('filled', 'transparent', 'outlined')),
  ADD COLUMN IF NOT EXISTS header_text_color text;

COMMIT;
