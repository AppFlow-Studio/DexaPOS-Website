-- =====================================================================
-- Migration: add missing kds_item_status.acknowledged_by FK to staff_profiles
-- =====================================================================
-- Why: kds_item_status_acknowledged_columns_and_rpcs (2026-06-06) added the
-- acknowledged_at + acknowledged_by columns but did NOT add the foreign-key
-- constraint pointing acknowledged_by → staff_profiles(id). Production was
-- left without the FK, which breaks PostgREST relationship resolution for
-- selects like:
--
--   .from("kds_item_status")
--   .select("acknowledger:staff_profiles!kds_item_status_acknowledged_by_fkey(...)")
--
-- causing PGRST200 "Could not find a relationship between 'kds_item_status'
-- and 'staff_profiles' in the schema cache". GetOrderFullHistory currently
-- logs this on every order detail load on prod.
--
-- Idempotent: only adds the constraint when missing. Safe to run multiple
-- times and against environments that already have it (e.g. staging).
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kds_item_status_acknowledged_by_fkey'
      AND conrelid = 'public.kds_item_status'::regclass
  ) THEN
    ALTER TABLE public.kds_item_status
      ADD CONSTRAINT kds_item_status_acknowledged_by_fkey
      FOREIGN KEY (acknowledged_by) REFERENCES public.staff_profiles(id);
  END IF;
END$$;

-- Refresh PostgREST schema cache so the new relationship is picked up
-- immediately without an instance restart.
NOTIFY pgrst, 'reload schema';
