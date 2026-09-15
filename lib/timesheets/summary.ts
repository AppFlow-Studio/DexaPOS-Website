/**
 * Turns the RPC's shift rows into everything the summary screen shows.
 *
 * Deliberately arithmetic-free beyond addition: overtime, pay and net minutes
 * are computed once, per shift, in SQL (plan §3). Here we only add integers, so
 * every total is exactly the sum of what sits beneath it — which is what lets
 * the Summary CSV, the Shift detail CSV and the screen agree to the cent.
 */

import { bucketIndexForDate, type TimesheetBucket } from './period'
import type {
  TimesheetEmployee,
  TimesheetReviewFilter,
  TimesheetShift,
  TimesheetSummaryPayload,
} from './types'

export interface SummaryCell {
  minutes: number
  otMinutes: number
  shiftIds: string[]
  hasMissingOut: boolean
  hasOnClock: boolean
  hasOvernight: boolean
  hasOverMax: boolean
}

export type PayState =
  /** Every priced shift has a rate. */
  | 'ok'
  /** Worked, but none of the shifts carries a rate. */
  | 'none'
  /** Some shifts priced, some without a rate. */
  | 'partial'
  /** No shifts in the period — nothing to price. */
  | 'empty'

export interface SummaryRow {
  employee: TimesheetEmployee
  cells: SummaryCell[]
  totalMinutes: number
  otMinutes: number
  payCents: number
  payState: PayState
  shiftCount: number
  missingOutCount: number
  overMaxCount: number
  shiftsWithoutRate: number
}

export interface SummaryTotals {
  cells: { minutes: number; otMinutes: number }[]
  totalMinutes: number
  otMinutes: number
  payCents: number
}

export interface SummaryTiles {
  totalMinutes: number
  memberCount: number
  shiftCount: number
  otMinutes: number
  otPeople: number
  laborCents: number
  peopleWithoutRate: number
}

export interface ReviewCounts {
  missing: number
  long: number
  norate: number
}

export type SummarySortKey = 'name' | 'total' | 'ot' | 'pay'
export interface SummarySort {
  key: SummarySortKey
  direction: 'asc' | 'desc'
}

function emptyCell(): SummaryCell {
  return {
    minutes: 0,
    otMinutes: 0,
    shiftIds: [],
    hasMissingOut: false,
    hasOnClock: false,
    hasOvernight: false,
    hasOverMax: false,
  }
}

/** A shift priced at 0/hr has no pay rate (`hourly_rate_snapshot` is NOT NULL DEFAULT 0). */
export function shiftLacksRate(shift: TimesheetShift): boolean {
  return shift.payCents === null
}

export function buildRows(payload: TimesheetSummaryPayload, buckets: TimesheetBucket[]): SummaryRow[] {
  const byStaff = new Map<string, TimesheetShift[]>()
  for (const shift of payload.shifts) {
    const list = byStaff.get(shift.staffProfileId)
    if (list) list.push(shift)
    else byStaff.set(shift.staffProfileId, [shift])
  }

  return payload.employees.map((employee) => {
    const shifts = byStaff.get(employee.staffProfileId) ?? []
    const cells = buckets.map(emptyCell)
    let totalMinutes = 0
    let otMinutes = 0
    let payCents = 0
    let priced = 0
    let shiftsWithoutRate = 0
    let missingOutCount = 0
    let overMaxCount = 0

    for (const shift of shifts) {
      const index = bucketIndexForDate(buckets, shift.localDate)
      if (index < 0) continue
      const cell = cells[index]
      cell.minutes += shift.netMinutes
      cell.otMinutes += shift.otMinutes
      cell.shiftIds.push(shift.id)
      cell.hasMissingOut ||= shift.isMissingOut
      cell.hasOnClock ||= shift.isOnClock
      cell.hasOvernight ||= shift.isOvernight
      cell.hasOverMax ||= shift.isOverMax

      totalMinutes += shift.netMinutes
      otMinutes += shift.otMinutes
      if (shift.isMissingOut) missingOutCount += 1
      if (shift.isOverMax) overMaxCount += 1
      if (shiftLacksRate(shift)) shiftsWithoutRate += 1
      else {
        payCents += shift.payCents as number
        priced += 1
      }
    }

    const shiftCount = cells.reduce((n, c) => n + c.shiftIds.length, 0)
    const payState: PayState =
      shiftCount === 0 ? 'empty' : shiftsWithoutRate === 0 ? 'ok' : priced === 0 ? 'none' : 'partial'

    return {
      employee,
      cells,
      totalMinutes,
      otMinutes,
      payCents,
      payState,
      shiftCount,
      missingOutCount,
      overMaxCount,
      shiftsWithoutRate,
    }
  })
}

