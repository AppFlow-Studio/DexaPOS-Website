-- ═══════════════════════════════════════════════════════════════
-- RPC 1: loyalty_earn_on_order
-- Called when an order is completed. Heart of the loyalty system.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION loyalty_earn_on_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_customer_id UUID;
    v_merchant_id UUID;
    v_location_id UUID;
    v_total NUMERIC;
    v_discount NUMERIC;
    v_status TEXT;
    v_program RECORD;
    v_enrollment RECORD;
    v_points_earned INTEGER;
    v_qualifying_amount NUMERIC;
    v_item RECORD;
    v_punch_earned INTEGER;
    v_reward_id UUID;
    v_result JSONB := '[]'::JSONB;
BEGIN
    -- Fetch order details
    SELECT customer_id, merchant_id, location_id, total_amount, discount_amount, status
    INTO v_customer_id, v_merchant_id, v_location_id, v_total, v_discount, v_status
    FROM orders
    WHERE id = p_order_id;

    -- Debug: return status info if order not found or not completed
    IF v_status IS NULL THEN
        RETURN jsonb_build_object('error', 'Order not found', 'order_id', p_order_id);
    END IF;

    IF v_status != 'completed' THEN
        RETURN jsonb_build_object(
            'error', 'Order not completed',
            'status', v_status,
            'order_id', p_order_id
        );
    END IF;

    IF v_customer_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'Order has no customer',
            'order_id', p_order_id
        );
    END IF;

    -- Loop through active programs
    FOR v_program IN
        SELECT *
        FROM loyalty_programs
        WHERE merchant_id = v_merchant_id
          AND is_active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
          AND (location_ids IS NULL OR v_location_id = ANY(location_ids))
    LOOP
        -- Reset reward tracking per program iteration
        v_reward_id := NULL;
        v_points_earned := 0;
        v_punch_earned := 0;

        -- Get or create enrollment (if auto_enroll)
        SELECT * INTO v_enrollment
        FROM loyalty_enrollments
        WHERE program_id = v_program.id AND customer_id = v_customer_id;

        IF v_enrollment IS NULL THEN
            IF v_program.auto_enroll THEN
                INSERT INTO loyalty_enrollments (
                    program_id, customer_id, merchant_id,
                    current_points, lifetime_points,
                    current_visits, lifetime_visits,
                    current_punches, lifetime_punches,
                    total_rewards_earned, total_rewards_redeemed, total_reward_value
                ) VALUES (
                    v_program.id, v_customer_id, v_merchant_id,
                    0, 0,
                    0, 0,
                    0, 0,
                    0, 0, 0
                )
                RETURNING * INTO v_enrollment;
            ELSE
                CONTINUE; -- skip if not enrolled
            END IF;
        END IF;

        -- Cooldown check
        IF v_program.cooldown_minutes IS NOT NULL AND v_program.cooldown_minutes > 0
           AND v_enrollment.last_earn_at IS NOT NULL THEN
            IF v_enrollment.last_earn_at + (v_program.cooldown_minutes * interval '1 minute') > now() THEN
                CONTINUE;
            END IF;
        END IF;

        -- Min order amount check
        IF v_program.min_order_amount IS NOT NULL AND v_total < v_program.min_order_amount THEN
            CONTINUE;
        END IF;

        -- ─── POINTS ───────────────────────────────────────────
        IF v_program.program_type = 'points' THEN
            -- Calculate qualifying amount (exclude certain categories/items, handle discounts)
            SELECT COALESCE(SUM(
                (oi.unit_price * oi.quantity) -
                CASE WHEN NOT v_program.earn_on_discounted THEN COALESCE(oi.discount_amount, 0) ELSE 0 END
            ), 0)
            INTO v_qualifying_amount
            FROM order_items oi
            WHERE oi.order_id = p_order_id
              AND (v_program.excluded_categories IS NULL OR oi.category_id != ALL(v_program.excluded_categories))
              AND (v_program.excluded_item_ids IS NULL OR oi.menu_item_id != ALL(v_program.excluded_item_ids));

            v_points_earned := FLOOR(v_qualifying_amount * v_program.points_per_dollar);

            IF v_points_earned > 0 THEN
                -- Update enrollment
                UPDATE loyalty_enrollments
                SET
                    current_points = current_points + v_points_earned,
                    lifetime_points = lifetime_points + v_points_earned,
                    last_earn_at = now(),
                    updated_at = now()
                WHERE id = v_enrollment.id
                RETURNING * INTO v_enrollment;

                -- Log transaction
                INSERT INTO loyalty_transactions (
                    enrollment_id, customer_id, program_id, merchant_id,
                    order_id, transaction_type,
                    points_delta, balance_points,
                    description
                ) VALUES (
                    v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                    p_order_id, 'earn_points',
                    v_points_earned, v_enrollment.current_points,
                    'Earned ' || v_points_earned || ' points'
                );

                -- Check threshold → create reward
                IF v_program.points_redemption_threshold IS NOT NULL
                   AND v_enrollment.current_points >= v_program.points_redemption_threshold
                THEN
                    INSERT INTO loyalty_rewards (
                        customer_id, enrollment_id, program_id, merchant_id,
                        reward_description, reward_type, reward_value,
                        reward_max_value, reward_category_id, reward_menu_item_id,
                        expires_at, status
                    ) VALUES (
                        v_customer_id, v_enrollment.id, v_program.id, v_merchant_id,
                        v_program.reward_description, v_program.reward_type, v_program.reward_value,
                        v_program.reward_max_value, v_program.reward_category_id, v_program.reward_menu_item_id,
                        CASE WHEN v_program.reward_expiry_days IS NOT NULL
                             THEN now() + (v_program.reward_expiry_days * interval '1 day')
                             ELSE NULL END,
                        'available'
                    ) RETURNING id INTO v_reward_id;

                    -- Subtract threshold from points
                    UPDATE loyalty_enrollments
                    SET
                        current_points = current_points - v_program.points_redemption_threshold,
                        total_rewards_earned = total_rewards_earned + 1
                    WHERE id = v_enrollment.id
                    RETURNING current_points INTO v_enrollment.current_points;

                    -- Log threshold transaction
                    INSERT INTO loyalty_transactions (
                        enrollment_id, customer_id, program_id, merchant_id,
                        order_id, transaction_type,
                        points_delta, balance_points,
                        description, reward_id
                    ) VALUES (
                        v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                        p_order_id, 'threshold_crossed',
                        -v_program.points_redemption_threshold, v_enrollment.current_points,
                        'Reward unlocked: ' || v_program.reward_description,
                        v_reward_id
                    );
                END IF;
            END IF;

        -- ─── VISITS ───────────────────────────────────────────
        ELSIF v_program.program_type = 'visits' THEN
            -- Increment visits
            UPDATE loyalty_enrollments
            SET
                current_visits = current_visits + 1,
                lifetime_visits = lifetime_visits + 1,
                last_earn_at = now(),
                updated_at = now()
            WHERE id = v_enrollment.id
            RETURNING * INTO v_enrollment;

            -- Log transaction
            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                order_id, transaction_type,
                visits_delta, balance_visits,
                description
            ) VALUES (
                v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                p_order_id, 'earn_visit',
                1, v_enrollment.current_visits,
                'Earned a visit'
            );

            -- Check threshold → create reward
            IF v_program.visits_required IS NOT NULL
               AND v_enrollment.current_visits >= v_program.visits_required
            THEN
                INSERT INTO loyalty_rewards (
                    customer_id, enrollment_id, program_id, merchant_id,
                    reward_description, reward_type, reward_value,
                    reward_max_value, reward_category_id, reward_menu_item_id,
                    expires_at, status
                ) VALUES (
                    v_customer_id, v_enrollment.id, v_program.id, v_merchant_id,
                    v_program.reward_description, v_program.reward_type, v_program.reward_value,
                    v_program.reward_max_value, v_program.reward_category_id, v_program.reward_menu_item_id,
                    CASE WHEN v_program.reward_expiry_days IS NOT NULL
                         THEN now() + (v_program.reward_expiry_days * interval '1 day')
                         ELSE NULL END,
                    'available'
                ) RETURNING id INTO v_reward_id;

                -- Reset visits counter, increment rewards earned
                UPDATE loyalty_enrollments
                SET
                    current_visits = 0,
                    total_rewards_earned = total_rewards_earned + 1
                WHERE id = v_enrollment.id
                RETURNING current_visits INTO v_enrollment.current_visits;

                INSERT INTO loyalty_transactions (
                    enrollment_id, customer_id, program_id, merchant_id,
                    order_id, transaction_type,
                    visits_delta, balance_visits,
                    description, reward_id
                ) VALUES (
                    v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                    p_order_id, 'threshold_crossed',
                    -v_program.visits_required, v_enrollment.current_visits,
                    'Reward unlocked: ' || v_program.reward_description,
                    v_reward_id
                );
            END IF;

        -- ─── PUNCH CARD ──────────────────────────────────────
        ELSIF v_program.program_type = 'punch_card' THEN
            -- Count qualifying items in the order
            v_punch_earned := 0;
            FOR v_item IN
                SELECT oi.menu_item_id, oi.quantity, mi.category_id
                FROM order_items oi
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE oi.order_id = p_order_id
            LOOP
                IF v_program.punch_target_type = 'item' AND v_item.menu_item_id = v_program.punch_menu_item_id THEN
                    v_punch_earned := v_punch_earned + v_item.quantity;
                ELSIF v_program.punch_target_type = 'category' AND v_item.category_id = v_program.punch_category_id THEN
                    v_punch_earned := v_punch_earned + v_item.quantity;
                END IF;
            END LOOP;

            IF v_punch_earned > 0 THEN
                UPDATE loyalty_enrollments
                SET
                    current_punches = current_punches + v_punch_earned,
                    lifetime_punches = lifetime_punches + v_punch_earned,
                    last_earn_at = now(),
                    updated_at = now()
                WHERE id = v_enrollment.id
                RETURNING * INTO v_enrollment;

                INSERT INTO loyalty_transactions (
                    enrollment_id, customer_id, program_id, merchant_id,
                    order_id, transaction_type,
                    punches_delta, balance_punches,
                    description
                ) VALUES (
                    v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                    p_order_id, 'earn_punch',
                    v_punch_earned, v_enrollment.current_punches,
                    'Earned ' || v_punch_earned || ' punches'
                );

                -- Check threshold → create reward
                IF v_program.punches_required IS NOT NULL
                   AND v_enrollment.current_punches >= v_program.punches_required
                THEN
                    INSERT INTO loyalty_rewards (
                        customer_id, enrollment_id, program_id, merchant_id,
                        reward_description, reward_type, reward_value,
                        reward_max_value, reward_category_id, reward_menu_item_id,
                        expires_at, status
                    ) VALUES (
                        v_customer_id, v_enrollment.id, v_program.id, v_merchant_id,
                        v_program.reward_description, v_program.reward_type, v_program.reward_value,
                        v_program.reward_max_value, v_program.reward_category_id, v_program.reward_menu_item_id,
                        CASE WHEN v_program.reward_expiry_days IS NOT NULL
                             THEN now() + (v_program.reward_expiry_days * interval '1 day')
                             ELSE NULL END,
                        'available'
                    ) RETURNING id INTO v_reward_id;

                    UPDATE loyalty_enrollments
                    SET
                        current_punches = current_punches - v_program.punches_required,
                        total_rewards_earned = total_rewards_earned + 1
                    WHERE id = v_enrollment.id
                    RETURNING current_punches INTO v_enrollment.current_punches;

                    INSERT INTO loyalty_transactions (
                        enrollment_id, customer_id, program_id, merchant_id,
                        order_id, transaction_type,
                        punches_delta, balance_punches,
                        description, reward_id
                    ) VALUES (
                        v_enrollment.id, v_customer_id, v_program.id, v_merchant_id,
                        p_order_id, 'threshold_crossed',
                        -v_program.punches_required, v_enrollment.current_punches,
                        'Reward unlocked: ' || v_program.reward_description,
                        v_reward_id
                    );
                END IF;
            END IF;
        END IF;

        -- Build result summary for this program
        v_result := v_result || jsonb_build_object(
            'program_name', v_program.name,
            'program_type', v_program.program_type,
            'earned', CASE v_program.program_type
                WHEN 'points' THEN v_points_earned
                WHEN 'visits' THEN 1
                WHEN 'punch_card' THEN v_punch_earned
            END,
            'new_balance', CASE v_program.program_type
                WHEN 'points' THEN v_enrollment.current_points
                WHEN 'visits' THEN v_enrollment.current_visits
                WHEN 'punch_card' THEN v_enrollment.current_punches
            END,
            'reward_unlocked', v_reward_id IS NOT NULL
        );
    END LOOP;

    RETURN v_result;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RPC 2: loyalty_redeem_reward
