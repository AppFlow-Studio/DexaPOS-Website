-- Rollback for 20260505130000_locations_luqra_mid.sql

DROP INDEX IF EXISTS public.locations_luqra_mid_unique;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_luqra_mid_status_check;

ALTER TABLE public.locations
  DROP COLUMN IF EXISTS luqra_mid_assigned_at,
  DROP COLUMN IF EXISTS luqra_mid_status,
  DROP COLUMN IF EXISTS luqra_mid_descriptor,
  DROP COLUMN IF EXISTS luqra_mid;
