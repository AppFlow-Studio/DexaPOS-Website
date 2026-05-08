-- =============================================================================
-- Migration: Multi-Session Per Day Support
-- Date: 2026-04-20
-- =============================================================================
-- Enables multiple tip distribution sessions per day at a single location.
-- After closing out Session A (lunch), the Today tab resets. Session B (dinner)
-- only includes orders/shifts created after Session A's cutoff.
--
-- Changes:
--   1. Add data_start_after, data_cutoff_at, sequence_number columns
--   2. Replace unique constraint to allow multiple sessions per date
--   3. Add business_day_end_hour to locations (overnight shift support)
--   4. Rewrite calculate_tip_distribution_v2 to read from source tables
--      (orders + order_payments + staff_shifts) with time windows instead of
--      the daily rollup table employee_daily_tips
--   5. Update rebuild_employee_daily_tips + declare_cash_tips_for_shift
--      to use business day boundaries
-- =============================================================================

BEGIN;
-- =============================================================================
-- 1. Schema changes
-- =============================================================================

ALTER TABLE public.tip_distribution_sessions
  ADD COLUMN IF NOT EXISTS data_start_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_cutoff_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sequence_number  INTEGER NOT NULL DEFAULT 1;
COMMENT ON COLUMN public.tip_distribution_sessions.data_start_after IS
  'Only include orders/shifts created after this timestamp. '
  'NULL means start of business day (first session of the day).';
COMMENT ON COLUMN public.tip_distribution_sessions.data_cutoff_at IS
  'Timestamp when this session captured its data. '
  'The next session uses this as its data_start_after.';
COMMENT ON COLUMN public.tip_distribution_sessions.sequence_number IS
  'Sequence within the same date+shift_period. '
  '1 = first session, 2 = second, etc.';
-- 2. Replace unique constraint
ALTER TABLE public.tip_distribution_sessions
  DROP CONSTRAINT IF EXISTS "tip_distribution_sessions_location_id_session_date_shift_pe_key";
ALTER TABLE public.tip_distribution_sessions
  ADD CONSTRAINT tip_distribution_sessions_loc_date_shift_seq_key
  UNIQUE (location_id, session_date, shift_period, sequence_number);
-- 3. Business day end hour on locations (overnight shift support)
-- 0 = midnight (default, current behavior). 4 = 4 AM (bars/late-night restaurants).
-- "Monday" with end_hour=4 runs from Mon 4:00 AM → Tue 4:00 AM.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS business_day_end_hour INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'locations_business_day_end_hour_check'
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT locations_business_day_end_hour_check
      CHECK (business_day_end_hour >= 0 AND business_day_end_hour <= 23);
  END IF;
END $$;
-- =============================================================================
-- 4. Rewrite calculate_tip_distribution_v2
--    Key changes vs v1.1:
--      - STEP 1: Session sequence detection + time window computation
--      - STEP 2: Reads from source tables (orders/shifts) with time window
--                instead of employee_daily_tips
--      - STEP 10: Sets data_cutoff_at on the session
--      - Steps 2.5–9 are UNCHANGED (pools, tip-outs, net calc)
-- =============================================================================

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
  v_timezone          TEXT;
  v_end_hour          INTEGER;
  v_prev_cutoff       TIMESTAMPTZ;
  v_prev_seq          INTEGER;
  v_data_start        TIMESTAMPTZ;
  v_sequence          INTEGER;
  v_day_start         TIMESTAMPTZ;
  v_window_start      TIMESTAMPTZ;
  v_window_end        TIMESTAMPTZ;
