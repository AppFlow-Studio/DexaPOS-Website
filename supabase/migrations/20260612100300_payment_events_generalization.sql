-- payment_events generalization (minimal — coordinate apply with Ali Dika).
--
-- Today payment_events.payment_id is FK→order_payments(id), so an invoice
-- payment cannot log events there. §8 (NMI webhook) needs invoice charges to
-- write the same event ledger. Two minimal changes:
--   1. Drop the order-only FK so payment_id may reference an invoice_payments.id.
--      (payment_id stays NOT NULL; it just loses the table-specific constraint.)
--   2. Add a nullable invoice_id FK so invoice events are queryable by invoice.
--
-- Deliberately NOT introducing polymorphic typing — order events keep order_id,
-- invoice events set invoice_id; exactly one is populated per row. If the FK drop
-- is deemed risky at apply time, defer step 1 and log invoice events with
-- payment_id referencing invoice_payments via an unconstrained column instead.

BEGIN;

ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_payment_id_fkey;

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS invoice_id uuid;

ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_invoice_id_fkey;
ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_invoice_id
  ON public.payment_events (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMIT;
