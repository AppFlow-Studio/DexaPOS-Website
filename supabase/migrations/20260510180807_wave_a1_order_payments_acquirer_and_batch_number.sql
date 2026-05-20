ALTER TABLE public.order_payments
    ADD COLUMN IF NOT EXISTS acquirer TEXT;

COMMENT ON COLUMN public.order_payments.acquirer IS
    'Card-network acquirer/processor that owns the host batch for this payment. Free-form (TSYS, FISERV, WORLDPAY, ...). NULL for cash or pre-migration rows.';

COMMENT ON COLUMN public.order_payments.batch_number IS
    'Acquirer-assigned host batch number from the terminal response (txnBatchNo for Castles, BatchNumber for Dejavoo SPIN). Identifies the host batch this payment belongs to. Pair with acquirer + terminal_id for reconciliation against external processor reports (Luqra, etc).';

CREATE INDEX IF NOT EXISTS idx_order_payments_acquirer_batch
    ON public.order_payments (terminal_id, acquirer, batch_number)
    WHERE batch_number IS NOT NULL;;
