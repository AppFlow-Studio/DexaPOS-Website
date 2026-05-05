-- Add Luqra MID assignment to locations.
-- A Luqra MID is the acquiring identifier used to fetch transactions and
-- chargebacks from /api/v1/reports/{transactions,chargebacks}?mid__eq=<MID>.
-- One MID per location for our use case; if a location ever needs multiple
-- MIDs we'll migrate to a dedicated table.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS luqra_mid TEXT,
  ADD COLUMN IF NOT EXISTS luqra_mid_descriptor TEXT,
  ADD COLUMN IF NOT EXISTS luqra_mid_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS luqra_mid_assigned_at TIMESTAMPTZ;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_luqra_mid_status_check;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_luqra_mid_status_check
    CHECK (luqra_mid_status IN ('pending', 'review', 'live', 'offline'));

CREATE UNIQUE INDEX IF NOT EXISTS locations_luqra_mid_unique
  ON public.locations (luqra_mid)
  WHERE luqra_mid IS NOT NULL;

COMMENT ON COLUMN public.locations.luqra_mid IS
  'Luqra acquiring MID. Used as ?mid__eq= in Luqra reports API.';
COMMENT ON COLUMN public.locations.luqra_mid_status IS
  'pending | review | live | offline. Mirrors handoff §1.4 status pip.';
