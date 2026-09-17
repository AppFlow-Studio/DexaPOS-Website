-- Removes every shift added by timesheets-seed.sql — and nothing else.
-- Paste into Supabase Dashboard → SQL Editor → Run. DEV ONLY.
--
-- If you edited a seeded shift through "Adjust shift", it is still tagged and
-- is removed too. The audit_logs rows the insert trigger wrote stay behind;
-- they are history, not timesheet data.

DELETE FROM public.staff_shifts
WHERE device_id = 'TIMESHEET-SEED'
RETURNING id, staff_profile_id, clock_in_time, clock_out_time;
