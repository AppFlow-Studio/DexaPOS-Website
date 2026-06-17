-- invoice_sends — audit trail + rate-limit source for invoice email/SMS delivery.
-- Clone of receipt_sends (20260505000000_receipt_sends_table.sql), minus the
-- per-send token: the invoice's single public_token is the link key. Status
-- includes 'pending' so sendInvoice can write a row before dispatch then settle
-- it to 'sent'/'failed' (same pattern as send-receipt.ts).
--
-- Writes are service-role only; reads scoped to the merchant's own staff.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  merchant_id     uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  delivery_method text NOT NULL CHECK (delivery_method IN ('email', 'sms')),
  recipient       text NOT NULL,
  status          text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error_message   text,
  created_by      text,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_sends_invoice_sent_at
  ON public.invoice_sends (invoice_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_sends_merchant_sent_at
  ON public.invoice_sends (merchant_id, sent_at DESC);

ALTER TABLE public.invoice_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_sends_select_merchant_staff ON public.invoice_sends;
CREATE POLICY invoice_sends_select_merchant_staff
  ON public.invoice_sends FOR SELECT
  USING (
    is_merchant_admin(merchant_id)
    OR is_dexapos_admin()
    OR merchant_id IN (
      SELECT merchant_id FROM public.staff_profiles WHERE user_id = get_my_claim('sub')
    )
  );

COMMIT;
