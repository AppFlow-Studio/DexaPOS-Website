-- invoice_payments — a focused subset of order_payments for invoice charges.
-- Money is numeric(12,2). Writes are server-side (service-role / chargeInvoice +
-- the §8 NMI webhook) — no public insert. RLS limits reads to the owning
-- merchant's admins and Dexa HQ admins.
--
-- DB-apply is coordinated staging-first with Ali Dika; regenerate
-- database.types.ts afterward.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  merchant_id        uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id        uuid REFERENCES public.locations(id) ON DELETE SET NULL,

  amount             numeric(12, 2) NOT NULL DEFAULT 0,
  status             public.payment_status NOT NULL DEFAULT 'pending',

  processor_name     text DEFAULT 'nmi',
  transaction_id     text,
  authorization_code text,
  card_type          text,
  card_last_four     text,
  card_token         text,
  processor_response jsonb,

  error_code         text,
  error_message      text,

  -- Per-attempt idempotency key — guards double-submit from the public pay page.
  idempotency_key    text,

  initiated_at       timestamptz NOT NULL DEFAULT now(),
  authorized_at      timestamptz,
  captured_at        timestamptz,
  failed_at          timestamptz,

  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
  ON public.invoice_payments (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_merchant
  ON public.invoice_payments (merchant_id, created_at DESC);

-- Idempotency: at most one row per non-null key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_idempotency_key
  ON public.invoice_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- updated_at maintenance (function already exists project-wide).
DROP TRIGGER IF EXISTS update_invoice_payments_updated_at ON public.invoice_payments;
CREATE TRIGGER update_invoice_payments_updated_at
  BEFORE UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- Merchant admins see their own invoice payments; Dexa HQ admins see all.
-- No INSERT/UPDATE policy → writes only via service-role (chargeInvoice/webhook).
DROP POLICY IF EXISTS invoice_payments_select ON public.invoice_payments;
CREATE POLICY invoice_payments_select
  ON public.invoice_payments FOR SELECT
  USING (
    is_merchant_admin(merchant_id)
    OR is_dexapos_admin()
  );

COMMIT;
