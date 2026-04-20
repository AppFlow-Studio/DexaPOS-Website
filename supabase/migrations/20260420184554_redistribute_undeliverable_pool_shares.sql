
-- Fix: When a pool role has no staff present, redistribute their share
-- proportionally among the eligible roles that DO have staff.
-- Applies to all distribution methods.

CREATE OR REPLACE FUNCTION public.calculate_tip_distribution_v2(p_merchant_id uuid, p_location_id uuid, p_session_date date, p_shift_period text DEFAULT 'full_day'::text, p_calculated_by uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_day_end           TIMESTAMPTZ;
  v_window_start      TIMESTAMPTZ;
  v_window_end        TIMESTAMPTZ;
  v_eligible_pct      NUMERIC;
BEGIN
  IF NOT (is_dexapos_admin() OR p_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_location_id::text || p_session_date::text));

  SELECT COALESCE(timezone, 'UTC'), COALESCE(business_day_end_hour, 0)
  INTO v_timezone, v_end_hour
  FROM public.locations WHERE id = p_location_id;

  SELECT data_cutoff_at, sequence_number
  INTO v_prev_cutoff, v_prev_seq
  FROM public.tip_distribution_sessions
  WHERE location_id = p_location_id AND session_date = p_session_date AND status = 'approved'
  ORDER BY sequence_number DESC LIMIT 1;

  v_data_start := v_prev_cutoff;
  v_sequence   := COALESCE(v_prev_seq, 0) + 1;

  SELECT id INTO v_session_id
  FROM public.tip_distribution_sessions
  WHERE location_id = p_location_id AND session_date = p_session_date
    AND shift_period = p_shift_period AND sequence_number = v_sequence;

  IF v_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.tip_distribution_sessions
    WHERE id = v_session_id AND status IN ('voided', 'approved');
    IF FOUND THEN
      RAISE EXCEPTION 'Session is in a locked state (voided/approved). Void and recreate to recalculate.'
        USING ERRCODE = 'feature_not_supported';
    END IF;
    UPDATE public.tip_distribution_sessions
    SET status = 'draft', updated_at = now(), data_start_after = v_data_start
    WHERE id = v_session_id;
  ELSE
    INSERT INTO public.tip_distribution_sessions (
      merchant_id, location_id, session_date, shift_period, sequence_number, data_start_after
    ) VALUES (
      p_merchant_id, p_location_id, p_session_date, p_shift_period, v_sequence, v_data_start
    ) RETURNING id INTO v_session_id;
  END IF;

  DELETE FROM public.tip_distribution_details WHERE session_id = v_session_id;
  PERFORM public.rebuild_employee_daily_tips(p_location_id, p_session_date);

  v_day_start    := ((p_session_date::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);
  v_day_end      := (((p_session_date + 1)::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);
  v_window_start := COALESCE(v_data_start, v_day_start);
  v_window_end   := CASE WHEN p_session_date < CURRENT_DATE THEN v_day_end ELSE now() END;

  INSERT INTO public.tip_distribution_details (
    session_id, staff_profile_id, staff_name, role_code,
    hours_worked, gross_sales,
    charged_tips, cash_tips, individual_tips_earned
  )
  SELECT
    v_session_id, combined.staff_profile_id,
    COALESCE(sp.display_name, sp.first_name || ' ' || sp.last_name, 'Unknown'),
    lm.role_code,
    COALESCE(combined.hours_worked, 0), COALESCE(combined.gross_sales, 0),
    COALESCE(combined.card_tips, 0),
    COALESCE(combined.cash_payment_tips, 0) + COALESCE(combined.cash_tips_declared, 0),
    COALESCE(combined.card_tips, 0) + COALESCE(combined.cash_payment_tips, 0) + COALESCE(combined.cash_tips_declared, 0)
  FROM (
    WITH server_activity AS (
      SELECT COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_profile_id,
             o.id AS order_id, o.subtotal
      FROM public.orders o
      WHERE o.location_id = p_location_id
        AND o.created_at >= v_window_start AND o.created_at < v_window_end
        AND o.status NOT IN ('cancelled', 'void', 'refunded')
        AND COALESCE(o.assigned_server_id, o.created_by_staff_id) IS NOT NULL
    ),
    server_tips AS (
      SELECT sa.staff_profile_id,
        COALESCE(SUM(CASE WHEN op.payment_method != 'cash' THEN op.tip_amount ELSE 0 END), 0)::NUMERIC(12,2) AS card_tips,
        COALESCE(SUM(CASE WHEN op.payment_method = 'cash' THEN op.tip_amount ELSE 0 END), 0)::NUMERIC(12,2) AS cash_payment_tips,
        COALESCE(SUM(sa.subtotal), 0)::NUMERIC(12,2) AS gross_sales
      FROM server_activity sa
      JOIN public.order_payments op ON op.order_id = sa.order_id WHERE op.status = 'captured'
      GROUP BY sa.staff_profile_id
    ),
    shift_totals AS (
      SELECT ss.staff_profile_id,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ss.clock_out_time, now()) - ss.clock_in_time)) / 3600.0), 0)::NUMERIC(6,2) AS hours_worked,
        COALESCE(SUM(ss.declared_cash_tips), 0)::NUMERIC(12,2) AS cash_tips_declared
      FROM public.staff_shifts ss
      WHERE ss.location_id = p_location_id
        AND ss.clock_in_time >= v_day_start AND ss.clock_in_time < v_day_end
        AND (ss.clock_in_time >= v_window_start OR ss.clock_out_time IS NULL)
      GROUP BY ss.staff_profile_id
    )
    SELECT COALESCE(st2.staff_profile_id, sh.staff_profile_id) AS staff_profile_id,
      COALESCE(st2.card_tips, 0.00) AS card_tips,
      COALESCE(st2.cash_payment_tips, 0.00) AS cash_payment_tips,
      COALESCE(st2.gross_sales, 0.00) AS gross_sales,
      COALESCE(sh.hours_worked, 0.00) AS hours_worked,
      COALESCE(sh.cash_tips_declared, 0.00) AS cash_tips_declared
    FROM server_tips st2 FULL OUTER JOIN shift_totals sh USING (staff_profile_id)
  ) combined
  JOIN public.location_members lm ON lm.staff_profile_id = combined.staff_profile_id AND lm.location_id = p_location_id
  JOIN public.staff_profiles sp ON sp.id = combined.staff_profile_id
  WHERE combined.staff_profile_id IS NOT NULL;

  -- CONFIG SNAPSHOT
  SELECT jsonb_build_object(
    'snapshot_taken_at', now(),
    'pools', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', tpc.id, 'name', tpc.name, 'distribution_method', tpc.distribution_method,
        'tip_source', tpc.tip_source, 'source_percentage', tpc.source_percentage,
        'contributing_role_codes', tpc.contributing_role_codes,
        'priority', tpc.priority, 'policy_interval', tpc.policy_interval,
        'role_shares', (
          SELECT jsonb_agg(jsonb_build_object(
            'role_code', prs.role_code, 'share_percentage', prs.share_percentage,
            'points_per_hour', prs.points_per_hour, 'is_eligible', prs.is_eligible
          )) FROM public.tip_pool_role_shares prs WHERE prs.tip_pool_config_id = tpc.id
        )
      ))
      FROM public.tip_pool_configs tpc
      WHERE tpc.location_id = p_location_id AND tpc.is_active = true
        AND tpc.effective_date <= p_session_date
        AND (tpc.end_date IS NULL OR tpc.end_date >= p_session_date)
    ), '[]'::jsonb),
    'tip_out_rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', tor.id, 'from_role_code', tor.from_role_code,
        'to_role_code', tor.to_role_code, 'tip_out_type', tor.tip_out_type,
        'tip_out_value', tor.tip_out_value
      ))
      FROM public.tip_out_rules tor
      WHERE tor.location_id = p_location_id AND tor.is_active = true
        AND tor.effective_date <= p_session_date
        AND (tor.end_date IS NULL OR tor.end_date >= p_session_date)
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  SELECT COALESCE(SUM(individual_tips_earned), 0) INTO v_total_collected
  FROM public.tip_distribution_details WHERE session_id = v_session_id;

  CREATE TEMP TABLE temp_pool_contrib (
    pool_id UUID, staff_profile_id UUID, amount NUMERIC
  ) ON COMMIT DROP;

  -- POOL CONTRIBUTIONS
  FOR v_pool IN
    SELECT * FROM public.tip_pool_configs
    WHERE location_id = p_location_id AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
    ORDER BY priority ASC, created_at ASC
  LOOP
    IF v_pool.policy_interval <> 'full_workday' THEN
      RAISE EXCEPTION 'Pool "%" uses policy_interval="%" which is not yet supported.',
        v_pool.name, v_pool.policy_interval USING ERRCODE = 'feature_not_supported';
    END IF;

    IF v_pool.tip_source = 'charged_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.charged_tips * (v_pool.source_percentage / 100.0), 2)
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND dd.role_code = ANY(v_pool.contributing_role_codes);
    ELSIF v_pool.tip_source = 'all_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.individual_tips_earned * (v_pool.source_percentage / 100.0), 2)
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND dd.role_code = ANY(v_pool.contributing_role_codes);
    ELSIF v_pool.tip_source = 'cash_only' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.cash_tips * (v_pool.source_percentage / 100.0), 2)
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND dd.role_code = ANY(v_pool.contributing_role_codes);
    END IF;
  END LOOP;

  -- AGGREGATE CONTRIBUTIONS
  UPDATE public.tip_distribution_details dd
  SET tip_pool_contributed = COALESCE((
    SELECT SUM(amount) FROM temp_pool_contrib t WHERE t.staff_profile_id = dd.staff_profile_id
  ), 0)
  WHERE session_id = v_session_id;

  -- =========================================================
  -- REDISTRIBUTE POOLS (with undeliverable share redistribution)
  -- If a role has no staff present, their share is redistributed
  -- proportionally among the eligible roles that DO have staff.
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM public.tip_pool_configs
    WHERE location_id = p_location_id AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
    ORDER BY priority ASC, created_at ASC
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_pool_total
    FROM temp_pool_contrib WHERE pool_id = v_pool.id;
    IF v_pool_total = 0 THEN CONTINUE; END IF;

    IF v_pool.distribution_method = 'percentage' THEN
      -- Calculate the total percentage of roles that actually have staff present
      SELECT COALESCE(SUM(prs.share_percentage), 0) INTO v_eligible_pct
      FROM public.tip_pool_role_shares prs
      WHERE prs.tip_pool_config_id = v_pool.id AND prs.is_eligible = true
        AND prs.share_percentage IS NOT NULL AND prs.share_percentage > 0
        AND EXISTS (
          SELECT 1 FROM public.tip_distribution_details dd
          WHERE dd.session_id = v_session_id AND dd.role_code = prs.role_code
        );

      IF v_eligible_pct > 0 THEN
        FOR v_role_share IN
          SELECT prs.role_code, prs.share_percentage
          FROM public.tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id AND prs.is_eligible = true
            AND prs.share_percentage IS NOT NULL AND prs.share_percentage > 0
        LOOP
          SELECT COUNT(*) INTO v_role_count
          FROM public.tip_distribution_details
          WHERE session_id = v_session_id AND role_code = v_role_share.role_code;
          IF v_role_count > 0 THEN
            -- Redistribute: this role's share / eligible total * pool total
            UPDATE public.tip_distribution_details
            SET tip_pool_received = tip_pool_received
              + ROUND((v_pool_total * (v_role_share.share_percentage / v_eligible_pct)) / v_role_count, 2)
            WHERE session_id = v_session_id AND role_code = v_role_share.role_code;
          END IF;
        END LOOP;
      END IF;

    ELSIF v_pool.distribution_method = 'equal_split' THEN
      SELECT COUNT(*) INTO v_role_count
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND EXISTS (
        SELECT 1 FROM public.tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id AND prs.role_code = dd.role_code AND prs.is_eligible = true
      );
      IF v_role_count > 0 THEN
        UPDATE public.tip_distribution_details dd
        SET tip_pool_received = tip_pool_received + ROUND(v_pool_total / v_role_count, 2)
        WHERE dd.session_id = v_session_id AND EXISTS (
          SELECT 1 FROM public.tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id AND prs.role_code = dd.role_code AND prs.is_eligible = true
        );
      END IF;

    ELSIF v_pool.distribution_method = 'hours_weighted' THEN
      SELECT COALESCE(SUM(dd.hours_worked), 0) INTO v_total_hours
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND EXISTS (
        SELECT 1 FROM public.tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id AND prs.role_code = dd.role_code AND prs.is_eligible = true
      );
      IF v_total_hours > 0 THEN
        UPDATE public.tip_distribution_details dd
        SET tip_pool_received = tip_pool_received
          + ROUND(v_pool_total * (dd.hours_worked / v_total_hours), 2)
        WHERE dd.session_id = v_session_id AND EXISTS (
          SELECT 1 FROM public.tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id AND prs.role_code = dd.role_code AND prs.is_eligible = true
        );
      END IF;

    ELSIF v_pool.distribution_method = 'points' THEN
      SELECT COALESCE(SUM(prs.points_per_hour * dd.hours_worked), 0) INTO v_total_points
      FROM public.tip_distribution_details dd
      JOIN public.tip_pool_role_shares prs
        ON prs.tip_pool_config_id = v_pool.id AND prs.role_code = dd.role_code AND prs.is_eligible = true
      WHERE dd.session_id = v_session_id;
      IF v_total_points > 0 THEN
        UPDATE public.tip_distribution_details dd
        SET tip_pool_received = tip_pool_received
          + ROUND(v_pool_total * ((prs_sub.points_per_hour * dd.hours_worked) / v_total_points), 2)
        FROM public.tip_pool_role_shares prs_sub
        WHERE dd.session_id = v_session_id
          AND prs_sub.tip_pool_config_id = v_pool.id
          AND prs_sub.role_code = dd.role_code AND prs_sub.is_eligible = true;
      END IF;
    END IF;
  END LOOP;

  -- TIP-OUT RULES
  FOR v_rule IN
    SELECT * FROM public.tip_out_rules
    WHERE location_id = p_location_id AND is_active = true
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
      INTO v_tipout_total FROM public.tip_distribution_details dd
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;
      IF v_receiver_count > 0 THEN
        UPDATE public.tip_distribution_details
        SET tip_out_received = tip_out_received + ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id AND role_code = v_rule.to_role_code;
      END IF;
    ELSIF v_rule.tip_out_type = 'percentage_of_tips' THEN
      UPDATE public.tip_distribution_details dd
      SET tip_out_given = tip_out_given + ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id AND dd.role_code = v_rule.from_role_code;
      SELECT COALESCE(SUM(ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total FROM public.tip_distribution_details dd
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
      SELECT COUNT(*) INTO v_giver_count FROM public.tip_distribution_details
      WHERE session_id = v_session_id AND role_code = v_rule.from_role_code;
      v_tipout_total := v_giver_count * v_rule.tip_out_value;
      IF v_receiver_count > 0 THEN
        UPDATE public.tip_distribution_details
        SET tip_out_received = tip_out_received + ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id AND role_code = v_rule.to_role_code;
      END IF;
    END IF;
  END LOOP;

  -- NON-NEGATIVE FLOOR
  WITH capped AS (
    SELECT id, tip_out_given AS original,
      GREATEST(0, LEAST(tip_out_given, individual_tips_earned - tip_pool_contributed + tip_pool_received)) AS capped_amt
    FROM public.tip_distribution_details
    WHERE session_id = v_session_id AND tip_out_given > 0
  )
  UPDATE public.tip_distribution_details dd
  SET tip_out_clipped = c.original - c.capped_amt, tip_out_given = c.capped_amt
  FROM capped c WHERE dd.id = c.id AND c.original > c.capped_amt;

  -- NET TIPS
  UPDATE public.tip_distribution_details
  SET net_tips = individual_tips_earned - tip_pool_contributed + tip_pool_received
    - tip_out_given + tip_out_received + manual_adjustment
  WHERE session_id = v_session_id;

  -- TOTALS + CUTOFF
  SELECT COALESCE(SUM(net_tips), 0), COALESCE(SUM(tip_pool_contributed), 0), COALESCE(SUM(tip_out_given), 0)
  INTO v_total_distributed, v_total_pooled, v_total_tipouts
  FROM public.tip_distribution_details WHERE session_id = v_session_id;

  UPDATE public.tip_distribution_sessions
  SET status = 'calculated',
      total_tips_collected = v_total_collected, total_tips_pooled = v_total_pooled,
      total_tip_outs = v_total_tipouts, total_distributed = v_total_distributed,
      rounding_adjustment = v_total_collected - v_total_distributed,
      config_snapshot = v_snapshot, calculated_at = now(), calculated_by = p_calculated_by,
      data_cutoff_at = v_window_end
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true, 'session_id', v_session_id, 'sequence_number', v_sequence,
    'total_collected', v_total_collected, 'total_distributed', v_total_distributed,
    'total_tips_pooled', v_total_pooled, 'total_tip_outs', v_total_tipouts,
    'data_start_after', v_data_start, 'data_cutoff_at', v_window_end,
    'details', (
      SELECT json_agg(json_build_object(
        'id', id, 'staff_profile_id', staff_profile_id, 'staff_name', staff_name,
        'role_code', role_code, 'gross_sales', gross_sales,
        'charged_tips', charged_tips, 'cash_tips', cash_tips,
        'individual_tips_earned', individual_tips_earned,
        'tip_pool_contributed', tip_pool_contributed, 'tip_pool_received', tip_pool_received,
        'tip_out_given', tip_out_given, 'tip_out_received', tip_out_received,
        'tip_out_clipped', tip_out_clipped, 'manual_adjustment', manual_adjustment,
        'net_tips', net_tips, 'hours_worked', hours_worked
      ))
      FROM public.tip_distribution_details WHERE session_id = v_session_id
    )
  );
END;
$function$;

