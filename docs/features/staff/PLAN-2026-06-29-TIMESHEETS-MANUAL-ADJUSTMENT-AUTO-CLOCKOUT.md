# Timesheets Manual Adjustment + Auto Clock-Out

## Ticket

Managers need to correct staff shift hours from the merchant web dashboard and prevent open shifts from accruing impossible totals. The requested surface is `/dashboard/staff/timesheets`.

## Scope Split

### Part 1: Manual Hour Adjustment

Status: implemented in this branch.

Deliverables:
- Merchant dashboard timesheet row action to edit a shift.
- Editable clock-in, clock-out, paid/unpaid break rows, and required reason.
- Server-side validation for invalid ranges, future times, overlapping breaks, and breaks outside the shift.
- Adjusted shifts are marked `is_verified = true`.
- Shift status is set to `completed` when a clock-out is provided.
- Manual adjustment reason is stored on `staff_shifts.notes`.
- Audit event is written from the dashboard action with action `shift_adjusted`.
- Timesheet table shows an `ADJUSTED` badge for verified manual edits with the reason available on hover.

### Part 2: Configurable Auto Clock-Out

Status: gated fast-follow, not shipped in this pass.

Reason:
- The ticket explicitly warns that this overlaps Employee Scheduling System auto-close and POS force clock-out behavior.
- Shipping a new scheduled auto-close path without reconciling those existing mechanisms can create double-close or conflicting audit behavior.

Required before implementation:
- Confirm the single owner for auto clock-out behavior with Temur/Abubeckr.
- Confirm whether auto close should be per-location setting, schedule-driven, POS-driven, or a shared worker.
- Confirm audit shape for auto-close events before adding cron/Edge/job logic.

## Backend

Migration:
- `supabase/migrations/20260629120000_admin_adjust_staff_shift.sql`

RPC:
- `admin_adjust_staff_shift(p_shift_id, p_clock_in_time, p_clock_out_time, p_break_logs, p_reason)`

Security:
- `SECURITY DEFINER`
- pinned `search_path = 'public','pg_temp'`
- authorizes merchant owner/admin/manager through `is_merchant_admin`
- authorizes location managers through `user_has_location_permission(location_id, 'location.team.manage')`

Validation:
- reason required
- clock-in required
- clock-out must be after clock-in
- clock-in/clock-out cannot be in the future beyond a small clock-skew tolerance
- break logs must be an array
- break rows require start and end
- break rows cannot overlap
- break rows cannot sit outside the shift window
- unpaid break duration cannot exceed the shift duration

## Frontend

Primary surface:
- `/dashboard/staff/timesheets`

Expected manager flow:
1. Open Staff > Timesheets.
2. Filter to the employee/date/location.
3. Open the row action menu.
4. Click `Adjust shift`.
5. Correct clock-in, clock-out, and break rows.
6. Enter the correction reason.
7. Save.
8. Confirm the row recalculates total hours/pay and shows `ADJUSTED`.

## QA Checklist

- Active shift can be corrected by adding a clock-out.
- Completed shift clock-in and clock-out can be corrected.
- Empty reason blocks save.
- Clock-out before clock-in is rejected.
- Future clock-out is rejected.
- Overlapping break rows are rejected.
- Break outside shift window is rejected.
- Unpaid break reduces total hours and estimated pay.
- Paid break does not reduce total hours.
- Saved row shows `ADJUSTED`.
- Hover/title on `ADJUSTED` exposes the adjustment reason.
- Audit log contains `shift_adjusted` with before/after clock and break data.

## Production Notes

- Apply the migration before testing the UI path in a deployed environment.
- Do not enable a scheduled auto clock-out job until the scheduling/POS force-clock-out owner is confirmed.