BEGIN
  -- Authorization
  IF NOT (is_dexapos_admin() OR p_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Advisory lock to prevent concurrent runs for same location/date
  PERFORM pg_advisory_xact_lock(
    hashtext(p_location_id::text || p_session_date::text)
  );

  -- Resolve timezone + business day end hour
  SELECT COALESCE(timezone, 'UTC'), COALESCE(business_day_end_hour, 0)
  INTO v_timezone, v_end_hour
  FROM public.locations WHERE id = p_location_id;

  -- =========================================================
  -- STEP 1: DETERMINE SESSION SEQUENCE + TIME WINDOW
  -- =========================================================

  -- Find latest approved session for this location+date
  SELECT data_cutoff_at, sequence_number
  INTO v_prev_cutoff, v_prev_seq
  FROM public.tip_distribution_sessions
  WHERE location_id = p_location_id
    AND session_date = p_session_date
    AND status = 'approved'
  ORDER BY sequence_number DESC
  LIMIT 1;

  v_data_start := v_prev_cutoff;  -- NULL if first session of the day
  v_sequence   := COALESCE(v_prev_seq, 0) + 1;

  -- Check if a session with this sequence already exists (recalculation case)
  SELECT id INTO v_session_id
  FROM public.tip_distribution_sessions
  WHERE location_id = p_location_id
    AND session_date = p_session_date
    AND shift_period = p_shift_period
    AND sequence_number = v_sequence;

  IF v_session_id IS NOT NULL THEN
    -- Existing session — check if locked
    PERFORM 1 FROM public.tip_distribution_sessions
    WHERE id = v_session_id AND status IN ('voided', 'approved');
    IF FOUND THEN
      RAISE EXCEPTION
        'Session is in a locked state (voided/approved). '
        'Void and recreate to recalculate.'
        USING ERRCODE = 'feature_not_supported';
    END IF;

    -- Reset for recalculation
    UPDATE public.tip_distribution_sessions
    SET status = 'draft', updated_at = now(),
        data_start_after = v_data_start
    WHERE id = v_session_id;
  ELSE
    -- New session
    INSERT INTO public.tip_distribution_sessions (
      merchant_id, location_id, session_date, shift_period,
      sequence_number, data_start_after
    )
    VALUES (
      p_merchant_id, p_location_id, p_session_date, p_shift_period,
      v_sequence, v_data_start
    )
    RETURNING id INTO v_session_id;
  END IF;

  DELETE FROM public.tip_distribution_details WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 1.5: REFRESH DAILY TIP ROLLUPS (for reporting only)
  -- =========================================================
  PERFORM public.rebuild_employee_daily_tips(p_location_id, p_session_date);

  -- =========================================================
  -- STEP 2: POPULATE FROM SOURCE TABLES (TIME-WINDOWED)
  -- Instead of reading from employee_daily_tips (whole-day rollup),
  -- read directly from orders/payments/shifts with time boundaries.
  -- =========================================================
  -- Business day start = session_date + end_hour offset
  -- e.g. end_hour=4: "Monday" starts at Mon 4:00 AM local time
  v_day_start    := ((p_session_date::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);
  v_window_start := COALESCE(v_data_start, v_day_start);
  -- Cap window_end to end-of-business-day for retroactive close-outs.
  v_window_end   := CASE
    WHEN p_session_date < CURRENT_DATE
      THEN (((p_session_date + 1)::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone)
    ELSE now()
  END;

  INSERT INTO public.tip_distribution_details (
    session_id, staff_profile_id, staff_name, role_code,
    hours_worked, gross_sales,
    charged_tips, cash_tips, individual_tips_earned
  )
  SELECT
    v_session_id,
    combined.staff_profile_id,
    COALESCE(sp.display_name, sp.first_name || ' ' || sp.last_name, 'Unknown'),
    lm.role_code,
    COALESCE(combined.hours_worked, 0),
    COALESCE(combined.gross_sales, 0),
    COALESCE(combined.charged_tips, 0),
    COALESCE(combined.cash_tips_declared, 0),
    COALESCE(combined.charged_tips, 0) + COALESCE(combined.cash_tips_declared, 0)
  FROM (
    WITH server_activity AS (
      SELECT
        COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_profile_id,
        o.id AS order_id,
        o.subtotal
      FROM public.orders o
      WHERE o.location_id = p_location_id
        AND o.created_at >= v_window_start
        AND o.created_at < v_window_end
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
        AND ss.clock_in_time >= v_window_start
        AND ss.clock_in_time < v_window_end
      GROUP BY ss.staff_profile_id
    )
    SELECT
      COALESCE(sc.staff_profile_id, st.staff_profile_id) AS staff_profile_id,
      COALESCE(sc.charged_tips, 0.00)       AS charged_tips,
      COALESCE(sc.gross_sales, 0.00)        AS gross_sales,
      COALESCE(st.hours_worked, 0.00)       AS hours_worked,
      COALESCE(st.cash_tips_declared, 0.00) AS cash_tips_declared
    FROM server_charged sc
    FULL OUTER JOIN shift_totals st USING (staff_profile_id)
  ) combined
  JOIN public.location_members lm
    ON lm.staff_profile_id = combined.staff_profile_id
    AND lm.location_id = p_location_id
  JOIN public.staff_profiles sp ON sp.id = combined.staff_profile_id
  WHERE combined.staff_profile_id IS NOT NULL;

  -- =========================================================
  -- STEP 2.5: CAPTURE CONFIG SNAPSHOT FOR AUDIT
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
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM public.tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
    ORDER BY priority ASC, created_at ASC
  LOOP
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
  -- STEP 8.5: NON-NEGATIVE FLOOR ON tip_out_given
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
  -- STEP 10: AGGREGATE TOTALS + SET CUTOFF
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
      calculated_by        = p_calculated_by,
      data_cutoff_at       = v_window_end
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'sequence_number', v_sequence,
    'total_collected', v_total_collected,
    'total_distributed', v_total_distributed,
    'total_tips_pooled', v_total_pooled,
    'total_tip_outs', v_total_tipouts,
    'data_start_after', v_data_start,
    'data_cutoff_at', v_window_end,
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
-- 5. Update rebuild_employee_daily_tips to use business day boundaries
-- =============================================================================

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
  v_merchant_id     UUID;
  v_timezone        TEXT;
  v_end_hour        INTEGER;
  v_day_start       TIMESTAMPTZ;
  v_day_end         TIMESTAMPTZ;
  v_rows            INTEGER := 0;
BEGIN
  SELECT merchant_id, COALESCE(timezone, 'UTC'), COALESCE(business_day_end_hour, 0)
    INTO v_merchant_id, v_timezone, v_end_hour
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

  -- Business day boundaries: e.g. end_hour=4 → Mon 4 AM to Tue 4 AM
  v_day_start := ((p_shift_date::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);
  v_day_end   := (((p_shift_date + 1)::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);

  WITH server_activity AS (
    SELECT
      COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_profile_id,
      o.id AS order_id,
      o.subtotal
    FROM public.orders o
    WHERE o.location_id = p_location_id
      AND o.created_at >= v_day_start
      AND o.created_at < v_day_end
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
      AND ss.clock_in_time >= v_day_start
      AND ss.clock_in_time < v_day_end
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
    WHERE public.employee_daily_tips.is_verified = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
-- =============================================================================
-- 6. Update declare_cash_tips_for_shift to compute business day date
-- =============================================================================

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
  v_tz          TEXT;
  v_end_hour    INTEGER;
  v_shift_date  DATE;
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

  IF NOT (is_dexapos_admin() OR v_shift.merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sp.id INTO v_caller_sp
  FROM public.staff_profiles sp
  WHERE sp.user_id = (auth.jwt() ->> 'sub');

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

  -- Determine business day date using end_hour
  -- e.g. 2 AM Tue with end_hour=4 → subtract 4h → Mon 10 PM → date = Monday
  SELECT COALESCE(timezone, 'UTC'), COALESCE(business_day_end_hour, 0)
    INTO v_tz, v_end_hour
  FROM public.locations WHERE id = v_shift.location_id;

  v_shift_date := ((v_shift.clock_in_time AT TIME ZONE v_tz) - (v_end_hour || ' hours')::interval)::date;

  PERFORM public.rebuild_employee_daily_tips(v_shift.location_id, v_shift_date);

  RETURN json_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'declared_amount', p_amount
  );
END;
$$;
COMMIT;
