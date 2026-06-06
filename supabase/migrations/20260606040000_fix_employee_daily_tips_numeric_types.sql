-- Repair: prod's employee_daily_tips money columns were applied as integer
-- (likely a prior ALTER TYPE was recorded in schema_migrations but never
-- actually ran). Staging carries numeric(12,2). Every tips calc in prod is
-- currently truncating to whole dollars.
--
-- Affected columns (all on public.employee_daily_tips):
--   cash_tips_declared, charged_tips, gross_sales, tip_out_given,
--   tip_out_received, tip_pool_contributed, tip_pool_received
--
-- The cast preserves existing whole-dollar values (50 -> 50.00). No data loss.
--
-- NOTE: total_tips is a STORED generated column that references six of these
-- columns, so Postgres blocks ALTER TYPE on them while the dependency exists.
-- We drop total_tips, alter the underlying columns, then recreate total_tips
-- with the same expression (cast-free, since all inputs are now numeric).

ALTER TABLE public.employee_daily_tips
  DROP COLUMN IF EXISTS total_tips;

ALTER TABLE public.employee_daily_tips
  ALTER COLUMN cash_tips_declared   TYPE numeric(12,2) USING cash_tips_declared::numeric(12,2),
  ALTER COLUMN cash_tips_declared   SET DEFAULT 0.00,
  ALTER COLUMN charged_tips         TYPE numeric(12,2) USING charged_tips::numeric(12,2),
  ALTER COLUMN charged_tips         SET DEFAULT 0.00,
  ALTER COLUMN gross_sales          TYPE numeric(12,2) USING gross_sales::numeric(12,2),
  ALTER COLUMN tip_out_given        TYPE numeric(12,2) USING tip_out_given::numeric(12,2),
  ALTER COLUMN tip_out_given        SET DEFAULT 0.00,
  ALTER COLUMN tip_out_received     TYPE numeric(12,2) USING tip_out_received::numeric(12,2),
  ALTER COLUMN tip_out_received     SET DEFAULT 0.00,
  ALTER COLUMN tip_pool_contributed TYPE numeric(12,2) USING tip_pool_contributed::numeric(12,2),
  ALTER COLUMN tip_pool_contributed SET DEFAULT 0.00,
  ALTER COLUMN tip_pool_received    TYPE numeric(12,2) USING tip_pool_received::numeric(12,2),
  ALTER COLUMN tip_pool_received    SET DEFAULT 0.00;

ALTER TABLE public.employee_daily_tips
  ADD COLUMN total_tips numeric
  GENERATED ALWAYS AS (
    cash_tips_declared
    + cash_payment_tips
    + charged_tips
    + tip_pool_received
    - tip_pool_contributed
    + tip_out_received
    - tip_out_given
  ) STORED;
