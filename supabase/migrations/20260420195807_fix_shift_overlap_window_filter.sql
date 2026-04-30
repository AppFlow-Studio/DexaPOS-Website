
-- Fix: Include shifts that overlapped with the session window
-- Before: only shifts started after cutoff OR still active
-- After: also includes shifts that clocked out during the window
-- This ensures staff who started before the cutoff but worked into the 
-- current session (like shift trades) appear in the distribution.

-- The DO block already applied the fix to the live function.
-- This migration records it formally.

-- Verify the fix is in place
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'calculate_tip_distribution_v2';
  
  IF position('clock_out_time > v_window_start' in v_def) = 0 THEN
    -- Apply the fix
    v_def := replace(v_def, 
      'AND (ss.clock_in_time >= v_window_start OR ss.clock_out_time IS NULL)',
      'AND (ss.clock_in_time >= v_window_start OR ss.clock_out_time IS NULL OR ss.clock_out_time > v_window_start)'
    );
    EXECUTE v_def;
  END IF;
END $$;

-- Also fix rebuild_employee_daily_tips with the same pattern
DO $$
DECLARE
  v_def TEXT;
  v_has_fix BOOLEAN;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'rebuild_employee_daily_tips';
  
  -- Check if it has the same window filter pattern to fix
  v_has_fix := position('clock_out_time > v_window_start' in v_def) > 0
            OR position('clock_out_time IS NULL' in v_def) = 0;
  
  -- rebuild_employee_daily_tips uses day boundaries not session windows,
  -- so it doesn't need this specific fix. No change needed.
END $$;
;
