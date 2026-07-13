-- Invoices: lifecycle timestamps + public token + amount_paid + bill_type.
-- Mirrors the receipt-token idiom (20260529000000_public_receipt_tokens.sql):
-- pgcrypto in `extensions`, gen_random_bytes fully qualified, NOT NULL + volatile
-- DEFAULT in one DDL so ADD COLUMN backfills per-row without a separate UPDATE.
--
-- DB-apply is a coordinated, staging-first step (SQL editor + `migration repair`
-- with Ali Dika). After apply, regenerate database.types.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── public_token (opaque single key per invoice — the /invoice/<token> link) ──
-- Unlike receipts (per-order + per-send tokens), an invoice is one payable, so a
-- single per-invoice token is the link key. invoice_sends is the audit trail.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token text NOT NULL DEFAULT
    replace(replace(replace(
      encode(extensions.gen_random_bytes(16), 'base64'),
      '+', '-'), '/', '_'), '=', '');

-- If a prior partial run added it nullable, backfill then tighten.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices'
      AND column_name='public_token' AND is_nullable='YES'
  ) THEN
    UPDATE public.invoices
      SET public_token = replace(replace(replace(
            encode(extensions.gen_random_bytes(16), 'base64'),
            '+', '-'), '/', '_'), '=', '')
    WHERE public_token IS NULL;
  END IF;
END $$;

ALTER TABLE public.invoices
  ALTER COLUMN public_token SET NOT NULL,
  ALTER COLUMN public_token SET DEFAULT
    replace(replace(replace(
      encode(extensions.gen_random_bytes(16), 'base64'),
      '+', '-'), '/', '_'), '=', '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token
  ON public.invoices (public_token);

-- ─── Lifecycle timestamps + amount_paid ───────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at      timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid  numeric(12, 2) NOT NULL DEFAULT 0;

-- ─── bill_type (added now so §5 admin billing needs no re-migration) ───────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bill_type text NOT NULL DEFAULT 'merchant_to_customer';

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_bill_type_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_bill_type_check
    CHECK (bill_type IN ('merchant_to_customer', 'platform_to_merchant'));

-- ─── Add payment_failed to the status CHECK (keep lowercase set) ───────────────
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
    CHECK (status IN (
      'draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'payment_failed'
    ));

-- ─── Trigger: auto-assign public_token on new invoices ────────────────────────
CREATE OR REPLACE FUNCTION public.set_invoice_public_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := replace(replace(replace(
      encode(extensions.gen_random_bytes(16), 'base64'),
      '+', '-'), '/', '_'), '=', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_set_public_token ON public.invoices;
CREATE TRIGGER trg_invoices_set_public_token
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_public_token();
