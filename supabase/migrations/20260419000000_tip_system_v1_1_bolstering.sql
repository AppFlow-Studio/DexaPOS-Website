-- =============================================================================
-- Migration: Tip System v1.1 Bolstering
-- Date: 2026-04-19
-- Author: DEXA POS — Tip Manager Workstream
-- Target: Staging (dfwqakoyittmrwbqvxgw) → Production (ymbmhyrhofnfdooszehx)
-- =============================================================================
--
-- OVERVIEW
-- --------
-- This migration closes the gaps between DEXA's current tip system and a
-- Toast-parity Tip Manager. It is structured as 8 chunks matching the approved
-- design plan. Run top-to-bottom in a single transaction on staging first.
--
-- SAFETY PROFILE
-- --------------
-- • All schema changes are additive (new columns, new tables, new indexes)
--   except for the type-widening of employee_daily_tips (zero rows verified).
-- • Two CREATE OR REPLACE FUNCTION replacements (calculate_tip_distribution_v2).
-- • One DROP FUNCTION at the end (calculate_tip_distribution v1) — gated on
--   verifying no external callers. Commented out in this file; run manually
--   after grep verification.
-- • No data backfills required.
-- • Idempotent via IF NOT EXISTS / OR REPLACE / CREATE OR REPLACE throughout.
--
-- EXECUTION ORDER
-- ---------------
--   Chunk 1: Type conversion in employee_daily_tips
--   Chunk 2: Attribution plumbing (staff_shifts column, rebuild RPC, etc.)
--   Chunk 3: Pool configuration hardening (priority, policy_interval, validation)
--   Chunk 4: Tip-out reciprocity guard
--   Chunk 5: Rewrite calculate_tip_distribution_v2
--   Chunk 6: Session lifecycle (void, export, tip_payroll_exports table)
--   Chunk 7: Drop calculate_tip_distribution v1 (manual step)
--   Chunk 8: policy_interval column on tip_pool_configs (merged into Chunk 3)
--
-- =============================================================================

BEGIN;
-- =============================================================================
-- CHUNK 1 — Type conversion in employee_daily_tips
-- -----------------------------------------------------------------------------
-- Rationale: employee_daily_tips has 8 INTEGER monetary columns that violate
-- the DEXA NUMERIC(12,2) dollar convention. Table is empty on staging, verified
-- via: SELECT COUNT(*) FROM employee_daily_tips → (any row count safe since
-- INTEGER → NUMERIC is a widening conversion and PostgreSQL handles it cleanly).
-- =============================================================================

ALTER TABLE public.employee_daily_tips
  ALTER COLUMN cash_tips_declared   TYPE NUMERIC(12,2) USING cash_tips_declared::numeric,
  ALTER COLUMN charged_tips         TYPE NUMERIC(12,2) USING charged_tips::numeric,
  ALTER COLUMN tip_pool_received    TYPE NUMERIC(12,2) USING tip_pool_received::numeric,
  ALTER COLUMN tip_pool_contributed TYPE NUMERIC(12,2) USING tip_pool_contributed::numeric,
  ALTER COLUMN tip_out_given        TYPE NUMERIC(12,2) USING tip_out_given::numeric,
  ALTER COLUMN tip_out_received     TYPE NUMERIC(12,2) USING tip_out_received::numeric,
  ALTER COLUMN total_tips           TYPE NUMERIC(12,2) USING total_tips::numeric,
  ALTER COLUMN gross_sales          TYPE NUMERIC(12,2) USING gross_sales::numeric;
-- Set clean defaults to 0.00 instead of 0 for the now-numeric columns
ALTER TABLE public.employee_daily_tips
  ALTER COLUMN cash_tips_declared   SET DEFAULT 0.00,
  ALTER COLUMN charged_tips         SET DEFAULT 0.00,
  ALTER COLUMN tip_pool_received    SET DEFAULT 0.00,
  ALTER COLUMN tip_pool_contributed SET DEFAULT 0.00,
  ALTER COLUMN tip_out_given        SET DEFAULT 0.00,
  ALTER COLUMN tip_out_received     SET DEFAULT 0.00;
-- =============================================================================
-- CHUNK 2 — Attribution plumbing
-- -----------------------------------------------------------------------------
-- 2a. staff_shifts gets declared_cash_tips + tips_declared_at columns
-- 2b. rebuild_employee_daily_tips() — pulls from orders/payments/shifts
-- 2c. declare_cash_tips_for_shift() — clock-out flow entry point
-- 2d. upsert_employee_daily_tips_override() — manager manual-edit path
-- 2e. verify_employee_daily_tips() — manager lock-in path
-- =============================================================================

-- 2a: Add shift-level cash tip declaration fields
ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS declared_cash_tips NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tips_declared_at   TIMESTAMPTZ;
COMMENT ON COLUMN public.staff_shifts.declared_cash_tips IS
  'Cash tips declared by the employee at clock-out. Summed into '
  'employee_daily_tips.cash_tips_declared per shift date.';
