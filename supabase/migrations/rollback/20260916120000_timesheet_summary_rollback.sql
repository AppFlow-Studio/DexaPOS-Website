-- Rollback for 20260916120000_timesheet_summary.sql
-- Drops the timesheets summary RPC, its hours helper and the range index.
-- Nothing else depends on them in the database; the /dashboard/staff/timesheets
-- page (GetTimesheetSummary) must be reverted first or it will error.

DROP FUNCTION IF EXISTS public.get_timesheet_summary(uuid, date, date);
DROP FUNCTION IF EXISTS public.timesheet_shift_minutes(timestamptz, timestamptz, jsonb);
DROP INDEX IF EXISTS public.idx_staff_shifts_location_clock_in;
