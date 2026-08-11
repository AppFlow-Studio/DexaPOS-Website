-- Rollback for Wave E — watchdog views.
DROP VIEW IF EXISTS public.v_stuck_paid_active_sessions;
DROP VIEW IF EXISTS public.v_session_paid_at_coverage;
