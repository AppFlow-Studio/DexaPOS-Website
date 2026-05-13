-- Re-add FKs lost on prod. Prod was patched via 20260414000001_prod_delta.sql,
-- which added new columns but skipped the FK constraints staging has on them.
-- PostgREST needs these relationships in its schema cache to resolve embedded
-- selects like:
--   order_payments?select=settlement_batch:settlement_batches(...)
--   settlement_batches?select=payment_terminal:payment_terminals(...)
-- Without them, the embed fails with
-- "Could not find a relationship between '<a>' and '<b>'".
-- Idempotent: no-op on staging where the constraints already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_payments_settlement_batch_id_fkey'
      AND conrelid = 'public.order_payments'::regclass
  ) THEN
    ALTER TABLE public.order_payments
      ADD CONSTRAINT order_payments_settlement_batch_id_fkey
      FOREIGN KEY (settlement_batch_id)
      REFERENCES public.settlement_batches(id)
      ON DELETE SET NULL
      NOT VALID;

    ALTER TABLE public.order_payments
      VALIDATE CONSTRAINT order_payments_settlement_batch_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settlement_batches_payment_terminal_id_fkey'
      AND conrelid = 'public.settlement_batches'::regclass
  ) THEN
    ALTER TABLE public.settlement_batches
      ADD CONSTRAINT settlement_batches_payment_terminal_id_fkey
      FOREIGN KEY (payment_terminal_id)
      REFERENCES public.payment_terminals(id)
      ON DELETE SET NULL
      NOT VALID;

    ALTER TABLE public.settlement_batches
      VALIDATE CONSTRAINT settlement_batches_payment_terminal_id_fkey;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
