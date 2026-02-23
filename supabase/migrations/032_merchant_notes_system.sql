-- ============================================================================
-- Migration 032: Ticket 4 - Merchant Notes System
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES public.users(id),
  author_name text NOT NULL,
  author_role text,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchant_notes_content_not_empty CHECK (length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_merchant_notes_merchant_id
  ON public.merchant_notes(merchant_id);

CREATE INDEX IF NOT EXISTS idx_merchant_notes_created_at_desc
  ON public.merchant_notes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_notes_merchant_pinned_created
  ON public.merchant_notes(merchant_id, is_pinned DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_merchant_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_notes_updated_at ON public.merchant_notes;
CREATE TRIGGER trg_merchant_notes_updated_at
  BEFORE UPDATE ON public.merchant_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_merchant_notes_updated_at();

ALTER TABLE public.merchant_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_notes_hq_admin_all ON public.merchant_notes;
CREATE POLICY merchant_notes_hq_admin_all
  ON public.merchant_notes
  FOR ALL
  USING (public.is_dexapos_admin())
  WITH CHECK (public.is_dexapos_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_notes TO authenticated;

COMMENT ON TABLE public.merchant_notes IS 'Internal-only HQ admin notes for merchant accounts.';
COMMENT ON COLUMN public.merchant_notes.is_pinned IS 'Pinned notes are surfaced before other notes in the UI.';