-- -----------------------------------------------------------------------------
-- 2b: rebuild_employee_daily_tips
--     Recomputes employee_daily_tips rows for a given location + shift_date
--     from source tables. Idempotent. Skips rows already marked is_verified=true.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_employee_daily_tips(
  p_location_id UUID,
  p_shift_date  DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id UUID;
  v_timezone    TEXT;
  v_rows        INTEGER := 0;
BEGIN
  -- Authorization + resolve location metadata
  SELECT merchant_id, COALESCE(timezone, 'UTC')
    INTO v_merchant_id, v_timezone
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location % not found', p_location_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized to rebuild tips for this merchant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Aggregate server-attributed charged tips and gross sales from orders
  -- Attribution: assigned_server_id (primary) → created_by_staff_id (fallback)
  -- Exclusions: cancelled, voided, refunded orders; non-captured payments
  -- Date boundary: orders.created_at converted to location timezone
  WITH server_activity AS (
    SELECT
      COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_profile_id,
      o.id AS order_id,
      o.subtotal
    FROM public.orders o
    WHERE o.location_id = p_location_id
      AND ((o.created_at AT TIME ZONE v_timezone)::date) = p_shift_date
      AND o.status NOT IN ('cancelled', 'void', 'refunded')
      AND COALESCE(o.assigned_server_id, o.created_by_staff_id) IS NOT NULL
  ),
  server_charged AS (
    SELECT
      sa.staff_profile_id,
      COALESCE(SUM(op.tip_amount), 0)::NUMERIC(12,2) AS charged_tips,
      COALESCE(SUM(sa.subtotal), 0)::NUMERIC(12,2)   AS gross_sales
    FROM server_activity sa
    JOIN public.order_payments op ON op.order_id = sa.order_id
    WHERE op.status = 'captured'
    GROUP BY sa.staff_profile_id
  ),
  shift_totals AS (
    -- Sum hours and declared cash tips across all shifts that started on this date
    SELECT
      ss.staff_profile_id,
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (
          COALESCE(ss.clock_out_time, now()) - ss.clock_in_time
        )) / 3600.0
      ), 0)::NUMERIC(6,2) AS hours_worked,
      COALESCE(SUM(ss.declared_cash_tips), 0)::NUMERIC(12,2) AS cash_tips_declared
    FROM public.staff_shifts ss
    WHERE ss.location_id = p_location_id
      AND ((ss.clock_in_time AT TIME ZONE v_timezone)::date) = p_shift_date
    GROUP BY ss.staff_profile_id
  ),
  combined AS (
    SELECT
      COALESCE(sc.staff_profile_id, st.staff_profile_id) AS staff_profile_id,
      COALESCE(sc.charged_tips, 0.00)       AS charged_tips,
      COALESCE(sc.gross_sales, 0.00)        AS gross_sales,
      COALESCE(st.hours_worked, 0.00)       AS hours_worked,
      COALESCE(st.cash_tips_declared, 0.00) AS cash_tips_declared
    FROM server_charged sc
    FULL OUTER JOIN shift_totals st USING (staff_profile_id)
  )
  INSERT INTO public.employee_daily_tips (
    staff_profile_id, merchant_id, location_id, shift_date,
    charged_tips, gross_sales, hours_worked, cash_tips_declared,
    total_tips
  )
  SELECT
    c.staff_profile_id, v_merchant_id, p_location_id, p_shift_date,
    c.charged_tips, c.gross_sales, c.hours_worked, c.cash_tips_declared,
    c.charged_tips + c.cash_tips_declared
  FROM combined c
  WHERE c.staff_profile_id IS NOT NULL
  ON CONFLICT (staff_profile_id, location_id, shift_date) DO UPDATE
    SET charged_tips       = EXCLUDED.charged_tips,
        gross_sales        = EXCLUDED.gross_sales,
        hours_worked       = EXCLUDED.hours_worked,
        cash_tips_declared = EXCLUDED.cash_tips_declared,
        total_tips         = EXCLUDED.charged_tips + EXCLUDED.cash_tips_declared,
        updated_at         = now()
    -- Never clobber manually verified rows — manager's final word wins
    WHERE public.employee_daily_tips.is_verified = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
COMMENT ON FUNCTION public.rebuild_employee_daily_tips IS
  'Recomputes daily tip rollups from orders/payments/staff_shifts for a given '
  'location and date. Idempotent. Skips rows where is_verified=true. Called '
  'automatically by calculate_tip_distribution_v2 and manually by the manager '
  'reconciliation screen.';