-- Called from POS checkout when staff/customer selects a reward.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION loyalty_redeem_reward(
    p_reward_id UUID,
    p_order_id UUID,
    p_location_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_reward RECORD;
    v_customer_id UUID;
    v_order_total NUMERIC;
    v_enrollment RECORD;
    v_discount_amount NUMERIC;
    v_free_item_id UUID;
    v_item_price NUMERIC;
    v_discount JSONB;
BEGIN
    -- Fetch reward and validate
    SELECT r.*, p.merchant_id AS program_merchant_id
    INTO v_reward
    FROM loyalty_rewards r
    JOIN loyalty_programs p ON r.program_id = p.id
    WHERE r.id = p_reward_id AND r.status = 'available';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Reward not available');
    END IF;

    -- Check expiry
    IF v_reward.expires_at IS NOT NULL AND v_reward.expires_at < now() THEN
        UPDATE loyalty_rewards SET status = 'expired' WHERE id = p_reward_id;
        RETURN jsonb_build_object('error', 'Reward expired');
    END IF;

    -- Validate customer matches order
    SELECT customer_id, total_amount INTO v_customer_id, v_order_total FROM orders WHERE id = p_order_id;
    IF v_customer_id IS NULL OR v_customer_id != v_reward.customer_id THEN
        RETURN jsonb_build_object('error', 'Reward does not belong to this customer');
    END IF;

    -- Get enrollment for balance updates
    SELECT * INTO v_enrollment FROM loyalty_enrollments WHERE id = v_reward.enrollment_id;

    -- Compute discount based on reward_type
    CASE v_reward.reward_type
        WHEN 'discount_fixed' THEN
            v_discount_amount := v_reward.reward_value;

        WHEN 'discount_percent' THEN
            v_discount_amount := LEAST(
                (v_order_total * v_reward.reward_value / 100),
                COALESCE(v_reward.reward_max_value, v_order_total)
            );

        WHEN 'free_item' THEN
            v_free_item_id := v_reward.reward_menu_item_id;
            IF v_free_item_id IS NULL THEN
                RETURN jsonb_build_object('error', 'Free item reward missing menu item reference');
            END IF;
            -- Look up the item price from the order
            SELECT oi.unit_price INTO v_item_price
            FROM order_items oi
            WHERE oi.order_id = p_order_id AND oi.menu_item_id = v_free_item_id
            LIMIT 1;
            v_discount_amount := COALESCE(v_item_price, 0);

        WHEN 'free_category_item' THEN
            -- Find the cheapest qualifying category item on the order
            SELECT oi.unit_price, oi.menu_item_id INTO v_item_price, v_free_item_id
            FROM order_items oi
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE oi.order_id = p_order_id
              AND mi.category_id = v_reward.reward_category_id
            ORDER BY oi.unit_price ASC
            LIMIT 1;
            v_discount_amount := COALESCE(v_item_price, 0);

        ELSE
            RETURN jsonb_build_object('error', 'Unsupported reward type');
    END CASE;

    -- Mark reward as redeemed
    UPDATE loyalty_rewards
    SET
        status = 'redeemed',
        redeemed_at = now(),
        redeemed_order_id = p_order_id,
        redeemed_location_id = p_location_id
    WHERE id = p_reward_id;

    -- Update enrollment totals
    UPDATE loyalty_enrollments
    SET
        total_rewards_redeemed = total_rewards_redeemed + 1,
        total_reward_value = total_reward_value + v_discount_amount,
        last_redeem_at = now(),
        updated_at = now()
    WHERE id = v_reward.enrollment_id;

    -- Log transaction
    INSERT INTO loyalty_transactions (
        enrollment_id, customer_id, program_id, merchant_id,
        order_id, location_id, transaction_type,
        points_delta, balance_points, punches_delta, balance_punches,
        visits_delta, balance_visits, description, reward_id
    ) VALUES (
        v_reward.enrollment_id, v_reward.customer_id, v_reward.program_id, v_reward.merchant_id,
        p_order_id, p_location_id, 'redeem',
        0, v_enrollment.current_points,
        0, v_enrollment.current_punches,
        0, v_enrollment.current_visits,
        'Redeemed: ' || v_reward.reward_description,
        p_reward_id
    );

    -- Return discount details → feeds into order_discounts with source = 'loyalty'
    v_discount := jsonb_build_object(
        'discount_type', CASE v_reward.reward_type
            WHEN 'discount_fixed' THEN 'fixed_amount'
            WHEN 'discount_percent' THEN 'percentage'
            WHEN 'free_item' THEN 'free_item'
            WHEN 'free_category_item' THEN 'free_item'
        END,
        'discount_amount', v_discount_amount,
        'discount_name', v_reward.reward_description,
        'source', 'loyalty',
        'free_item_id', v_free_item_id
    );

    RETURN v_discount;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RPC 3: loyalty_get_customer_status
-- Fast POS lookup — called when customer is identified. Sub-50ms target.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION loyalty_get_customer_status(
    p_customer_id UUID,
    p_merchant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_customer JSONB;
    v_enrollments JSONB := '[]'::JSONB;
    v_available_rewards JSONB := '[]'::JSONB;
    v_eligible_promos JSONB;
    v_record RECORD;
    v_progress NUMERIC;
BEGIN
    -- Basic customer info
    SELECT jsonb_build_object(
        'id', id,
        'name', name,
        'phone', phone,
        'tags', tags
    ) INTO v_customer
    FROM customers
    WHERE id = p_customer_id;

    -- Enrollments with progress
    FOR v_record IN
        SELECT
            e.*,
            p.name as program_name,
            p.program_type,
            p.points_redemption_threshold,
            p.visits_required,
            p.punches_required,
            p.reward_description
        FROM loyalty_enrollments e
        JOIN loyalty_programs p ON e.program_id = p.id
        WHERE e.customer_id = p_customer_id AND e.merchant_id = p_merchant_id
          AND e.is_active = true
    LOOP
        IF v_record.program_type = 'points' AND COALESCE(v_record.points_redemption_threshold, 0) > 0 THEN
            v_progress := (v_record.current_points::NUMERIC / v_record.points_redemption_threshold) * 100;
        ELSIF v_record.program_type = 'visits' AND COALESCE(v_record.visits_required, 0) > 0 THEN
            v_progress := (v_record.current_visits::NUMERIC / v_record.visits_required) * 100;
        ELSIF v_record.program_type = 'punch_card' AND COALESCE(v_record.punches_required, 0) > 0 THEN
            v_progress := (v_record.current_punches::NUMERIC / v_record.punches_required) * 100;
        ELSE
            v_progress := 0;
        END IF;

        v_enrollments := v_enrollments || jsonb_build_object(
            'program_id', v_record.program_id,
            'program_name', v_record.program_name,
            'program_type', v_record.program_type,
            'current_points', v_record.current_points,
            'points_threshold', v_record.points_redemption_threshold,
            'current_visits', v_record.current_visits,
            'visits_required', v_record.visits_required,
            'current_punches', v_record.current_punches,
            'punches_required', v_record.punches_required,
            'progress_percent', ROUND(v_progress::NUMERIC, 1),
            'next_reward', v_record.reward_description
        );
    END LOOP;

    -- Available (non-expired) rewards
    FOR v_record IN
        SELECT r.*, p.name as program_name
        FROM loyalty_rewards r
        JOIN loyalty_programs p ON r.program_id = p.id
        WHERE r.customer_id = p_customer_id
          AND r.merchant_id = p_merchant_id
          AND r.status = 'available'
          AND (r.expires_at IS NULL OR r.expires_at > now())
    LOOP
        v_available_rewards := v_available_rewards || jsonb_build_object(
            'reward_id', v_record.id,
            'description', v_record.reward_description,
            'reward_type', v_record.reward_type,
            'expires_at', v_record.expires_at,
            'program_name', v_record.program_name
        );
    END LOOP;

    -- Eligible promotions (delegate to separate function)
    SELECT get_eligible_promotions(p_customer_id, p_merchant_id, NULL, NULL, NULL)
    INTO v_eligible_promos;

    -- Assemble result matching spec shape
    RETURN jsonb_build_object(
        'customer', v_customer,
        'enrollments', v_enrollments,
        'available_rewards', v_available_rewards,
        'eligible_promotions', COALESCE(v_eligible_promos, '[]'::JSONB)
    );
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RPC 4: loyalty_void_order_earnings
-- Reverses loyalty earnings when an order is voided/refunded.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION loyalty_void_order_earnings(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tx RECORD;
    v_enrollment RECORD;
    v_reward RECORD;
    v_threshold_tx RECORD;
BEGIN
    FOR v_tx IN
        SELECT *
        FROM loyalty_transactions
        WHERE order_id = p_order_id
          AND transaction_type IN ('earn_points', 'earn_visit', 'earn_punch')
    LOOP
        -- Fetch current enrollment state
        SELECT * INTO v_enrollment FROM loyalty_enrollments WHERE id = v_tx.enrollment_id;

        -- Reverse balances
        UPDATE loyalty_enrollments
        SET
            current_points = current_points - COALESCE(v_tx.points_delta, 0),
            lifetime_points = lifetime_points - COALESCE(v_tx.points_delta, 0),
            current_visits = current_visits - COALESCE(v_tx.visits_delta, 0),
            lifetime_visits = lifetime_visits - COALESCE(v_tx.visits_delta, 0),
            current_punches = current_punches - COALESCE(v_tx.punches_delta, 0),
            lifetime_punches = lifetime_punches - COALESCE(v_tx.punches_delta, 0),
            updated_at = now()
        WHERE id = v_tx.enrollment_id;

        -- Log void transaction
        INSERT INTO loyalty_transactions (
            enrollment_id, customer_id, program_id, merchant_id,
            order_id, transaction_type,
            points_delta, punches_delta, visits_delta,
            balance_points, balance_punches, balance_visits,
            description
        ) VALUES (
            v_tx.enrollment_id, v_tx.customer_id, v_tx.program_id, v_tx.merchant_id,
            p_order_id, 'void',
            -COALESCE(v_tx.points_delta, 0),
            -COALESCE(v_tx.punches_delta, 0),
            -COALESCE(v_tx.visits_delta, 0),
            v_enrollment.current_points - COALESCE(v_tx.points_delta, 0),
            v_enrollment.current_punches - COALESCE(v_tx.punches_delta, 0),
            v_enrollment.current_visits - COALESCE(v_tx.visits_delta, 0),
            'Voided earnings from order ' || p_order_id
        );

        -- Void any unredeemed rewards linked via threshold_crossed transactions for this order
        FOR v_threshold_tx IN
            SELECT *
            FROM loyalty_transactions
            WHERE order_id = p_order_id
              AND enrollment_id = v_tx.enrollment_id
              AND transaction_type = 'threshold_crossed'
              AND reward_id IS NOT NULL
        LOOP
            -- Check reward status before voiding
            SELECT * INTO v_reward FROM loyalty_rewards WHERE id = v_threshold_tx.reward_id;

            IF v_reward.status = 'available' THEN
                -- Safe to void — not yet redeemed
                UPDATE loyalty_rewards
                SET status = 'voided', voided_at = now(), voided_reason = 'Order voided'
                WHERE id = v_reward.id;

                -- Decrement total_rewards_earned
                UPDATE loyalty_enrollments
                SET total_rewards_earned = GREATEST(total_rewards_earned - 1, 0)
                WHERE id = v_tx.enrollment_id;
            ELSIF v_reward.status = 'redeemed' THEN
                -- Already redeemed → flag for manager review, do NOT auto-claw-back
                UPDATE loyalty_rewards
                SET voided_reason = 'REVIEW: Order voided but reward was already redeemed'
                WHERE id = v_reward.id;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RPC 5: loyalty_manual_adjust
-- Dashboard action for managers to add/remove points/visits/punches.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION loyalty_manual_adjust(
    p_enrollment_id UUID,
    p_adjustment_type TEXT,  -- 'points', 'visits', 'punches'
    p_amount INTEGER,
    p_reason TEXT,
    p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_enrollment RECORD;
    v_new_balance INTEGER;
BEGIN
    SELECT * INTO v_enrollment FROM loyalty_enrollments WHERE id = p_enrollment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Enrollment not found');
    END IF;

    CASE p_adjustment_type
        WHEN 'points' THEN
            UPDATE loyalty_enrollments
            SET
                current_points = current_points + p_amount,
                lifetime_points = lifetime_points + GREATEST(p_amount, 0),
                updated_at = now()
            WHERE id = p_enrollment_id
            RETURNING current_points INTO v_new_balance;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                transaction_type,
                points_delta, balance_points,
                description, staff_id
            ) VALUES (
                p_enrollment_id, v_enrollment.customer_id, v_enrollment.program_id, v_enrollment.merchant_id,
                'adjust',
                p_amount, v_new_balance,
                'Manual adjustment: ' || p_reason,
                p_staff_id
            );

        WHEN 'visits' THEN
            UPDATE loyalty_enrollments
            SET
                current_visits = current_visits + p_amount,
                lifetime_visits = lifetime_visits + GREATEST(p_amount, 0),
                updated_at = now()
            WHERE id = p_enrollment_id
            RETURNING current_visits INTO v_new_balance;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                transaction_type,
                visits_delta, balance_visits,
                description, staff_id
            ) VALUES (
                p_enrollment_id, v_enrollment.customer_id, v_enrollment.program_id, v_enrollment.merchant_id,
                'adjust',
                p_amount, v_new_balance,
                'Manual adjustment: ' || p_reason,
                p_staff_id
            );

        WHEN 'punches' THEN
            UPDATE loyalty_enrollments
            SET
                current_punches = current_punches + p_amount,
                lifetime_punches = lifetime_punches + GREATEST(p_amount, 0),
                updated_at = now()
            WHERE id = p_enrollment_id
            RETURNING current_punches INTO v_new_balance;

            INSERT INTO loyalty_transactions (
                enrollment_id, customer_id, program_id, merchant_id,
                transaction_type,
                punches_delta, balance_punches,
                description, staff_id
            ) VALUES (
                p_enrollment_id, v_enrollment.customer_id, v_enrollment.program_id, v_enrollment.merchant_id,
                'adjust',
                p_amount, v_new_balance,
                'Manual adjustment: ' || p_reason,
                p_staff_id
            );

        ELSE
            RETURN jsonb_build_object('error', 'Invalid adjustment type. Must be: points, visits, or punches');
    END CASE;

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RPC 6: loyalty_expire_rewards (Cron Job)
-- Runs daily via Supabase Edge Function cron.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION loyalty_expire_rewards()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_reward RECORD;
BEGIN
    FOR v_reward IN
        SELECT *
        FROM loyalty_rewards
        WHERE status = 'available' AND expires_at < now()
    LOOP
        UPDATE loyalty_rewards
        SET status = 'expired'
        WHERE id = v_reward.id;

        INSERT INTO loyalty_transactions (
            enrollment_id, customer_id, program_id, merchant_id,
            transaction_type,
            description, reward_id
        ) VALUES (
            v_reward.enrollment_id, v_reward.customer_id, v_reward.program_id, v_reward.merchant_id,
            'expire',
            'Reward expired: ' || v_reward.reward_description,
            v_reward.id
        );
    END LOOP;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RPC 7: get_eligible_promotions
-- Called at checkout to find applicable promotions.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_eligible_promotions(
    p_customer_id UUID,
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL,
    p_order_total NUMERIC DEFAULT NULL,
    p_order_items JSONB DEFAULT NULL  -- [{menu_item_id, category_id, quantity, price}]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_promo RECORD;
    v_result JSONB := '[]'::JSONB;
    v_customer RECORD;
    v_visit_count INTEGER;
    v_last_visit DATE;
    v_today DATE := CURRENT_DATE;
    v_now_time TIME := LOCALTIME;
    v_qualifying BOOLEAN;
    v_discount_amount NUMERIC;
    v_bogo_qty INTEGER;
    v_bundle_match BOOLEAN;
BEGIN
    -- Fetch customer info if available
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
        SELECT COUNT(*) INTO v_visit_count FROM orders WHERE customer_id = p_customer_id AND status = 'completed';
        SELECT MAX(created_at)::DATE INTO v_last_visit FROM orders WHERE customer_id = p_customer_id AND status = 'completed';
    END IF;

    FOR v_promo IN
        SELECT *
        FROM promotions
        WHERE merchant_id = p_merchant_id
          AND is_active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
          AND (location_ids IS NULL OR p_location_id IS NULL OR p_location_id = ANY(location_ids))
    LOOP
        -- Time-of-day filter
        IF v_promo.active_days IS NOT NULL AND NOT (EXTRACT(DOW FROM now())::INTEGER = ANY(v_promo.active_days)) THEN
            CONTINUE;
        END IF;
        IF v_promo.active_time_start IS NOT NULL AND v_promo.active_time_end IS NOT NULL THEN
            IF NOT (v_now_time BETWEEN v_promo.active_time_start AND v_promo.active_time_end) THEN
                CONTINUE;
            END IF;
        END IF;

        v_qualifying := true;

        -- Type-specific qualification
        CASE v_promo.promo_type
            WHEN 'happy_hour' THEN
                -- Already handled by time filters above
                NULL;

            WHEN 'birthday' THEN
                IF v_customer IS NULL OR v_customer.birthday IS NULL THEN
                    v_qualifying := false;
                ELSE
                    -- Respect birthday_window: day, week, or month
                    CASE COALESCE(v_promo.birthday_window, 'week')
                        WHEN 'day' THEN
                            IF EXTRACT(MONTH FROM v_customer.birthday) != EXTRACT(MONTH FROM v_today)
                               OR EXTRACT(DAY FROM v_customer.birthday) != EXTRACT(DAY FROM v_today) THEN
                                v_qualifying := false;
                            END IF;
                        WHEN 'week' THEN
                            -- Check if birthday falls within 7 days (before or after today)
                            IF ABS(
                                EXTRACT(DOY FROM MAKE_DATE(EXTRACT(YEAR FROM v_today)::INT, EXTRACT(MONTH FROM v_customer.birthday)::INT, EXTRACT(DAY FROM v_customer.birthday)::INT))
                                - EXTRACT(DOY FROM v_today)
                            ) > 3 THEN
                                v_qualifying := false;
                            END IF;
                        WHEN 'month' THEN
                            IF EXTRACT(MONTH FROM v_customer.birthday) != EXTRACT(MONTH FROM v_today) THEN
                                v_qualifying := false;
                            END IF;
                        ELSE
                            v_qualifying := false;
                    END CASE;
                END IF;

            WHEN 'first_visit' THEN
                -- Qualifies if customer is anonymous OR has 0 completed orders
                IF p_customer_id IS NOT NULL AND v_visit_count > 0 THEN
                    v_qualifying := false;
                END IF;

            WHEN 'comeback' THEN
                IF v_last_visit IS NULL OR v_last_visit > v_today - COALESCE(v_promo.comeback_days, 30) THEN
                    v_qualifying := false;
                END IF;

            WHEN 'threshold' THEN
                IF p_order_total IS NULL OR p_order_total < COALESCE(v_promo.threshold_amount, 0) THEN
                    v_qualifying := false;
                END IF;

            WHEN 'bogo' THEN
                -- Check if order contains at least bogo_buy_quantity of qualifying items
                IF p_order_items IS NULL THEN
                    v_qualifying := false;
                ELSE
                    SELECT COALESCE(SUM((item->>'quantity')::INTEGER), 0) INTO v_bogo_qty
                    FROM jsonb_array_elements(p_order_items) AS item
                    WHERE (v_promo.target_item_ids IS NULL OR (item->>'menu_item_id')::UUID = ANY(v_promo.target_item_ids))
                      AND (v_promo.target_categories IS NULL OR (item->>'category_id')::UUID = ANY(v_promo.target_categories));

                    IF v_bogo_qty < COALESCE(v_promo.bogo_buy_quantity, 1) THEN
                        v_qualifying := false;
                    END IF;
                END IF;

            WHEN 'bundle' THEN
                -- Check all target items/categories present in order
                IF p_order_items IS NULL THEN
                    v_qualifying := false;
                ELSE
                    -- All target_item_ids must appear in the order
                    IF v_promo.target_item_ids IS NOT NULL THEN
                        SELECT bool_and(EXISTS(
                            SELECT 1 FROM jsonb_array_elements(p_order_items) AS item
                            WHERE (item->>'menu_item_id')::UUID = tid
                        )) INTO v_bundle_match
                        FROM unnest(v_promo.target_item_ids) AS tid;

                        IF NOT COALESCE(v_bundle_match, false) THEN
                            v_qualifying := false;
                        END IF;
                    END IF;
                END IF;

            WHEN 'seasonal' THEN
                -- Already handled by date range filters above
                NULL;

            WHEN 'referral' THEN
                IF v_customer IS NULL OR v_customer.referred_by_customer_id IS NULL THEN
                    v_qualifying := false;
                ELSE
                    -- Check if referral promo already used by this customer
                    PERFORM 1 FROM promotion_usage WHERE promotion_id = v_promo.id AND customer_id = p_customer_id;
                    IF FOUND THEN
                        v_qualifying := false;
                    END IF;
                END IF;

            ELSE
                -- Unknown promo type, skip
                v_qualifying := false;
        END CASE;

        -- Check per-customer usage limits
        IF v_qualifying AND p_customer_id IS NOT NULL AND v_promo.max_uses_per_customer IS NOT NULL THEN
            PERFORM 1 FROM promotion_usage
            WHERE promotion_id = v_promo.id AND customer_id = p_customer_id
            HAVING COUNT(*) >= v_promo.max_uses_per_customer;
            IF FOUND THEN
                v_qualifying := false;
            END IF;
        END IF;

        -- Check total usage limits
        IF v_qualifying AND v_promo.max_uses_total IS NOT NULL THEN
            IF v_promo.current_uses >= v_promo.max_uses_total THEN
                v_qualifying := false;
            END IF;
        END IF;

        IF v_qualifying THEN
            -- Calculate discount amount if order total is known
            IF p_order_total IS NOT NULL THEN
                IF v_promo.discount_type = 'percentage' THEN
                    v_discount_amount := LEAST(
                        p_order_total * v_promo.discount_value / 100,
                        COALESCE(v_promo.discount_max, p_order_total)
                    );
                ELSIF v_promo.discount_type = 'fixed_amount' THEN
                    v_discount_amount := v_promo.discount_value;
                ELSE
                    v_discount_amount := v_promo.discount_value;
                END IF;
            ELSE
                v_discount_amount := NULL;
            END IF;

            v_result := v_result || jsonb_build_object(
                'promo_id', v_promo.id,
                'name', v_promo.name,
                'promo_type', v_promo.promo_type,
                'discount_type', v_promo.discount_type,
                'discount_value', v_promo.discount_value,
                'discount_max', v_promo.discount_max,
                'discount_amount', v_discount_amount,
                'auto_apply', COALESCE(v_promo.auto_apply, false)
            );
        END IF;
    END LOOP;

    RETURN v_result;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- Performance Indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_merchant_active
    ON loyalty_programs(merchant_id, is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_enrollments_customer_program
    ON loyalty_enrollments(customer_id, program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order
    ON loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_customer_status
    ON loyalty_rewards(customer_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_promotions_merchant_active
    ON promotions(merchant_id, is_active, starts_at, ends_at);
