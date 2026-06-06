-- Rollback for 20260606040100_fix_order_payments_processor_fee_snapshot_constraints.sql.
-- Removes the NOT NULL + default. Data is unaffected.

ALTER TABLE public.order_payments
  ALTER COLUMN processor_fee_percentage_snapshot DROP NOT NULL,
  ALTER COLUMN processor_fee_percentage_snapshot DROP DEFAULT;
