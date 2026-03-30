-- ============================================================================
-- Migration 046: Menu layout configuration
-- Adds menu_layout to online_store_config for storefront menu display options
-- Values: 'cards' (image on top), 'sidebyside' (image on right), 'no-images'
-- ============================================================================

BEGIN;

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS menu_layout text NOT NULL DEFAULT 'cards'
    CHECK (menu_layout IN ('cards', 'sidebyside', 'no-images'));

COMMIT;