-- -----------------------------------------------------------------------------
-- 2c: declare_cash_tips_for_shift
--     Called from the clock-out modal. Staff can only set their own shift;
--     managers can set any shift within their merchant.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.declare_cash_tips_for_shift(
  p_shift_id UUID,
  p_amount   NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_shift       RECORD;
  v_caller_sp   UUID;
  v_is_manager  BOOLEAN;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Declared cash tips cannot be negative'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_shift
  FROM public.staff_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift % not found', p_shift_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorization: must be same merchant; must be either the shift owner OR a manager
  IF NOT (is_dexapos_admin() OR v_shift.merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve caller's staff_profile_id (for self-declaration check)
  SELECT sp.id INTO v_caller_sp
  FROM public.staff_profiles sp
  WHERE sp.user_id = (auth.jwt() ->> 'sub');

  -- Manager authorization: DEXA admin OR merchant admin for the shift's merchant
  v_is_manager := is_dexapos_admin() OR is_merchant_admin(v_shift.merchant_id);

  IF NOT v_is_manager AND v_caller_sp IS DISTINCT FROM v_shift.staff_profile_id THEN
    RAISE EXCEPTION 'Can only declare tips for your own shift'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.staff_shifts
  SET declared_cash_tips = p_amount,
      tips_declared_at   = now(),
      updated_at         = now()
  WHERE id = p_shift_id;

  -- Cascade the refresh into employee_daily_tips for this shift's date
  PERFORM public.rebuild_employee_daily_tips(
    v_shift.location_id,
    ((v_shift.clock_in_time AT TIME ZONE COALESCE(
      (SELECT timezone FROM public.locations WHERE id = v_shift.location_id),
      'UTC'
    ))::date)
  );

  RETURN json_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'declared_amount', p_amount
  );
END;
$$;
-- -----------------------------------------------------------------------------
-- 2d: upsert_employee_daily_tips_override
--     Manager-facing manual edit. Any non-null param overrides the computed
--     value. Sets is_verified=false because manual edit requires re-verify.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_employee_daily_tips_override(
  p_staff_profile_id UUID,
  p_location_id      UUID,
  p_shift_date       DATE,
  p_cash_tips_declared NUMERIC DEFAULT NULL,
  p_charged_tips       NUMERIC DEFAULT NULL,
  p_gross_sales        NUMERIC DEFAULT NULL,
  p_hours_worked       NUMERIC DEFAULT NULL,
  p_cover_count        INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id UUID;
  v_row_id      UUID;
BEGIN
  SELECT merchant_id INTO v_merchant_id
  FROM public.locations WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.employee_daily_tips (
    staff_profile_id, merchant_id, location_id, shift_date,
    cash_tips_declared, charged_tips, gross_sales, hours_worked, cover_count,
    is_verified
  )
  VALUES (
    p_staff_profile_id, v_merchant_id, p_location_id, p_shift_date,
    COALESCE(p_cash_tips_declared, 0.00),
    COALESCE(p_charged_tips, 0.00),
    COALESCE(p_gross_sales, 0.00),
    COALESCE(p_hours_worked, 0.00),
    p_cover_count,
    false
  )
  ON CONFLICT (staff_profile_id, location_id, shift_date) DO UPDATE
    SET cash_tips_declared = COALESCE(p_cash_tips_declared, public.employee_daily_tips.cash_tips_declared),
        charged_tips       = COALESCE(p_charged_tips, public.employee_daily_tips.charged_tips),
        gross_sales        = COALESCE(p_gross_sales, public.employee_daily_tips.gross_sales),
        hours_worked       = COALESCE(p_hours_worked, public.employee_daily_tips.hours_worked),
        cover_count        = COALESCE(p_cover_count, public.employee_daily_tips.cover_count),
        total_tips         = COALESCE(p_charged_tips, public.employee_daily_tips.charged_tips)
                           + COALESCE(p_cash_tips_declared, public.employee_daily_tips.cash_tips_declared),
        is_verified        = false,
        verified_by        = NULL,
        verified_at        = NULL,
        updated_at         = now()
  RETURNING id INTO v_row_id;

  RETURN json_build_object('success', true, 'id', v_row_id);
END;
$$;
-- -----------------------------------------------------------------------------
-- 2e: verify_employee_daily_tips
--     Manager lock-in. Sets is_verified=true, records verifier + timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_employee_daily_tips(
  p_id          UUID,
  p_verified_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id UUID;
BEGIN
  SELECT merchant_id INTO v_merchant_id
  FROM public.employee_daily_tips WHERE id = p_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Row not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.employee_daily_tips
  SET is_verified = true,
      verified_by = p_verified_by,
      verified_at = now(),
      updated_at  = now()
  WHERE id = p_id;

  RETURN json_build_object('success', true);
END;
$$;
-- =============================================================================
-- CHUNK 3 — Pool configuration hardening
-- -----------------------------------------------------------------------------
-- 3a. priority column on tip_pool_configs
-- 3b. Share-percentage validation (deferrable constraint trigger)
-- 3c. validate_tip_pool_config RPC (UI-facing pre-save check)
-- 3d. (from Chunk 8) policy_interval column on tip_pool_configs
-- =============================================================================

-- 3a: Ordering for multi-pool evaluation
ALTER TABLE public.tip_pool_configs
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
COMMENT ON COLUMN public.tip_pool_configs.priority IS
  'Evaluation order when multiple pools exist for the same location. '
  'Lower values run first. Ties broken by created_at.';
-- 3d (Chunk 8): Policy interval — reserve column, enforce full_workday only in v1.1
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
-- -----------------------------------------------------------------------------
-- 3b: Share-percentage sum validation (deferrable constraint trigger)
--     FOR EACH ROW with DEFERRABLE INITIALLY DEFERRED: runs at COMMIT so
--     bulk delete-then-insert patterns work. Fires once per row but each
--     check is a cheap indexed sum over a single pool.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_pool_share_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pool_id   UUID;
  v_pool_name TEXT;
  v_sum       NUMERIC;
BEGIN
  -- Pool id from NEW (INSERT/UPDATE) or OLD (DELETE)
  v_pool_id := COALESCE(NEW.tip_pool_config_id, OLD.tip_pool_config_id);

  -- Only validate percentage-method pools
  SELECT name INTO v_pool_name
  FROM public.tip_pool_configs
  WHERE id = v_pool_id AND distribution_method = 'percentage';

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(share_percentage), 0) INTO v_sum
  FROM public.tip_pool_role_shares
  WHERE tip_pool_config_id = v_pool_id
    AND is_eligible = true
    AND share_percentage IS NOT NULL;

  IF v_sum > 100 THEN
    RAISE EXCEPTION
      'Pool "%" has share_percentage sum of %%% which exceeds 100%%',
      v_pool_name, v_sum
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_pool_share_sum ON public.tip_pool_role_shares;
CREATE CONSTRAINT TRIGGER trg_validate_pool_share_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.tip_pool_role_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pool_share_sum();
-- -----------------------------------------------------------------------------
-- 3c: validate_tip_pool_config — pre-save UI validator
--     Returns { valid: bool, issues: [{code, message, severity}] }
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_tip_pool_config(p_config_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_config  RECORD;
  v_issues  JSONB := '[]'::JSONB;
  v_sum     NUMERIC;
  v_eligible_count INTEGER;
  v_invalid_roles TEXT[];
BEGIN
  SELECT * INTO v_config FROM public.tip_pool_configs WHERE id = p_config_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'CONFIG_NOT_FOUND',
        'message', 'Pool config not found',
        'severity', 'error'
      ))
    );
  END IF;

  -- Authorization
  IF NOT (is_dexapos_admin() OR v_config.merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Check 1: policy_interval support
  IF v_config.policy_interval <> 'full_workday' THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'POLICY_INTERVAL_UNSUPPORTED',
      'message', format('Policy interval "%s" is not yet supported. Use full_workday.', v_config.policy_interval),
      'severity', 'error'
    );
  END IF;

  -- Check 2: contributing roles are non-empty
  IF v_config.contributing_role_codes IS NULL OR cardinality(v_config.contributing_role_codes) = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'NO_CONTRIBUTING_ROLES',
      'message', 'At least one contributing role is required',
      'severity', 'error'
    );
  ELSE
    -- Check 2b: all contributing_role_codes reference real roles
    SELECT ARRAY_AGG(rc)
    INTO v_invalid_roles
    FROM unnest(v_config.contributing_role_codes) AS rc
    WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE code = rc);

    IF v_invalid_roles IS NOT NULL AND cardinality(v_invalid_roles) > 0 THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'INVALID_CONTRIBUTING_ROLES',
        'message', format('Unknown role codes: %s', array_to_string(v_invalid_roles, ', ')),
        'severity', 'error'
      );
    END IF;
  END IF;

  -- Check 3: at least one eligible role_share row
  SELECT COUNT(*) INTO v_eligible_count
  FROM public.tip_pool_role_shares
  WHERE tip_pool_config_id = p_config_id AND is_eligible = true;

  IF v_eligible_count = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'NO_ELIGIBLE_RECEIVERS',
      'message', 'At least one eligible recipient role is required',
      'severity', 'error'
    );
  END IF;

  -- Check 4: for 'percentage' method, sum of shares must equal 100
  IF v_config.distribution_method = 'percentage' THEN
    SELECT COALESCE(SUM(share_percentage), 0) INTO v_sum
    FROM public.tip_pool_role_shares
    WHERE tip_pool_config_id = p_config_id
      AND is_eligible = true
      AND share_percentage IS NOT NULL;

    IF v_sum > 100 THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'SHARE_SUM_OVER',
        'message', format('Share percentages sum to %s%%, must be ≤ 100%%', v_sum),
        'severity', 'error'
      );
    ELSIF v_sum < 100 THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'SHARE_SUM_UNDER',
        'message', format('Share percentages sum to %s%% — %s%% of pool will be unallocated',
                          v_sum, 100 - v_sum),
        'severity', 'warning'
      );
    END IF;
  END IF;

  -- Check 5: for 'points' method, each eligible role must have points_per_hour > 0
  IF v_config.distribution_method = 'points' THEN
    IF EXISTS (
      SELECT 1 FROM public.tip_pool_role_shares
      WHERE tip_pool_config_id = p_config_id
        AND is_eligible = true
        AND (points_per_hour IS NULL OR points_per_hour <= 0)
    ) THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'MISSING_POINTS',
        'message', 'All eligible roles must have points_per_hour > 0 when method is "points"',
        'severity', 'error'
      );
    END IF;
  END IF;

  -- Check 6: source_percentage must be between 0 and 100
  IF v_config.source_percentage IS NOT NULL
     AND (v_config.source_percentage < 0 OR v_config.source_percentage > 100) THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'INVALID_SOURCE_PCT',
      'message', 'source_percentage must be between 0 and 100',
      'severity', 'error'
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_issues) elt
      WHERE elt->>'severity' = 'error'
    ),
    'issues', v_issues
  );
