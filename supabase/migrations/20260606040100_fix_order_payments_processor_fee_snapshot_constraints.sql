-- Repair: prod's order_payments.processor_fee_percentage_snapshot lost its
-- NOT NULL + default 0 constraints. Staging carries `numeric NOT NULL DEFAULT 0`.
-- Without the default, any insert that omits the column writes NULL, which
-- breaks the platform-fee tracking aggregation in get_platform_fees_summary
-- (per the project_platform_fee_tracking memory).
--
-- Step 1 backfills any existing NULLs to 0; step 2 reinstates the constraints.

UPDATE public.order_payments
SET processor_fee_percentage_snapshot = 0
WHERE processor_fee_percentage_snapshot IS NULL;

ALTER TABLE public.order_payments
  ALTER COLUMN processor_fee_percentage_snapshot SET DEFAULT 0,
  ALTER COLUMN processor_fee_percentage_snapshot SET NOT NULL;
