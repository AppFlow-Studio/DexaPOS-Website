-- =============================================================================
-- Receipt templates: cardholder signature line + one Sale Receipt row
-- =============================================================================
-- Ticket: Notion "[POS · Receipts] Cardholder signature block on merchant copy
-- — card payments only, per-location toggle".
-- Plan: https://claude.ai/artifact/5ooS8zJjSePANQTjocUJFG
--
-- 1. Two columns for the signature block. DEFAULT false = no printed change for
--    any merchant until they opt in. RLS: inherits the existing
--    receipt_templates policies; no new policy.
--
-- 2. Unify the Sale Receipt row. The Website wrote template_type 'sale', the POS
--    prints only from 'receipt', so Website sale-receipt settings never reached
--    the tablet. From now on both apps use 'receipt' (the Website maps its
--    "sale" tab to it at the DB boundary).
--      - lone 'sale' row           -> renamed to 'receipt'
--      - 'sale' AND 'receipt' rows -> keep 'receipt' (what prints today),
--                                     retire 'sale' as 'sale_retired', inactive
--    Renamed / retired row ids are printed as NOTICEs; keep them for rollback.
--
-- ORDER: ship the Website change that maps sale -> 'receipt' with (or right
-- after) this migration. Until then the old Website writes a fresh 'sale' row
-- on save, which the POS ignores exactly as it does today.
--
-- Rollback: rollback/20260927130000_receipt_signature_line_and_sale_template_unify_rollback.sql
-- =============================================================================

ALTER TABLE public.receipt_templates
  ADD COLUMN IF NOT EXISTS print_signature_line boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_line_disclaimer text NULL;

COMMENT ON COLUMN public.receipt_templates.print_signature_line IS
  'Sale receipt only: print a cardholder signature block on the merchant copy of card payments.';
COMMENT ON COLUMN public.receipt_templates.signature_line_disclaimer IS
  'Optional text under the signature line. NULL/blank = POS default string.';

DO $unify$
DECLARE
  r record;
BEGIN
  -- Both rows exist: keep 'receipt', retire 'sale'.
  FOR r IN
    UPDATE public.receipt_templates s
       SET template_type = 'sale_retired', is_active = false, updated_at = now()
     WHERE s.template_type = 'sale'
       AND EXISTS (SELECT 1 FROM public.receipt_templates k
                    WHERE k.merchant_id = s.merchant_id
                      AND k.location_id IS NOT DISTINCT FROM s.location_id
                      AND k.template_type = 'receipt')
    RETURNING s.id, s.location_id
  LOOP
    RAISE NOTICE 'receipt_templates: retired sale row % (location %)', r.id, r.location_id;
  END LOOP;

  -- Lone 'sale' row: becomes the location's 'receipt' row.
  FOR r IN
    UPDATE public.receipt_templates s
       SET template_type = 'receipt', updated_at = now()
     WHERE s.template_type = 'sale'
    RETURNING s.id, s.location_id
  LOOP
    RAISE NOTICE 'receipt_templates: renamed sale -> receipt row % (location %)', r.id, r.location_id;
  END LOOP;
END
$unify$;