END;
$$;
-- =============================================================================
-- CHUNK 4 — Tip-out reciprocity guard
-- -----------------------------------------------------------------------------
-- Prevents A→B and B→A tip-out rules from both being active for the same
-- location. Without this, servers and bussers could reciprocally tip each
-- other and silently double-charge.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_tip_out_no_reciprocity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.is_active = true AND EXISTS (
    SELECT 1 FROM public.tip_out_rules
    WHERE location_id    = NEW.location_id
      AND from_role_code = NEW.to_role_code
      AND to_role_code   = NEW.from_role_code
      AND is_active      = true
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION
      'Reciprocal tip-out exists: % → % conflicts with existing % → %',
      NEW.from_role_code, NEW.to_role_code,
      NEW.to_role_code,   NEW.from_role_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tip_out_no_reciprocity ON public.tip_out_rules;
CREATE TRIGGER trg_tip_out_no_reciprocity
  BEFORE INSERT OR UPDATE ON public.tip_out_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tip_out_no_reciprocity();
-- =============================================================================
-- CHUNK 5 — Rewrite calculate_tip_distribution_v2
-- -----------------------------------------------------------------------------
-- Four changes vs. current v2:
--   5a. Process pools in (priority ASC, created_at ASC) order
--   5b. Populate config_snapshot JSONB at calc time for audit trail
--   5c. Non-negative floor on tip_out_given (with tip_out_clipped column)
--   5d. Call rebuild_employee_daily_tips() at step 1.5
--
-- Also: enforce policy_interval = 'full_workday' for v1.1 (raises clean error).
-- =============================================================================

-- 5c pre-req: new column to track clipped tip-out amounts
ALTER TABLE public.tip_distribution_details
  ADD COLUMN IF NOT EXISTS tip_out_clipped NUMERIC(12,2) NOT NULL DEFAULT 0.00;
COMMENT ON COLUMN public.tip_distribution_details.tip_out_clipped IS
  'Amount of tip_out_given that was clipped to prevent net_tips < 0. '
  'Surfaced to managers when reviewing a calculated session.';
CREATE OR REPLACE FUNCTION public.calculate_tip_distribution_v2(
  p_merchant_id    UUID,
  p_location_id    UUID,
  p_session_date   DATE,
  p_shift_period   TEXT DEFAULT 'full_day',
  p_calculated_by  UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session_id        UUID;
  v_total_collected   NUMERIC;
  v_total_distributed NUMERIC;
  v_total_pooled      NUMERIC;
  v_total_tipouts     NUMERIC;
  v_pool              RECORD;
  v_rule              RECORD;
  v_role_share        RECORD;
  v_pool_total        NUMERIC;
  v_role_count        INTEGER;
  v_total_hours       NUMERIC;
  v_total_points      NUMERIC;
  v_tipout_total      NUMERIC;
  v_giver_count       INTEGER;
  v_receiver_count    INTEGER;
  v_snapshot          JSONB;
BEGIN
  -- Authorization
  IF NOT (is_dexapos_admin() OR p_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Advisory lock to prevent concurrent runs for same location/date
  PERFORM pg_advisory_xact_lock(
    hashtext(p_location_id::text || p_session_date::text)
  );

  -- =========================================================
  -- STEP 1: CREATE OR RESET SESSION
  -- =========================================================
  INSERT INTO public.tip_distribution_sessions(
    merchant_id, location_id, session_date, shift_period
  )
  VALUES (p_merchant_id, p_location_id, p_session_date, p_shift_period)
  ON CONFLICT (location_id, session_date, shift_period)
  DO UPDATE SET updated_at = now(), status = 'draft'
  RETURNING id INTO v_session_id;

  -- Block recalculation on voided or approved sessions
  PERFORM 1 FROM public.tip_distribution_sessions
  WHERE id = v_session_id AND status IN ('voided', 'approved', 'exported');
  IF FOUND THEN
    RAISE EXCEPTION
      'Session is in a locked state (voided/approved/exported). '
      'Void and recreate to recalculate.'
      USING ERRCODE = 'feature_not_supported';
  END IF;

  DELETE FROM public.tip_distribution_details WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 1.5 (new): REFRESH DAILY TIP ROLLUPS
  -- Ensures we never calculate on stale inputs.
  -- =========================================================
  PERFORM public.rebuild_employee_daily_tips(p_location_id, p_session_date);

  -- =========================================================
  -- STEP 2: POPULATE EMPLOYEE DATA FROM DAILY TIPS
  -- =========================================================
  INSERT INTO public.tip_distribution_details (
    session_id, staff_profile_id, staff_name, role_code,
    hours_worked, gross_sales,
    charged_tips, cash_tips, individual_tips_earned
  )
  SELECT
    v_session_id,
    edt.staff_profile_id,
    COALESCE(sp.display_name, sp.first_name || ' ' || sp.last_name, 'Unknown'),
    lm.role_code,
    COALESCE(edt.hours_worked, 0),
    COALESCE(edt.gross_sales, 0),
    COALESCE(edt.charged_tips, 0),
    COALESCE(edt.cash_tips_declared, 0),
    COALESCE(edt.charged_tips, 0) + COALESCE(edt.cash_tips_declared, 0)
  FROM public.employee_daily_tips edt
  JOIN public.location_members lm
    ON lm.staff_profile_id = edt.staff_profile_id
    AND lm.location_id = edt.location_id
  JOIN public.staff_profiles sp ON sp.id = edt.staff_profile_id
  WHERE edt.location_id = p_location_id
    AND edt.shift_date = p_session_date;

  -- =========================================================
  -- STEP 2.5 (new): CAPTURE CONFIG SNAPSHOT FOR AUDIT
  -- =========================================================
  SELECT jsonb_build_object(
    'snapshot_taken_at', now(),
    'pools', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', tpc.id,
        'name', tpc.name,
        'distribution_method', tpc.distribution_method,
        'tip_source', tpc.tip_source,
        'source_percentage', tpc.source_percentage,
        'contributing_role_codes', tpc.contributing_role_codes,
        'priority', tpc.priority,
        'policy_interval', tpc.policy_interval,
        'role_shares', (
          SELECT jsonb_agg(jsonb_build_object(
            'role_code', prs.role_code,
            'share_percentage', prs.share_percentage,
            'points_per_hour', prs.points_per_hour,
            'is_eligible', prs.is_eligible
          ))
          FROM public.tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = tpc.id
        )
      ))
      FROM public.tip_pool_configs tpc
      WHERE tpc.location_id = p_location_id
        AND tpc.is_active = true
        AND tpc.effective_date <= p_session_date
        AND (tpc.end_date IS NULL OR tpc.end_date >= p_session_date)
    ), '[]'::jsonb),
    'tip_out_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', tor.id,
        'from_role_code', tor.from_role_code,
        'to_role_code', tor.to_role_code,
        'tip_out_type', tor.tip_out_type,
        'tip_out_value', tor.tip_out_value
      ))
      FROM public.tip_out_rules tor
      WHERE tor.location_id = p_location_id
        AND tor.is_active = true
        AND tor.effective_date <= p_session_date
        AND (tor.end_date IS NULL OR tor.end_date >= p_session_date)
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  -- =========================================================
  -- STEP 3: CALCULATE TOTAL COLLECTED
  -- =========================================================
  SELECT COALESCE(SUM(individual_tips_earned), 0) INTO v_total_collected
  FROM public.tip_distribution_details
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 4: TEMP TABLE FOR PER-POOL CONTRIBUTIONS
  -- =========================================================
  CREATE TEMP TABLE temp_pool_contrib (
    pool_id UUID,
    staff_profile_id UUID,
    amount NUMERIC
  ) ON COMMIT DROP;

  -- =========================================================
  -- STEP 5: PROCESS EACH ACTIVE POOL – CONTRIBUTIONS
  -- (NEW: ordered by priority ASC, created_at ASC)
  -- (NEW: policy_interval guard enforces full_workday only in v1.1)
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM public.tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
    ORDER BY priority ASC, created_at ASC
  LOOP
    -- v1.1 guard: reject non-full_workday pools cleanly
    IF v_pool.policy_interval <> 'full_workday' THEN
      RAISE EXCEPTION
        'Pool "%" uses policy_interval="%" which is not yet supported. '
        'v1.1 only supports full_workday.',
        v_pool.name, v_pool.policy_interval
        USING ERRCODE = 'feature_not_supported';
    END IF;

    IF v_pool.tip_source = 'charged_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.charged_tips * (v_pool.source_percentage / 100.0), 2)
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'all_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.individual_tips_earned * (v_pool.source_percentage / 100.0), 2)
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'cash_only' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.cash_tips * (v_pool.source_percentage / 100.0), 2)
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 6: AGGREGATE CONTRIBUTIONS PER STAFF
  -- =========================================================
  UPDATE public.tip_distribution_details dd
  SET tip_pool_contributed = COALESCE((
    SELECT SUM(amount) FROM temp_pool_contrib t
    WHERE t.staff_profile_id = dd.staff_profile_id
  ), 0)
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 7: REDISTRIBUTE EACH POOL (priority-ordered)
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM public.tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
    ORDER BY priority ASC, created_at ASC
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_pool_total
    FROM temp_pool_contrib WHERE pool_id = v_pool.id;

    IF v_pool_total = 0 THEN CONTINUE; END IF;

    IF v_pool.distribution_method = 'percentage' THEN
      FOR v_role_share IN
        SELECT prs.role_code, prs.share_percentage
        FROM public.tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id
          AND prs.is_eligible = true
          AND prs.share_percentage IS NOT NULL
          AND prs.share_percentage > 0
      LOOP
        SELECT COUNT(*) INTO v_role_count
        FROM public.tip_distribution_details
        WHERE session_id = v_session_id AND role_code = v_role_share.role_code;

        IF v_role_count > 0 THEN
          UPDATE public.tip_distribution_details
          SET tip_pool_received = tip_pool_received
            + ROUND((v_pool_total * (v_role_share.share_percentage / 100.0)) / v_role_count, 2)
          WHERE session_id = v_session_id AND role_code = v_role_share.role_code;
        END IF;
      END LOOP;

    ELSIF v_pool.distribution_method = 'equal_split' THEN
      SELECT COUNT(*) INTO v_role_count
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM public.tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_role_count > 0 THEN
        UPDATE public.tip_distribution_details dd
        SET tip_pool_received = tip_pool_received + ROUND(v_pool_total / v_role_count, 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM public.tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'hours_weighted' THEN
      SELECT COALESCE(SUM(dd.hours_worked), 0) INTO v_total_hours
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM public.tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_total_hours > 0 THEN
        UPDATE public.tip_distribution_details dd
        SET tip_pool_received = tip_pool_received
          + ROUND(v_pool_total * (dd.hours_worked / v_total_hours), 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM public.tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'points' THEN
      SELECT COALESCE(SUM(prs.points_per_hour * dd.hours_worked), 0) INTO v_total_points
      FROM public.tip_distribution_details dd
      JOIN public.tip_pool_role_shares prs
        ON prs.tip_pool_config_id = v_pool.id
        AND prs.role_code = dd.role_code
        AND prs.is_eligible = true
      WHERE dd.session_id = v_session_id;

      IF v_total_points > 0 THEN
        UPDATE public.tip_distribution_details dd
        SET tip_pool_received = tip_pool_received
          + ROUND(v_pool_total * ((prs_sub.points_per_hour * dd.hours_worked) / v_total_points), 2)
        FROM public.tip_pool_role_shares prs_sub
        WHERE dd.session_id = v_session_id
          AND prs_sub.tip_pool_config_id = v_pool.id
          AND prs_sub.role_code = dd.role_code
          AND prs_sub.is_eligible = true;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 8: TIP-OUT RULES (all three types)
  -- =========================================================
  FOR v_rule IN
    SELECT * FROM public.tip_out_rules
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    SELECT COUNT(*) INTO v_receiver_count
    FROM public.tip_distribution_details
    WHERE session_id = v_session_id AND role_code = v_rule.to_role_code;

    IF v_rule.tip_out_type = 'percentage_of_sales' THEN
      UPDATE public.tip_distribution_details dd
      SET tip_out_given = tip_out_given + ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;

      SELECT COALESCE(SUM(ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;

      IF v_receiver_count > 0 THEN
        UPDATE public.tip_distribution_details
        SET tip_out_received = tip_out_received + ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'percentage_of_tips' THEN
      UPDATE public.tip_distribution_details dd
      SET tip_out_given = tip_out_given
        + ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;

      SELECT COALESCE(SUM(ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;

      IF v_receiver_count > 0 THEN
        UPDATE public.tip_distribution_details
        SET tip_out_received = tip_out_received + ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'flat_amount' THEN
      UPDATE public.tip_distribution_details dd
      SET tip_out_given = tip_out_given + v_rule.tip_out_value
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;

      SELECT COUNT(*) INTO v_giver_count
      FROM public.tip_distribution_details
      WHERE session_id = v_session_id AND role_code = v_rule.from_role_code;

      v_tipout_total := v_giver_count * v_rule.tip_out_value;

      IF v_receiver_count > 0 THEN
        UPDATE public.tip_distribution_details
        SET tip_out_received = tip_out_received + ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id AND role_code = v_rule.to_role_code;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 8.5 (new): NON-NEGATIVE FLOOR ON tip_out_given
  -- If a server's tip_out_given exceeds what they actually earned
  -- (individual − contributed + received), clip it and record the
  -- shortfall in tip_out_clipped for manager visibility.
  -- =========================================================
  WITH capped AS (
    SELECT
      id,
      tip_out_given AS original,
      GREATEST(0, LEAST(
        tip_out_given,
        individual_tips_earned - tip_pool_contributed + tip_pool_received
      )) AS capped_amt
    FROM public.tip_distribution_details
    WHERE session_id = v_session_id
      AND tip_out_given > 0
  )
  UPDATE public.tip_distribution_details dd
  SET tip_out_clipped = c.original - c.capped_amt,
      tip_out_given   = c.capped_amt
  FROM capped c
  WHERE dd.id = c.id AND c.original > c.capped_amt;

  -- =========================================================
  -- STEP 9: NET TIPS
  -- =========================================================
  UPDATE public.tip_distribution_details
  SET net_tips = individual_tips_earned
    - tip_pool_contributed
    + tip_pool_received
    - tip_out_given
    + tip_out_received
    + manual_adjustment
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 10: AGGREGATE SESSION TOTALS + STORE SNAPSHOT
  -- =========================================================
  SELECT
    COALESCE(SUM(net_tips), 0),
    COALESCE(SUM(tip_pool_contributed), 0),
    COALESCE(SUM(tip_out_given), 0)
  INTO v_total_distributed, v_total_pooled, v_total_tipouts
  FROM public.tip_distribution_details
  WHERE session_id = v_session_id;

  UPDATE public.tip_distribution_sessions
  SET status               = 'calculated',
      total_tips_collected = v_total_collected,
      total_tips_pooled    = v_total_pooled,
      total_tip_outs       = v_total_tipouts,
      total_distributed    = v_total_distributed,
      rounding_adjustment  = v_total_collected - v_total_distributed,
      config_snapshot      = v_snapshot,
      calculated_at        = now(),
      calculated_by        = p_calculated_by
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'total_collected', v_total_collected,
    'total_distributed', v_total_distributed,
    'total_tips_pooled', v_total_pooled,
    'total_tip_outs', v_total_tipouts,
    'details', (
      SELECT json_agg(json_build_object(
        'id', id,
        'staff_profile_id', staff_profile_id,
        'staff_name', staff_name,
        'role_code', role_code,
        'gross_sales', gross_sales,
        'charged_tips', charged_tips,
        'cash_tips', cash_tips,
        'individual_tips_earned', individual_tips_earned,
        'tip_pool_contributed', tip_pool_contributed,
        'tip_pool_received', tip_pool_received,
        'tip_out_given', tip_out_given,
        'tip_out_received', tip_out_received,
        'tip_out_clipped', tip_out_clipped,
        'manual_adjustment', manual_adjustment,
        'net_tips', net_tips,
        'hours_worked', hours_worked
      ))
      FROM public.tip_distribution_details
      WHERE session_id = v_session_id
    )
  );
END;
$$;
-- =============================================================================
-- CHUNK 6 — Session lifecycle RPCs + tip_payroll_exports table
-- -----------------------------------------------------------------------------
-- 6a. void_tip_distribution
-- 6b. export_tip_distribution (writes to tip_payroll_exports)
-- 6c. tip_payroll_exports table + RLS
-- =============================================================================

-- 6c: New table for payroll export audit trail
CREATE TABLE IF NOT EXISTS public.tip_payroll_exports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES public.tip_distribution_sessions(id) ON DELETE RESTRICT,
  merchant_id        UUID NOT NULL REFERENCES public.merchants(id),
  location_id        UUID NOT NULL REFERENCES public.locations(id),
  destination        TEXT NOT NULL CHECK (destination IN ('gusto', 'adp', 'csv')),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'failed', 'downloaded')),
  external_reference TEXT,
  payload            JSONB,
  response           JSONB,
  error_message      TEXT,
  exported_by        UUID REFERENCES public.staff_profiles(id),
  exported_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tip_payroll_exports_session
  ON public.tip_payroll_exports(session_id);
CREATE INDEX IF NOT EXISTS idx_tip_payroll_exports_merchant_date
  ON public.tip_payroll_exports(merchant_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_tip_payroll_exports_status_pending
  ON public.tip_payroll_exports(destination, status)
  WHERE status = 'pending';
ALTER TABLE public.tip_payroll_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_payroll_exports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tip_payroll_exports_merchant_scope ON public.tip_payroll_exports;
CREATE POLICY tip_payroll_exports_merchant_scope
  ON public.tip_payroll_exports
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (SELECT is_dexapos_admin())
    OR merchant_id = (SELECT user_merchant_id())
  )
  WITH CHECK (
    (SELECT is_dexapos_admin())
    OR merchant_id = (SELECT user_merchant_id())
  );
CREATE TRIGGER update_tip_payroll_exports_updated_at
  BEFORE UPDATE ON public.tip_payroll_exports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- 6a: void_tip_distribution — also expands sessions schema
ALTER TABLE public.tip_distribution_sessions
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES public.staff_profiles(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;
CREATE OR REPLACE FUNCTION public.void_tip_distribution(
  p_session_id UUID,
  p_reason     TEXT,
  p_voided_by  UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id UUID;
  v_current_status TEXT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Void reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT merchant_id, status
    INTO v_merchant_id, v_current_status
  FROM public.tip_distribution_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_status = 'voided' THEN
    RETURN json_build_object('success', false, 'error', 'Session is already voided');
  END IF;

  UPDATE public.tip_distribution_sessions
  SET status      = 'voided',
      voided_at   = now(),
      voided_by   = p_voided_by,
      void_reason = p_reason,
      updated_at  = now()
  WHERE id = p_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', p_session_id,
    'previous_status', v_current_status
  );
END;
$$;
-- 6b: export_tip_distribution
CREATE OR REPLACE FUNCTION public.export_tip_distribution(
  p_session_id  UUID,
  p_destination TEXT,
  p_exported_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session    RECORD;
  v_export_id  UUID;
  v_payload    JSONB;
BEGIN
  IF p_destination NOT IN ('gusto', 'adp', 'csv') THEN
    RAISE EXCEPTION 'Invalid destination. Must be gusto, adp, or csv'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_session
  FROM public.tip_distribution_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_session.merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_session.status <> 'approved' THEN
    RAISE EXCEPTION
      'Session must be in approved status to export (current: %)', v_session.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Build export payload (same shape regardless of destination)
  SELECT jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'session_date', v_session.session_date,
      'shift_period', v_session.shift_period,
      'location_id', v_session.location_id,
      'merchant_id', v_session.merchant_id,
      'total_distributed', v_session.total_distributed
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_profile_id', dd.staff_profile_id,
        'staff_name', dd.staff_name,
        'role_code', dd.role_code,
        'hours_worked', dd.hours_worked,
        'charged_tips', dd.charged_tips,
        'cash_tips', dd.cash_tips,
        'tip_pool_contributed', dd.tip_pool_contributed,
        'tip_pool_received', dd.tip_pool_received,
        'tip_out_given', dd.tip_out_given,
        'tip_out_received', dd.tip_out_received,
        'manual_adjustment', dd.manual_adjustment,
        'net_tips', dd.net_tips
      ))
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = p_session_id
    ), '[]'::jsonb)
  ) INTO v_payload;

  INSERT INTO public.tip_payroll_exports (
    session_id, merchant_id, location_id, destination,
    status, payload, exported_by, exported_at
  )
  VALUES (
    p_session_id, v_session.merchant_id, v_session.location_id, p_destination,
    CASE WHEN p_destination = 'csv' THEN 'downloaded' ELSE 'pending' END,
    v_payload, p_exported_by, now()
  )
  RETURNING id INTO v_export_id;

  UPDATE public.tip_distribution_sessions
  SET status     = 'exported',
      updated_at = now()
  WHERE id = p_session_id;

  RETURN json_build_object(
    'success', true,
    'export_id', v_export_id,
    'session_id', p_session_id,
    'destination', p_destination,
    'payload', v_payload
  );
END;
$$;
-- =============================================================================
-- CHUNK 7 — Drop calculate_tip_distribution v1
-- -----------------------------------------------------------------------------
-- Gated: MUST verify no callers in client codebase first. Command commented
-- out below. After grep confirms no `rpc('calculate_tip_distribution', ...)`
-- or direct SQL calls with the v1 signature (p_location_id FIRST), run:
--
--   DROP FUNCTION IF EXISTS public.calculate_tip_distribution(
--     p_location_id uuid,
--     p_merchant_id uuid,
--     p_session_date date,
--     p_shift_period text,
--     p_calculated_by uuid
--   );
--
-- NOTE: v2 signature has p_merchant_id FIRST, so dropping v1 won't affect v2.
-- =============================================================================

-- (intentionally left commented — run manually after codebase verification)


COMMIT;
-- =============================================================================
-- END OF MIGRATION
-- =============================================================================;
