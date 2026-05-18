ALTER TABLE public.settlement_batches
    ADD COLUMN IF NOT EXISTS acquirer TEXT,
    ADD COLUMN IF NOT EXISTS batch_number TEXT;

COMMENT ON COLUMN public.settlement_batches.acquirer IS
    'Card-network acquirer that assigned this batch number. Mirrors order_payments.acquirer (TSYS, FISERV, ...). NULL for legacy rows created by prepare_castles_settlement before Wave B.';
COMMENT ON COLUMN public.settlement_batches.batch_number IS
    'Acquirer-assigned host batch number (mirrors order_payments.batch_number). Use this for reconciliation against external processor reports. castles_batch_num is retained for one release as a read-shim.';

UPDATE public.settlement_batches
SET acquirer = 'TSYS',
    batch_number = castles_batch_num
WHERE castles_batch_num IS NOT NULL
  AND batch_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_batches_host_key
    ON public.settlement_batches (payment_terminal_id, acquirer, batch_number)
    WHERE batch_number IS NOT NULL;;
