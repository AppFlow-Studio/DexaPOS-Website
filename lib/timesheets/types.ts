/**
 * Timesheet summary contract.
 *
 * `get_timesheet_summary` (supabase/migrations/*_timesheet_summary.sql) returns
 * one payload at SHIFT grain; every figure on the page and in both CSVs is a
 * sum of these rows (docs/features/staff/PLAN-2026-09-15-TIMESHEETS-SUMMARY-GRID.md §3).
 *
 * The RPC speaks snake_case; `GetTimesheetSummary` parses it with Zod and hands
 * the client these camelCase shapes.
 */

export interface TimesheetMeta {
  locationId: string
  locationName: string
  /** IANA zone every boundary and label is computed in, e.g. "America/New_York". */
  timezone: string
  weekStartsOn: 'monday'
  otThresholdMinutes: number
  otMultiplier: number
  /** Shifts longer than this are flagged; open shifts older than this are "missing clock-out". */
  maxShiftMinutes: number
  /** Inclusive local dates, YYYY-MM-DD. */
  rangeStart: string
  rangeEnd: string
  generatedAt: string
}

export interface TimesheetEmployee {
  staffProfileId: string
  displayName: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  roleName: string | null
  /** False for someone with shifts in the period who no longer works at the location. */
  isActiveMember: boolean
}

export interface TimesheetBreak {
  type: 'paid' | 'unpaid'
  start: string
  end: string | null
  /** Clamped to the shift window. */
  minutes: number
}

export interface TimesheetShift {
  id: string
  staffProfileId: string
  /** Local calendar date of the clock-in, YYYY-MM-DD — the day the shift counts on. */
  localDate: string
  clockIn: string
  clockOut: string | null
  status: string
  netMinutes: number
  unpaidBreakMinutes: number
  paidBreakMinutes: number
  otMinutes: number
  rate: number
  /** Truncated to the cent per shift; null when the shift has no pay rate. */
  payCents: number | null
  isOpen: boolean
  isOnClock: boolean
  isMissingOut: boolean
  isOvernight: boolean
  isOverMax: boolean
  isEdited: boolean
  isAutoClosed: boolean
  fromPos: boolean
  breaks: TimesheetBreak[]
  /** Raw `staff_shifts.break_logs`, kept for the Adjust shift dialog. */
  breakLogs: unknown[]
  notes: string | null
  isVerified: boolean
}

export interface TimesheetSummaryPayload {
  meta: TimesheetMeta
  employees: TimesheetEmployee[]
  shifts: TimesheetShift[]
}

export type TimesheetPeriodKind = 'week' | 'month' | 'custom'
export type TimesheetView = 'summary' | 'shifts'
export type TimesheetReviewFilter = 'missing' | 'long' | 'norate'
