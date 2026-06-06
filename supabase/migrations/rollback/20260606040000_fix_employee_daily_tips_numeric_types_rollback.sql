-- Rollback for 20260606040000_fix_employee_daily_tips_numeric_types.sql.
--
-- WARNING: integer cast truncates the fractional part. Any cents accumulated
-- after the forward migration will be lost. Only run if you genuinely need
-- the integer shape back.

ALTER TABLE public.employee_daily_tips
  ALTER COLUMN cash_tips_declared   TYPE integer USING ROUND(cash_tips_declared)::integer,
  ALTER COLUMN cash_tips_declared   SET DEFAULT 0,
  ALTER COLUMN charged_tips         TYPE integer USING ROUND(charged_tips)::integer,
  ALTER COLUMN charged_tips         SET DEFAULT 0,
  ALTER COLUMN gross_sales          TYPE integer USING ROUND(gross_sales)::integer,
  ALTER COLUMN tip_out_given        TYPE integer USING ROUND(tip_out_given)::integer,
  ALTER COLUMN tip_out_given        SET DEFAULT 0,
  ALTER COLUMN tip_out_received     TYPE integer USING ROUND(tip_out_received)::integer,
  ALTER COLUMN tip_out_received     SET DEFAULT 0,
  ALTER COLUMN tip_pool_contributed TYPE integer USING ROUND(tip_pool_contributed)::integer,
  ALTER COLUMN tip_pool_contributed SET DEFAULT 0,
  ALTER COLUMN tip_pool_received    TYPE integer USING ROUND(tip_pool_received)::integer,
  ALTER COLUMN tip_pool_received    SET DEFAULT 0;
