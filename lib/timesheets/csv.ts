/**
 * The two timesheet exports.
 *
 * Both are serialised from the payload the screen already rendered, through
 * the same formatters, so a file can never disagree with the page it came
 * from (ticket AC). Figures are written plain — "1016.49", not "$1,016.49" —
 * so a spreadsheet reads them as numbers.
 */

import Papa from 'papaparse'

import { formatHoursPlain, formatMoneyPlain, isoWithOffset } from './format'
import type { TimesheetBucket } from './period'
import type { SummaryRow, SummaryTotals } from './summary'
import type { TimesheetEmployee, TimesheetShift, TimesheetSummaryPayload } from './types'

type Cell = string | number
export type CsvRows = Cell[][]

/**
 * A cell that opens with = + - @ (or a tab/CR) is run as a formula by Excel and
 * Sheets. Staff names and notes are typed by people, so neutralise them.
 */
export function guardCell(value: Cell): Cell {
  if (typeof value !== 'string') return value
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** UTF-8 BOM first, so Excel opens accented names correctly. */
export function toCsv(rows: CsvRows): string {
  return '﻿' + Papa.unparse(rows.map((row) => row.map(guardCell)), { newline: '\r\n' })
}

function payCell(row: SummaryRow): string {
  return row.payState === 'none' || row.payState === 'empty' ? '' : formatMoneyPlain(row.payCents)
}

function bucketHeader(bucket: TimesheetBucket): string {
  return bucket.kind === 'day' ? `${bucket.label} ${bucket.sublabel}` : bucket.label
}

/** The grid as rendered: the rows and columns on screen, then the totals row. */
export function summaryCsvRows(
  rows: SummaryRow[],
  totals: SummaryTotals,
  buckets: TimesheetBucket[]
): CsvRows {
  const header = [
    'Team member',
    'Role',
    ...buckets.map(bucketHeader),
    'Total hours',
    'Overtime hours',
    'Est. pay',
    'Note',
  ]
  const body = rows.map((row) => [
    row.employee.displayName,
    row.employee.roleName ?? '',
    ...row.cells.map((cell) => (cell.shiftIds.length ? formatHoursPlain(cell.minutes) : '')),
    formatHoursPlain(row.totalMinutes),
    formatHoursPlain(row.otMinutes),
    payCell(row),
    row.payState === 'none'
      ? 'No pay rate'
      : row.payState === 'partial'
        ? `${row.shiftsWithoutRate} shift(s) without a pay rate not counted`
        : row.missingOutCount > 0
          ? `${row.missingOutCount} missing clock-out(s) not counted`
          : '',
  ])
  const footer = [
    'Total',
    '',
    ...totals.cells.map((cell) => formatHoursPlain(cell.minutes)),
    formatHoursPlain(totals.totalMinutes),
    formatHoursPlain(totals.otMinutes),
    formatMoneyPlain(totals.payCents),
    '',
  ]
  return [header, ...body, footer]
}

function shiftFlags(shift: TimesheetShift): string {
  const flags: string[] = []
  if (shift.isMissingOut) flags.push('Missing clock-out')
  if (shift.isOnClock) flags.push('On clock')
  if (shift.isOvernight) flags.push('Ends next day')
  if (shift.isOverMax) flags.push('Over 16 hours')
  if (shift.payCents === null) flags.push('No pay rate')
  if (shift.isEdited) flags.push('Edited by manager')
  if (shift.isAutoClosed) flags.push('Closed automatically')
  return flags.join('; ')
}

/** One row per shift for the whole period, ignoring on-screen filters. */
export function detailCsvRows(payload: TimesheetSummaryPayload): CsvRows {
  const zone = payload.meta.timezone
  const people = new Map<string, TimesheetEmployee>(
    payload.employees.map((e) => [e.staffProfileId, e])
  )
  const header = [
    'Team member',
    'Role',
    'Date',
    'Clock in',
    'Clock out',
    'Unpaid break minutes',
    'Paid break minutes',
    'Hours',
    'Overtime hours',
    'Hourly rate',
    'Est. pay',
    'Flags',
  ]
  const shifts = [...payload.shifts].sort((a, b) => {
    const nameA = people.get(a.staffProfileId)?.displayName ?? ''
    const nameB = people.get(b.staffProfileId)?.displayName ?? ''
    return nameA.localeCompare(nameB, 'en', { sensitivity: 'base' }) || a.clockIn.localeCompare(b.clockIn)
  })
  const body = shifts.map((shift) => {
    const person = people.get(shift.staffProfileId)
    return [
      person?.displayName ?? '',
      person?.roleName ?? '',
      shift.localDate,
      isoWithOffset(shift.clockIn, zone),
      shift.clockOut ? isoWithOffset(shift.clockOut, zone) : '',
      shift.unpaidBreakMinutes,
      shift.paidBreakMinutes,
      formatHoursPlain(shift.netMinutes),
      formatHoursPlain(shift.otMinutes),
      shift.rate > 0 ? formatMoneyPlain(Math.round(shift.rate * 100)) : '',
      shift.payCents === null ? '' : formatMoneyPlain(shift.payCents),
      shiftFlags(shift),
    ]
  })
  return [header, ...body]
}

function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'location'
  )
}

export function csvFileName(
  kind: 'summary' | 'shifts',
  locationName: string,
  start: string,
  end: string
): string {
  return `timesheets-${kind}_${slug(locationName)}_${start}_${end}.csv`
}
