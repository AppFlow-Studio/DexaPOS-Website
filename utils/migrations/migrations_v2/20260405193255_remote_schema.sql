alter table "public"."merchants" alter column "carrier_id" drop not null;

alter table "public"."orderout_restaurants" alter column "connected_channels" set default '{}'::jsonb;

alter table "public"."tip_distribution_details" add column "staff_name" text;

CREATE INDEX idx_discounts_end_date ON public.discounts USING btree (end_date) WHERE (end_date IS NOT NULL);

CREATE INDEX idx_discounts_merchant_location ON public.discounts USING btree (merchant_id, location_id);

CREATE INDEX idx_tip_distribution_details_staff_name ON public.tip_distribution_details USING btree (staff_name);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_tip_distribution_v2(p_merchant_id uuid, p_location_id uuid, p_session_date date, p_shift_period text DEFAULT NULL::text, p_calculated_by uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session_id       UUID;
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
BEGIN

  -- Advisory lock to prevent concurrent runs for same location/date
  PERFORM pg_advisory_xact_lock(
    hashtext(p_location_id::text || p_session_date::text)
  );

  -- =========================================================
  -- STEP 1: CREATE OR RESET SESSION
  -- =========================================================
  INSERT INTO tip_distribution_sessions(
    merchant_id, location_id, session_date, shift_period
  )
  VALUES(p_merchant_id, p_location_id, p_session_date, p_shift_period)
  ON CONFLICT(location_id, session_date, shift_period)
  DO UPDATE SET updated_at = now(), status = 'draft'
  RETURNING id INTO v_session_id;

  DELETE FROM tip_distribution_details WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 2: POPULATE EMPLOYEE DATA FROM DAILY TIPS
  -- =========================================================
  INSERT INTO tip_distribution_details(
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
  FROM employee_daily_tips edt
  JOIN location_members lm
    ON lm.staff_profile_id = edt.staff_profile_id
    AND lm.location_id = edt.location_id
  JOIN staff_profiles sp
    ON sp.id = edt.staff_profile_id
  WHERE edt.location_id = p_location_id
    AND edt.shift_date = p_session_date;

  -- =========================================================
  -- STEP 3: CALCULATE TOTAL COLLECTED
  -- =========================================================
  SELECT COALESCE(SUM(individual_tips_earned), 0)
  INTO v_total_collected
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 4: CREATE TEMP TABLE FOR PER‑POOL CONTRIBUTIONS
  -- =========================================================
  CREATE TEMP TABLE temp_pool_contrib (
    pool_id UUID,
    staff_profile_id UUID,
    amount NUMERIC
  ) ON COMMIT DROP;

  -- =========================================================
  -- STEP 5: PROCESS EACH ACTIVE TIP POOL – CONTRIBUTIONS
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Insert contributions into temp table (per pool)
    IF v_pool.tip_source = 'charged_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.charged_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'all_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.individual_tips_earned * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'cash_only' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.cash_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 6: UPDATE tip_pool_contributed FROM TEMP TABLE
  -- =========================================================
  UPDATE tip_distribution_details dd
  SET tip_pool_contributed = COALESCE((
    SELECT SUM(amount) FROM temp_pool_contrib t
    WHERE t.staff_profile_id = dd.staff_profile_id
  ), 0)
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 7: REDISTRIBUTE EACH POOL (accumulate receipts)
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Get total contributed to this pool from the temp table
    SELECT COALESCE(SUM(amount), 0) INTO v_pool_total
    FROM temp_pool_contrib
    WHERE pool_id = v_pool.id;

    -- Skip if nothing to distribute
    IF v_pool_total = 0 THEN
      CONTINUE;
    END IF;

    -- ----- DISTRIBUTION BY METHOD -----
    IF v_pool.distribution_method = 'percentage' THEN
      -- Percentage split by role, equally among employees of that role
      FOR v_role_share IN
        SELECT prs.role_code, prs.share_percentage
        FROM tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id
          AND prs.is_eligible = true
          AND prs.share_percentage IS NOT NULL
          AND prs.share_percentage > 0
      LOOP
        SELECT COUNT(*) INTO v_role_count
        FROM tip_distribution_details
        WHERE session_id = v_session_id
          AND role_code = v_role_share.role_code;

        IF v_role_count > 0 THEN
          UPDATE tip_distribution_details
          SET tip_pool_received = tip_pool_received +
            ROUND((v_pool_total * (v_role_share.share_percentage / 100.0)) / v_role_count, 2)
          WHERE session_id = v_session_id
            AND role_code = v_role_share.role_code;
        END IF;
      END LOOP;

    ELSIF v_pool.distribution_method = 'equal_split' THEN
      -- Equal split only among employees whose roles are eligible for this pool
      SELECT COUNT(*) INTO v_role_count
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_role_count > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total / v_role_count, 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'hours_weighted' THEN
      -- Hours‑weighted only for eligible roles
      SELECT COALESCE(SUM(dd.hours_worked), 0) INTO v_total_hours
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_total_hours > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * (dd.hours_worked / v_total_hours), 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'points' THEN
      -- Points‑based: role's points_per_hour * employee's hours
      SELECT COALESCE(SUM(prs.points_per_hour * dd.hours_worked), 0) INTO v_total_points
      FROM tip_distribution_details dd
      JOIN tip_pool_role_shares prs
        ON prs.tip_pool_config_id = v_pool.id
        AND prs.role_code = dd.role_code
        AND prs.is_eligible = true
      WHERE dd.session_id = v_session_id;

      IF v_total_points > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * ((prs_sub.points_per_hour * dd.hours_worked) / v_total_points), 2)
        FROM tip_pool_role_shares prs_sub
        WHERE dd.session_id = v_session_id
          AND prs_sub.tip_pool_config_id = v_pool.id
          AND prs_sub.role_code = dd.role_code
          AND prs_sub.is_eligible = true;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 8: TIP‑OUT RULES (all three types)
  -- =========================================================
  FOR v_rule IN
    SELECT * FROM tip_out_rules
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- How many receivers for this rule?
    SELECT COUNT(*) INTO v_receiver_count
    FROM tip_distribution_details
    WHERE session_id = v_session_id
      AND role_code = v_rule.to_role_code;

    IF v_rule.tip_out_type = 'percentage_of_sales' THEN
      -- Deduct from givers
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Total given (for crediting receivers)
      SELECT COALESCE(SUM(ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Credit receivers equally
      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'percentage_of_tips' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COALESCE(SUM(ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'flat_amount' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given + v_rule.tip_out_value
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COUNT(*) INTO v_giver_count
      FROM tip_distribution_details
      WHERE session_id = v_session_id
        AND role_code = v_rule.from_role_code;

      v_tipout_total := v_giver_count * v_rule.tip_out_value;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 9: CALCULATE NET TIPS FOR EACH EMPLOYEE
  -- =========================================================
  UPDATE tip_distribution_details
  SET net_tips =
    individual_tips_earned
    - tip_pool_contributed
    + tip_pool_received
    - tip_out_given
    + tip_out_received
    + manual_adjustment
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 10: AGGREGATE SESSION TOTALS
  -- =========================================================
  SELECT
    COALESCE(SUM(net_tips), 0),
    COALESCE(SUM(tip_pool_contributed), 0),
    COALESCE(SUM(tip_out_given), 0)
  INTO v_total_distributed, v_total_pooled, v_total_tipouts
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  UPDATE tip_distribution_sessions
  SET
    status = 'calculated',
    total_tips_collected = v_total_collected,
    total_tips_pooled = v_total_pooled,
    total_tip_outs = v_total_tipouts,
    total_distributed = v_total_distributed,
    rounding_adjustment = v_total_collected - v_total_distributed,
    calculated_at = now(),
    calculated_by = p_calculated_by
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'total_collected', v_total_collected,
    'total_distributed', v_total_distributed,
    'total_tips_pooled', v_total_pooled,
    'total_tip_outs', v_total_tipouts,
    'details', (
      SELECT json_agg(
        json_build_object(
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
          'manual_adjustment', manual_adjustment,
          'net_tips', net_tips,
          'hours_worked', hours_worked
        )
      )
      FROM tip_distribution_details
      WHERE session_id = v_session_id
    )
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_reservation_for_voided_order(p_order_id uuid, p_reason text DEFAULT 'Order voided'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_status TEXT;
  v_cancelled_count INTEGER := 0;
BEGIN
  SELECT o.status
  INTO v_order_status
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_status <> 'void' THEN
    RETURN json_build_object(
      'success', false,
      'order_id', p_order_id,
      'message', 'Order is not void'
    );
  END IF;

  UPDATE public.reservations r
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(r.cancelled_at, NOW()),
    cancellation_reason = COALESCE(r.cancellation_reason, p_reason)
  WHERE r.seated_session_id IN (
    SELECT ts.id
    FROM public.table_sessions ts
    WHERE ts.order_id = p_order_id
  )
    AND r.status = 'seated';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'cancelled_count', v_cancelled_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_dlq_replay_success(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.webhook_dead_letter_queue
  SET status = 'resolved',
      resolved_at = now(),
      retry_count = retry_count + 1,
      updated_at = now()
  WHERE id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_orderout_connected_channels(p_restaurant_id uuid, p_updates jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.orderout_restaurants
  SET connected_channels = COALESCE(connected_channels, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_restaurant_id;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_orderout_platform_statuses(p_link_id uuid, p_updates jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.orderout_menu_links
  SET platform_statuses = COALESCE(platform_statuses, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_link_id;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_dlq_replay_failure(p_id uuid, p_error_message text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.webhook_dead_letter_queue
  SET error_message = p_error_message,
      status = 'pending',
      retry_count = retry_count + 1,
      updated_at = now()
  WHERE id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.void_order_and_cancel_reservation(p_order_id uuid, p_void_reason text DEFAULT 'Order cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_void_result JSONB;
  v_cancelled_count INTEGER := 0;
  v_session_ids UUID[];
BEGIN
  -- Snapshot linked session IDs before void_order in case underlying logic
  -- clears/relinks table_sessions.order_id during close.
  SELECT COALESCE(array_agg(ts.id), ARRAY[]::UUID[])
  INTO v_session_ids
  FROM public.table_sessions ts
  WHERE ts.order_id = p_order_id;

  -- Reuse existing void logic unchanged.
  v_void_result := COALESCE(
    public.void_order(p_order_id, p_void_reason)::JSONB,
    '{}'::JSONB
  );

  -- Fallback: if nothing was linked pre-void, try post-void linkage.
  IF array_length(v_session_ids, 1) IS NULL THEN
    SELECT COALESCE(array_agg(ts.id), ARRAY[]::UUID[])
    INTO v_session_ids
    FROM public.table_sessions ts
    WHERE ts.order_id = p_order_id;
  END IF;

  -- Cancel seated reservation(s) linked to this order's table session(s).
  UPDATE public.reservations r
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(r.cancelled_at, NOW()),
    cancellation_reason = COALESCE(r.cancellation_reason, p_void_reason)
  WHERE r.seated_session_id = ANY(v_session_ids)
    AND r.status = 'seated';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN (
    v_void_result || jsonb_build_object(
      'reservation_cancelled_count', v_cancelled_count
    )
  )::JSON;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_cancel_reason text DEFAULT 'Customer cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_status TEXT;
  v_result JSON;
BEGIN
  -- Get order status
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- For draft/pending orders, we can cancel with lower permission
  IF v_order_status IN ('draft', 'pending') THEN
    -- Just need regular order manage permission
    -- IF NOT has_permission('location.orders.manage') THEN
    --   RAISE EXCEPTION 'Permission denied';
    -- END IF;

    -- Delete items (hard delete for draft)
    DELETE FROM public.order_item_modifiers oim
    USING public.order_items oi
    WHERE oim.order_item_id = oi.id AND oi.order_id = p_order_id;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    -- Update order to cancelled
    UPDATE public.orders
    SET 
      status = 'cancelled',
      void_reason = p_cancel_reason,
      updated_at = NOW()
    WHERE id = p_order_id;

    -- Close table session if linked
    UPDATE public.table_sessions
    SET 
      is_active = FALSE,
      status = 'available',
      closed_at = NOW()
    WHERE order_id = p_order_id AND is_active = TRUE;

    SELECT json_build_object(
      'success', true,
      'order_id', p_order_id,
      'action', 'cancelled',
      'reason', p_cancel_reason
    ) INTO v_result;

    RETURN v_result;
  ELSE
    -- For confirmed orders, use void_order
    RETURN public.void_order(p_order_id, p_cancel_reason);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_order_items(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_status TEXT;
  v_removed_count INTEGER;
  v_result JSON;
BEGIN
  -- Verify order and status
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot clear items from % orders', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied';
  -- END IF;

  -- Delete all modifiers
  DELETE FROM public.order_item_modifiers oim
  USING public.order_items oi
  WHERE oim.order_item_id = oi.id AND oi.order_id = p_order_id;

  -- Delete all items
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  -- Reset order totals
  UPDATE public.orders
  SET 
    subtotal = 0,
    tax_amount = 0,
    total_amount = 0,
    updated_at = NOW()
  WHERE id = p_order_id;

  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'removed_count', v_removed_count
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(p_location_id uuid, p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text], p_kds_display_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text  || '_f' || COALESCE(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN oi_grouped.all_ready THEN 'ready'
        WHEN oi_grouped.any_sent THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_company', o.metadata->>'delivery_company',
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'item_count', oi_grouped.item_count,
      'prioritized', oi_grouped.any_prioritized,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM orders o
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        bool_and(oi.kitchen_status = 'ready') AS all_ready,
        bool_or(oi.kitchen_status = 'sent' OR oi.kitchen_status IS NULL) AS any_sent,
        SUM(oi.quantity)::int AS item_count,
        oi.fire_time,
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'name', COALESCE(oi.open_item_name, oi.item_name),
            'quantity', oi.quantity,
            'kitchen_status', COALESCE(oi.kitchen_status, 'sent'),
            'special_instructions', oi.special_instructions,
            'category_name', oi.category_name,
            'category_id', oi.category_id,
            'menu_name', oi.menu_name,
            'menu_id', oi.menu_id,
            'prep_station', oi.prep_station,
            'rush', COALESCE(oi.rush, false),
            'is_prioritized', COALESCE(oi.is_prioritized, false),
            'fire_time', oi.fire_time::timestamptz,
            'modifiers', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'modifier_name', oim.modifier_name,
                  'modifier_group_name', oim.modifier_group_name,
                  'price_modifier', oim.price_modifier,
                  'is_no', COALESCE(oim.is_no, false)
                )
              ), '[]'::jsonb)
              FROM order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            )
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM order_items oi
      LEFT JOIN kds_item_status kis
        ON kis.order_item_id = oi.id
        AND kis.kds_display_id = p_kds_display_id
        AND kis.status NOT IN ('cancelled', 'completed')
      WHERE COALESCE(oi.is_voided, false) = false
        AND (oi.kitchen_status = ANY(p_statuses) OR oi.kitchen_status IS NULL)
        AND (p_kds_display_id IS NULL OR kis.id IS NOT NULL)
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
  ) sub;

  RETURN v_result;
END;$function$
;

CREATE OR REPLACE FUNCTION public.remove_order_item(p_order_item_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_item_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Get order info and verify access
  SELECT 
    o.id,
    o.status,
    oi.subtotal
  INTO v_order_id, v_order_status, v_item_subtotal
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or access denied';
  END IF;

  -- Only allow hard delete on draft/pending orders
  -- Once order is confirmed/sent to kitchen, must use void_order_item
  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot remove items from % orders. Use void_order_item() instead.', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied: location.orders.manage required';
  -- END IF;

  -- Delete modifiers first (cascade would handle this, but being explicit)
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  -- Delete the item
  DELETE FROM public.order_items
  WHERE id = p_order_item_id;

  -- Return result
  SELECT json_build_object(
    'success', true,
    'removed_item_id', p_order_item_id,
    'order_id', v_order_id,
    'removed_subtotal', v_item_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_order_items_batch(p_order_item_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_removed_count INTEGER := 0;
  v_item_id UUID;
  v_result JSON;
BEGIN
  -- Verify all items belong to same order and order is draft/pending
  SELECT DISTINCT o.id, o.status
  INTO v_order_id, v_order_status
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = ANY(p_order_item_ids)
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order items not found or access denied';
  END IF;

  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot remove items from % orders', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied';
  -- END IF;

  -- Delete modifiers for all items
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = ANY(p_order_item_ids);

  -- Delete items
  DELETE FROM public.order_items
  WHERE id = ANY(p_order_item_ids)
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  SELECT json_build_object(
    'success', true,
    'order_id', v_order_id,
    'removed_count', v_removed_count,
    'removed_item_ids', p_order_item_ids
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid, p_void_reason text DEFAULT 'Order cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
  v_order RECORD;
  v_voided_items_count INTEGER;
  v_voided_payments_count INTEGER;
  v_refund_amount NUMERIC(10, 2) := 0;
  v_result JSON;
  v_new_sync_version integer;
BEGIN
  -- 1. Get order details
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 2. Business Logic Checks
  -- We allow voiding 'pending', 'preparing', 'ready', 'served'.
  -- We only block if it's already 'void'.
  IF v_order.status = 'void' THEN
    RAISE EXCEPTION 'Order is already voided';
  END IF;

  -- Optional: Prevent voiding 'completed' (historical) orders if you prefer strict accounting
  -- IF v_order.status = 'completed' AND v_order.closed_at < (NOW() - INTERVAL '1 day') THEN
  --   RAISE EXCEPTION 'Cannot void orders closed more than 24 hours ago.';
  -- END IF;

  -- 3. Void all items
  -- This is critical for KDS: The kitchen needs to see 'is_voided' flip to TRUE
  UPDATE public.order_items
  SET 
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_items_count = ROW_COUNT;

  -- 4. Handle Payments (Paid vs Unpaid Logic)
  -- If the order was "Preparing" and "Paid", this calculates the refund due.
  -- If "Preparing" and "Unpaid", this returns 0.
  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
  FROM public.order_payments
  WHERE order_id = p_order_id 
    AND status = 'captured'
    AND is_voided = FALSE;

  -- Void the payment records so they don't count towards daily sales
  UPDATE public.order_payments
  SET 
    is_voided = TRUE,
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    voided_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_payments_count = ROW_COUNT;

  -- 5. Update Order Status
  -- Whether it was 'preparing' or 'pending', it is now 'void'.
  UPDATE public.orders
  SET 
    status = 'void',
    amount_paid = 0,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW(),
    check_status = 'Closed',
    payment_status = 'void'
  WHERE id = p_order_id;

  -- 6. Release the Table
  -- If the order was 'preparing', the table was likely 'seated'. We must free it.
  UPDATE public.table_sessions
  SET 
    is_active = FALSE,
    status = 'available',
    closed_at = NOW(),
    closed_by = user_staff_profile_id()
  WHERE order_id = p_order_id AND is_active = TRUE;

  -- 7. Record History
  INSERT INTO public.order_status_history (
    order_id, 
    from_status, 
    to_status, 
    changed_by_staff_id,
    notes
  ) VALUES (
    p_order_id,
    v_order.status,
    'void',
    user_staff_profile_id(),
    p_void_reason
  );

   v_new_sync_version := increment_order_sync_version(p_order_id);

  -- 8. Return Result
  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_order.status, -- Helps frontend know if it was 'preparing'
    'refund_amount', v_refund_amount,  -- Frontend can prompt "Refund $X to customer?"
    'void_reason', p_void_reason,
    'sync_version', v_new_sync_version
  ) INTO v_result;

  RETURN v_result;
END;$function$
;


