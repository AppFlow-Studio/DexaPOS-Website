-- Rollback for 20260927130000_receipt_signature_line_and_sale_template_unify.sql
--
-- Only run together with reverting the Website sale -> 'receipt' mapping;
-- otherwise the Website loses its Sale Receipt row again.
--
-- 1. Retired rows go back to 'sale' (safe on every environment).
-- 2. Rows the forward migration RENAMED sale -> 'receipt' cannot be told apart
--    from POS-created 'receipt' rows, so they are listed by id. The forward run
--    printed them ("renamed sale -> receipt row …"); fill in per environment.
--      STAGING (dfwqakoyittmrwbqvxgw), captured before apply 2026-09-26:
--        3ef85a1c-670b-410f-80e6-c430583cfebe
--        463bb786-f85b-4a5f-a78b-a46793ea329e
--        978b057b-3d2a-4ee4-abe7-71bd39bc2262
--        b3a2a418-70b3-4ab3-9fd1-5df30f1d075e
--      PROD (hifouuofcaytijrkbvcy): none expected (only location with a 'sale'
--        row also has a 'receipt' row, so it is retired, not renamed).
-- 3. Drop the signature columns (loses any merchant's saved toggle/disclaimer).

UPDATE public.receipt_templates
   SET template_type = 'sale', is_active = true, updated_at = now()
 WHERE template_type = 'sale_retired';

UPDATE public.receipt_templates
   SET template_type = 'sale', updated_at = now()
 WHERE template_type = 'receipt'
   AND id = ANY (ARRAY[
     -- staging ids; replace with the NOTICE output for the environment
     '3ef85a1c-670b-410f-80e6-c430583cfebe',
     '463bb786-f85b-4a5f-a78b-a46793ea329e',
     '978b057b-3d2a-4ee4-abe7-71bd39bc2262',
     'b3a2a418-70b3-4ab3-9fd1-5df30f1d075e'
   ]::uuid[]);

ALTER TABLE public.receipt_templates
  DROP COLUMN IF EXISTS signature_line_disclaimer,
  DROP COLUMN IF EXISTS print_signature_line;
