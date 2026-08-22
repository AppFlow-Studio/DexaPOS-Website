-- Repair prod drift: restore the tip-system v1.1 columns that are missing on prod.
--
-- Background: migration 20260419000000_tip_system_v1_1_bolstering added several
-- columns via ALTER TABLE ... ADD COLUMN and is recorded as applied on prod.
-- However five of those columns are absent from the live prod schema (staging
-- still has all of them). The tip functions from the same/later migrations
-- (calculate_tip_distribution_v2, rebuild_employee_daily_tips,
-- declare_cash_tips_for_shift) survived, so prod ends up with functions that
-- reference columns its own tables no longer have.
--
-- Symptom: /dashboard/tips "Projected Distribution" fails with
--   `column ss.declared_cash_tips does not exist`
-- (preview_tip_distribution -> calculate_tip_distribution_v2). After that column
-- the next reference (tip_out_clipped) would fail the same way. Cash-tip
-- declaration at clock-out (declare_cash_tips_for_shift) is also broken.
--
-- Verified via prod-vs-staging column diff of every tip_* table + staff_shifts /
-- employee_daily_tips. The complete set missing on prod is exactly:
--   * staff_shifts.declared_cash_tips
--   * staff_shifts.tips_declared_at
--   * tip_distribution_details.tip_out_clipped
--   * tip_pool_configs.priority
--   * tip_pool_configs.policy_interval  (+ its CHECK constraint)
-- (employee_daily_tips / tip_distribution_sessions kept their bolstering columns
-- because later migrations re-added them; these five had no later re-add.)
-- The four preview-path functions are byte-identical (same pg_get_functiondef
-- md5) between prod and staging, so restoring these columns makes prod's tip
-- system match staging exactly.
--
-- Definitions below are copied verbatim from 20260419000000_tip_system_v1_1_
-- bolstering. Every statement is IF NOT EXISTS / guarded, so this is a safe
-- no-op on environments that already have the columns (e.g. staging).

-- staff_shifts: shift-level cash tip declaration fields
ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS declared_cash_tips NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tips_declared_at   TIMESTAMPTZ;
COMMENT ON COLUMN public.staff_shifts.declared_cash_tips IS
  'Cash tips declared by the employee at clock-out. Summed into '
  'employee_daily_tips.cash_tips_declared per shift date.';

-- tip_distribution_details: clipped tip-out tracking
ALTER TABLE public.tip_distribution_details
  ADD COLUMN IF NOT EXISTS tip_out_clipped NUMERIC(12,2) NOT NULL DEFAULT 0.00;
COMMENT ON COLUMN public.tip_distribution_details.tip_out_clipped IS
  'Amount of tip_out_given that was clipped to prevent net_tips < 0. '
  'Surfaced to managers when reviewing a calculated session.';

-- tip_pool_configs: multi-pool ordering + aggregation window
ALTER TABLE public.tip_pool_configs
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
COMMENT ON COLUMN public.tip_pool_configs.priority IS
  'Evaluation order when multiple pools exist for the same location. '
  'Lower values run first. Ties broken by created_at.';

ALTER TABLE public.tip_pool_configs
  ADD COLUMN IF NOT EXISTS policy_interval TEXT NOT NULL DEFAULT 'full_workday';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tip_pool_configs_policy_interval_check'
  ) THEN
    ALTER TABLE public.tip_pool_configs
      ADD CONSTRAINT tip_pool_configs_policy_interval_check
      CHECK (policy_interval IN ('full_workday', 'by_shift', 'order'));
  END IF;
END $$;
COMMENT ON COLUMN public.tip_pool_configs.policy_interval IS
  'Aggregation window for the pool. v1.1 only supports full_workday. '
  'by_shift requires shift_windows table (v1.2). order requires per-check '
  'calculation (v1.3).';
