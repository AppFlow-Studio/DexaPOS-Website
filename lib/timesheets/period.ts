/**
 * Period and bucket maths for the timesheets page.
 *
 * Everything here works on bare `YYYY-MM-DD` calendar dates at the LOCATION —
 * never `Date` objects in the browser's zone. Days are counted in UTC so no
 * daylight-saving transition can shift a boundary; the RPC turns these dates
 * into instants with `AT TIME ZONE`, which is where DST is handled.
 *
 * Weeks run Monday–Sunday (plan §9 Q1), matching the RPC's overtime weeks.
 */

import type { TimesheetPeriodKind } from './types'

export interface TimesheetPeriod {
  kind: TimesheetPeriodKind
  /** Inclusive. */
  start: string
  /** Inclusive. */
  end: string
}

export interface TimesheetBucket {
  key: string
  kind: 'day' | 'week'
  /** Inclusive. */
  start: string
  /** Inclusive. */
  end: string
  label: string
  sublabel: string
  /** A week column clipped by the edge of the period. */
  isPartial: boolean
}

/** The RPC refuses spans where `end - start > 92`. */
export const MAX_RANGE_DAYS = 92
/** Custom ranges up to two weeks show day columns; longer ones show weeks. */
export const CUSTOM_DAY_COLUMN_LIMIT = 14

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// --- primitive date arithmetic (UTC-based so DST never applies) -------------

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  return fromUtc(toUtc(value)) === value
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000)
}

export function daysBetween(start: string, end: string): number {
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000)
}

/** 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(date: string): number {
  const dow = new Date(toUtc(date)).getUTCDay()
  return dow === 0 ? 7 : dow
}

export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoDayOfWeek(date))
}

export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6)
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return fromUtc(Date.UTC(y, m, 0))
}

function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number)
  return fromUtc(Date.UTC(y, m - 1 + months, 1))
}

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return { year: y, month: m - 1, day: d }
}

// --- periods ----------------------------------------------------------------

export function periodContaining(kind: TimesheetPeriodKind, date: string): TimesheetPeriod {
  if (kind === 'month') {
    return { kind, start: startOfMonth(date), end: endOfMonth(date) }
  }
  // A custom period starts life as the week it was opened from.
  return { kind, start: startOfWeek(date), end: endOfWeek(date) }
}

export function stepPeriod(period: TimesheetPeriod, direction: 1 | -1): TimesheetPeriod {
  if (period.kind === 'month') {
    const start = addMonths(period.start, direction)
    return { kind: 'month', start, end: endOfMonth(start) }
  }
  const length = daysBetween(period.start, period.end) + 1
  return {
    kind: period.kind,
    start: addDays(period.start, direction * length),
    end: addDays(period.end, direction * length),
  }
}

export function containsDate(period: TimesheetPeriod, date: string): boolean {
  return period.start <= date && date <= period.end
}

/** Stepping forward is pointless once the next period starts after today. */
export function canStepForward(period: TimesheetPeriod, today: string): boolean {
  return stepPeriod(period, 1).start <= today
}

/**
 * Reads the period from the URL, falling back to the current week for anything
 * missing or malformed. Week and month periods are re-snapped to their real
 * boundaries, so a hand-edited `start` can never produce a Wednesday-start week.
 */
export function parsePeriod(
  params: { period?: string | null; start?: string | null; end?: string | null },
  today: string
): TimesheetPeriod {
  const kind: TimesheetPeriodKind =
    params.period === 'month' || params.period === 'custom' ? params.period : 'week'
  const start = isValidDate(params.start) ? params.start : null
  const end = isValidDate(params.end) ? params.end : null

  if (kind === 'custom') {
    if (start && end && start <= end && daysBetween(start, end) <= MAX_RANGE_DAYS) {
      return { kind, start, end }
    }
    return periodContaining('custom', today)
  }
  return periodContaining(kind, start ?? today)
}

/**
 * Recovers the period a payload was fetched for, from its range alone. Used
 * while the previous period stays on screen during a refetch: its shifts must
 * be laid out in their own columns, not the columns of the period being loaded.
 */
export function inferPeriod(start: string, end: string): TimesheetPeriod {
  if (start === startOfWeek(start) && end === addDays(start, 6)) return { kind: 'week', start, end }
  if (start === startOfMonth(start) && end === endOfMonth(start)) return { kind: 'month', start, end }
  return { kind: 'custom', start, end }
}

