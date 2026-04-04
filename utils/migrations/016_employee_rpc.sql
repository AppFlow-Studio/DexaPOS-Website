CREATE OR REPLACE FUNCTION approve_shift_swap(
    p_request_id uuid,
    p_manager_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req record;
BEGIN
    -- 1. Get request details
    SELECT * INTO v_req FROM shift_trade_requests WHERE id = p_request_id;
    
    IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
    IF v_req.status != 'pending_manager' THEN RAISE EXCEPTION 'Request is not pending approval'; END IF;

    -- 2. Swap the employees on the actual shifts
    -- Assign Requester's Shift -> Recipient
    UPDATE shifts 
    SET employee_id = v_req.recipient_id, status = 'published'
    WHERE id = v_req.offered_shift_id;

    -- Assign Recipient's Shift -> Requester
    UPDATE shifts 
    SET employee_id = v_req.requester_id, status = 'published'
    WHERE id = v_req.requested_shift_id;

    -- 3. Mark Request as Approved
    UPDATE shift_trade_requests 
    SET status = 'approved', reviewed_by = p_manager_id 
    WHERE id = p_request_id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION detect_schedule_conflicts(
    p_merchant_id uuid,
    p_location_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_exclude_schedule_id uuid DEFAULT NULL -- Optional: Ignore the schedule currently being edited
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conflicts jsonb := '[]'::jsonb;
    v_overtime_threshold numeric := 40; -- Configurable: 40 hours/week
    v_rest_threshold interval := '10 hours'; -- Configurable: Min time between shifts
BEGIN

    -- 1. DETECT DOUBLE BOOKINGS
    -- Logic: Find any two shifts for the same employee that overlap in time
    SELECT jsonb_agg(json_build_object(
        'type', 'double_booked',
        'employee_id', s1.employee_id,
        'employee_name', p.first_name || ' ' || p.last_name,
        'shift_a_id', s1.id,
        'shift_b_id', s2.id,
        'details', 'Overlaps with another shift on ' || to_char(s1.start_time, 'Mon DD')
    ))
    INTO v_conflicts
    FROM shifts s1
    JOIN shifts s2 ON s1.employee_id = s2.employee_id 
        AND s1.id < s2.id -- Avoid duplicate pairs (A-B vs B-A) and self-match
        AND s1.status != 'draft' AND s2.status != 'draft' -- Only check published/confirmed shifts
    JOIN staff_profiles p ON p.id = s1.employee_id
    WHERE s1.merchant_id = p_merchant_id
      AND s1.start_time < p_end_date 
      AND s1.end_time > p_start_date
      AND s1.employee_id IS NOT NULL
      -- If checking a specific draft against published, you might adjust filters here
      AND tstzrange(s1.start_time, s1.end_time) && tstzrange(s2.start_time, s2.end_time);

    -- 2. DETECT "CLOPENINGS" (Back-to-Back Shifts)
    -- Logic: Check if time between End of Shift A and Start of Shift B is < 10 hours
    WITH shift_gaps AS (
        SELECT 
            s.id,
            s.employee_id,
            s.start_time,
            s.end_time,
            LAG(s.end_time) OVER (PARTITION BY s.employee_id ORDER BY s.start_time) as prev_end_time,
            LAG(s.id) OVER (PARTITION BY s.employee_id ORDER BY s.start_time) as prev_shift_id
        FROM shifts s
        WHERE s.merchant_id = p_merchant_id
          AND s.start_time >= p_start_date - interval '1 day' -- Buffer for yesterday's late shift
          AND s.end_time <= p_end_date
          AND s.employee_id IS NOT NULL
          AND s.status != 'draft'
    )
    SELECT v_conflicts || COALESCE(jsonb_agg(json_build_object(
        'type', 'clopening',
        'employee_id', g.employee_id,
        'employee_name', p.first_name || ' ' || p.last_name,
        'shift_a_id', g.prev_shift_id,
        'shift_b_id', g.id,
        'details', 'Only ' || round(EXTRACT(EPOCH FROM (g.start_time - g.prev_end_time))/3600, 1) || ' hours rest'
    )), '[]'::jsonb)
    INTO v_conflicts
    FROM shift_gaps g
    JOIN staff_profiles p ON p.id = g.employee_id
    WHERE g.prev_end_time IS NOT NULL
      AND (g.start_time - g.prev_end_time) < v_rest_threshold;

    -- 3. DETECT OVERTIME
    -- Logic: Sum duration hours per employee. 
    -- Note: Ideally this runs on a standard "Work Week" (e.g. Mon-Sun), but here matches the requested period.
    WITH hours_calc AS (
        SELECT 
            s.employee_id,
            p.first_name || ' ' || p.last_name as name,
            SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600) as total_hours
        FROM shifts s
        JOIN staff_profiles p ON p.id = s.employee_id
        WHERE s.merchant_id = p_merchant_id
          AND s.start_time >= p_start_date
          AND s.end_time <= p_end_date
          AND s.status != 'draft'
          AND s.employee_id IS NOT NULL
        GROUP BY s.employee_id, p.first_name, p.last_name
    )
    SELECT v_conflicts || COALESCE(jsonb_agg(json_build_object(
        'type', 'overtime',
        'employee_id', h.employee_id,
        'employee_name', h.name,
        'details', 'Scheduled for ' || round(h.total_hours, 1) || ' hours (Exceeds ' || v_overtime_threshold || ')'
    )), '[]'::jsonb)
    INTO v_conflicts
    FROM hours_calc h
    WHERE h.total_hours > v_overtime_threshold;

    RETURN COALESCE(v_conflicts, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION publish_schedule(
    p_schedule_id uuid,
    p_merchant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schedule_name text;
    v_start_date date;
    v_end_date date;
BEGIN
    -- 1. Get Schedule Details & Validate
    SELECT name, start_date, end_date 
    INTO v_schedule_name, v_start_date, v_end_date
    FROM schedules 
    WHERE id = p_schedule_id AND merchant_id = p_merchant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Schedule not found'; END IF;

    -- 2. Update Schedule Status
    UPDATE schedules 
    SET status = 'active', updated_at = now() 
    WHERE id = p_schedule_id;

    -- 3. Update Shifts Status
    UPDATE shifts 
    SET status = 'published', updated_at = now()
    WHERE schedule_id = p_schedule_id;

    -- 4. BATCH NOTIFY: Insert one notification per unique employee
    INSERT INTO notifications (
        merchant_id, 
        recipient_id, 
        type, 
        title, 
        body, 
        data
    )
    SELECT DISTINCT
        p_merchant_id,
        s.employee_id,
        'schedule_published',
        'New Schedule Published',
        -- Dynamic Message: "Week 42 (Oct 21 - Oct 27) is now live."
        v_schedule_name || ' (' || to_char(v_start_date, 'Mon DD') || ' - ' || to_char(v_end_date, 'Mon DD') || ') is now live.',
        jsonb_build_object('schedule_id', p_schedule_id)
    FROM shifts s
    WHERE s.schedule_id = p_schedule_id
      AND s.employee_id IS NOT NULL; -- Don't notify open shifts yet

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION copy_schedule_shifts(
    p_source_schedule_id uuid,
    p_target_schedule_id uuid,
    p_include_employees boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source_start date;
    v_target_start date;
    v_days_diff integer;
BEGIN
    -- 1. Get date difference to shift the timestamps
    SELECT start_date INTO v_source_start FROM schedules WHERE id = p_source_schedule_id;
    SELECT start_date INTO v_target_start FROM schedules WHERE id = p_target_schedule_id;
    
    v_days_diff := v_target_start - v_source_start;

    -- 2. Clone Shifts
    INSERT INTO shifts (
        merchant_id, location_id, schedule_id, 
        employee_id, role_name, 
        start_time, end_time, 
        color, notes, status
    )
    SELECT 
        merchant_id, location_id, p_target_schedule_id,
        CASE WHEN p_include_employees THEN employee_id ELSE NULL END, -- Option to copy structure only
        role_name,
        start_time + (v_days_diff || ' days')::interval, -- Shift the dates
        end_time + (v_days_diff || ' days')::interval,
        color, notes,
        'draft' -- Always copy as draft first!
    FROM shifts 
    WHERE schedule_id = p_source_schedule_id;
END;
$$;

-- 1. The Trigger Function
CREATE OR REPLACE FUNCTION handle_shift_update_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_schedule_status text;
BEGIN
    -- Check if parent schedule is active
    SELECT status INTO v_schedule_status FROM schedules WHERE id = NEW.schedule_id;
    
    -- If schedule is draft, do nothing
    IF v_schedule_status != 'active' THEN RETURN NEW; END IF;

    -- CASE 1: Shift Assigned (Null -> User)
    IF OLD.employee_id IS NULL AND NEW.employee_id IS NOT NULL THEN
        INSERT INTO notifications (merchant_id, recipient_id, type, title, body, data)
        VALUES (NEW.merchant_id, NEW.employee_id, 'schedule_update', 
                'New Shift Assigned', 
                'You have been assigned a shift on ' || to_char(NEW.start_time, 'Mon DD') || ' at ' || to_char(NEW.start_time, 'HH:MI AM'),
                jsonb_build_object('shift_id', NEW.id));

    -- CASE 2: Shift Removed (User -> Null)
    ELSIF OLD.employee_id IS NOT NULL AND NEW.employee_id IS NULL THEN
        INSERT INTO notifications (merchant_id, recipient_id, type, title, body, data)
        VALUES (OLD.merchant_id, OLD.employee_id, 'schedule_update', 
                'Shift Removed', 
                'Your shift on ' || to_char(OLD.start_time, 'Mon DD') || ' has been removed.',
                jsonb_build_object('shift_id', OLD.id));

    -- CASE 3: Shift Reassigned (User A -> User B)
    ELSIF OLD.employee_id IS NOT NULL AND NEW.employee_id IS NOT NULL AND OLD.employee_id != NEW.employee_id THEN
        -- Notify Old User
        INSERT INTO notifications (merchant_id, recipient_id, type, title, body, data)
        VALUES (OLD.merchant_id, OLD.employee_id, 'schedule_update', 'Shift Removed', 'Your shift on ' || to_char(OLD.start_time, 'Mon DD') || ' has been removed.', jsonb_build_object('shift_id', OLD.id));
        -- Notify New User
        INSERT INTO notifications (merchant_id, recipient_id, type, title, body, data)
        VALUES (NEW.merchant_id, NEW.employee_id, 'schedule_update', 'New Shift Assigned', 'You have been assigned a shift on ' || to_char(NEW.start_time, 'Mon DD') || '.', jsonb_build_object('shift_id', NEW.id));

    -- CASE 4: Time Change (Same User)
    ELSIF OLD.employee_id = NEW.employee_id AND (OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time) THEN
        INSERT INTO notifications (merchant_id, recipient_id, type, title, body, data)
        VALUES (NEW.merchant_id, NEW.employee_id, 'schedule_update', 
                'Shift Updated', 
                'Your shift on ' || to_char(NEW.start_time, 'Mon DD') || ' changed: ' || to_char(NEW.start_time, 'HH:MI AM') || ' - ' || to_char(NEW.end_time, 'HH:MI AM'),
                jsonb_build_object('shift_id', NEW.id));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach Trigger to Table
CREATE TRIGGER on_shift_update_notify
AFTER UPDATE ON shifts
FOR EACH ROW
EXECUTE FUNCTION handle_shift_update_notification();