export function sumRows(rows: SummaryRow[], bucketCount: number): SummaryTotals {
  const cells = Array.from({ length: bucketCount }, () => ({ minutes: 0, otMinutes: 0 }))
  let totalMinutes = 0
  let otMinutes = 0
  let payCents = 0
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      cells[i].minutes += cell.minutes
      cells[i].otMinutes += cell.otMinutes
    })
    totalMinutes += row.totalMinutes
    otMinutes += row.otMinutes
    payCents += row.payCents
  }
  return { cells, totalMinutes, otMinutes, payCents }
}

/** Tiles always describe the whole location for the period — never the filtered view. */
export function computeTiles(rows: SummaryRow[]): SummaryTiles {
  let totalMinutes = 0
  let shiftCount = 0
  let otMinutes = 0
  let otPeople = 0
  let laborCents = 0
  let peopleWithoutRate = 0
  for (const row of rows) {
    totalMinutes += row.totalMinutes
    shiftCount += row.shiftCount
    otMinutes += row.otMinutes
    if (row.otMinutes > 0) otPeople += 1
    laborCents += row.payCents
    if (row.shiftsWithoutRate > 0) peopleWithoutRate += 1
  }
  return {
    totalMinutes,
    memberCount: rows.length,
    shiftCount,
    otMinutes,
    otPeople,
    laborCents,
    peopleWithoutRate,
  }
}

export function reviewCounts(rows: SummaryRow[]): ReviewCounts {
  let missing = 0
  let long = 0
  let norate = 0
  for (const row of rows) {
    missing += row.missingOutCount
    long += row.overMaxCount
    if (row.shiftsWithoutRate > 0) norate += 1
  }
  return { missing, long, norate }
}

export function rowMatchesReview(row: SummaryRow, review: TimesheetReviewFilter): boolean {
  if (review === 'missing') return row.missingOutCount > 0
  if (review === 'long') return row.overMaxCount > 0
  return row.shiftsWithoutRate > 0
}

/** Whether a cell is one the active review filter is about — it gets ringed. */
export function cellMatchesReview(cell: SummaryCell, review: TimesheetReviewFilter | null): boolean {
  if (review === 'missing') return cell.hasMissingOut
  if (review === 'long') return cell.hasOverMax
  return false
}

export function filterRows(
  rows: SummaryRow[],
  { search, review }: { search: string; review: TimesheetReviewFilter | null }
): SummaryRow[] {
  const needle = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (review && !rowMatchesReview(row, review)) return false
    if (!needle) return true
    return (
      row.employee.displayName.toLowerCase().includes(needle) ||
      (row.employee.roleName ?? '').toLowerCase().includes(needle)
    )
  })
}

export function sortRows(rows: SummaryRow[], sort: SummarySort): SummaryRow[] {
  const dir = sort.direction === 'asc' ? 1 : -1
  const byName = (a: SummaryRow, b: SummaryRow) =>
    a.employee.displayName.localeCompare(b.employee.displayName, 'en', { sensitivity: 'base' })
  const value = (row: SummaryRow) =>
    sort.key === 'total' ? row.totalMinutes : sort.key === 'ot' ? row.otMinutes : row.payCents
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return dir * byName(a, b)
    const diff = value(a) - value(b)
    return diff !== 0 ? dir * diff : byName(a, b)
  })
}

export function shiftsForCell(
  payload: TimesheetSummaryPayload,
  row: SummaryRow,
  bucketIndex: number
): TimesheetShift[] {
  const ids = new Set(row.cells[bucketIndex]?.shiftIds ?? [])
  return payload.shifts.filter((s) => ids.has(s.id))
}