/** Clamps a custom selection to what the RPC accepts. */
export function clampCustomRange(start: string, end: string): TimesheetPeriod {
  const [a, b] = start <= end ? [start, end] : [end, start]
  const limit = addDays(a, MAX_RANGE_DAYS)
  return { kind: 'custom', start: a, end: b > limit ? limit : b }
}

// --- labels -----------------------------------------------------------------

function shortDate(date: string): string {
  const { month, day } = parts(date)
  return `${MONTH_SHORT[month]} ${day}`
}

/** "Sep 7 – 13, 2026", "Aug 31 – Sep 6, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function formatRange(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (start === end) return `${shortDate(start)}, ${a.year}`
  if (a.year !== b.year) return `${shortDate(start)}, ${a.year} – ${shortDate(end)}, ${b.year}`
  if (a.month !== b.month) return `${shortDate(start)} – ${shortDate(end)}, ${b.year}`
  return `${shortDate(start)} – ${b.day}, ${b.year}`
}

export function formatPeriodLabel(period: TimesheetPeriod): string {
  if (period.kind === 'month') {
    const { year, month } = parts(period.start)
    return `${MONTH_LONG[month]} ${year}`
  }
  return formatRange(period.start, period.end)
}

/** "this week" / "this month" / "this period" — for empty and review copy. */
export function periodNoun(period: TimesheetPeriod): string {
  if (period.kind === 'week') return 'this week'
  if (period.kind === 'month') return 'this month'
  return 'this period'
}

function weekBucketLabel(start: string, end: string): string {
  if (start === end) return shortDate(start)
  const a = parts(start)
  const b = parts(end)
  if (a.month !== b.month) return `${shortDate(start)} – ${shortDate(end)}`
  return `${shortDate(start)}–${b.day}`
}

// --- buckets ----------------------------------------------------------------

function dayBuckets(start: string, end: string): TimesheetBucket[] {
  const buckets: TimesheetBucket[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) {
    buckets.push({
      key: date,
      kind: 'day',
      start: date,
      end: date,
      label: DAY_NAMES[isoDayOfWeek(date) - 1],
      sublabel: shortDate(date),
      isPartial: false,
    })
  }
  return buckets
}

/**
 * Monday–Sunday weeks clipped to the period, so a month's columns add up to
 * the calendar month exactly. A month can span six of these (August 2026
 * starts on a Saturday), not the five the ticket assumed.
 */
function weekBuckets(start: string, end: string): TimesheetBucket[] {
  const buckets: TimesheetBucket[] = []
  let index = 0
  for (let weekStart = startOfWeek(start); weekStart <= end; weekStart = addDays(weekStart, 7)) {
    const clippedStart = weekStart < start ? start : weekStart
    const weekEnd = addDays(weekStart, 6)
    const clippedEnd = weekEnd > end ? end : weekEnd
    const isPartial = clippedStart !== weekStart || clippedEnd !== weekEnd
    index += 1
    const firstDay = DAY_NAMES[isoDayOfWeek(clippedStart) - 1]
    const lastDay = DAY_NAMES[isoDayOfWeek(clippedEnd) - 1]
    buckets.push({
      key: clippedStart,
      kind: 'week',
      start: clippedStart,
      end: clippedEnd,
      label: weekBucketLabel(clippedStart, clippedEnd),
      sublabel: isPartial
        ? clippedStart === clippedEnd
          ? firstDay
          : `${firstDay}–${lastDay}`
        : `Week ${index}`,
      isPartial,
    })
  }
  return buckets
}

export function bucketsForPeriod(period: TimesheetPeriod): TimesheetBucket[] {
  if (period.kind === 'week') return dayBuckets(period.start, period.end)
  if (period.kind === 'month') return weekBuckets(period.start, period.end)
  return daysBetween(period.start, period.end) + 1 <= CUSTOM_DAY_COLUMN_LIMIT
    ? dayBuckets(period.start, period.end)
    : weekBuckets(period.start, period.end)
}

/** Index of the bucket a local date falls in, or -1. Buckets are sorted and contiguous. */
export function bucketIndexForDate(buckets: TimesheetBucket[], date: string): number {
  for (let i = 0; i < buckets.length; i += 1) {
    if (buckets[i].start <= date && date <= buckets[i].end) return i
  }
  return -1
}
