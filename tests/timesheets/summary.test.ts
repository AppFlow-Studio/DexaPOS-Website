import { describe, expect, it } from 'vitest'

import { bucketsForPeriod, periodContaining } from '@/lib/timesheets/period'
import {
  buildRows,
  computeTiles,
  filterRows,
  reviewCounts,
  sortRows,
  sumRows,
} from '@/lib/timesheets/summary'

import { employee, payload, shift } from './fixtures'

const week = bucketsForPeriod(periodContaining('week', '2026-09-07'))

// Jordan: the design canvas's week — 6 shifts, 49h, 9h overtime, paid per shift.
const jordanShifts = [
  shift({ staffProfileId: 'jr', localDate: '2026-09-07', netMinutes: 360, payCents: 11_400 }),
  shift({ staffProfileId: 'jr', localDate: '2026-09-08', netMinutes: 555, payCents: 17_575, isOvernight: true }),
  shift({ staffProfileId: 'jr', localDate: '2026-09-09', netMinutes: 480, payCents: 15_200 }),
  shift({ staffProfileId: 'jr', localDate: '2026-09-10', netMinutes: 510, payCents: 16_150 }),
  shift({ staffProfileId: 'jr', localDate: '2026-09-11', netMinutes: 540, otMinutes: 45, payCents: 17_812 }),
  shift({ staffProfileId: 'jr', localDate: '2026-09-12', netMinutes: 495, otMinutes: 495, payCents: 23_512 }),
]
const data = payload(
  [employee('jr', 'Jordan Reyes', 'Bartender'), employee('hs', 'Hana Sato', 'Barista'), employee('op', 'Owen Price', 'Busser')],
  [
    ...jordanShifts,
    shift({ staffProfileId: 'hs', localDate: '2026-09-07', netMinutes: 390, rate: 0, payCents: null }),
    shift({ staffProfileId: 'hs', localDate: '2026-09-12', netMinutes: 0, rate: 0, payCents: null, isOpen: true, isMissingOut: true, clockOut: null }),
    // Outside the week: must be ignored, not bucketed.
    shift({ staffProfileId: 'hs', localDate: '2026-09-14', netMinutes: 480 }),
  ]
)

describe('buildRows', () => {
  const rows = buildRows(data, week)
  const [jordan, hana, owen] = rows

  it('sums a person’s shifts into day cells and totals', () => {
    expect(jordan.cells.map((c) => c.minutes)).toEqual([360, 555, 480, 510, 540, 495, 0])
    expect(jordan.totalMinutes).toBe(2940) // 49.00 h
    expect(jordan.otMinutes).toBe(540) // 9.00 h
    expect(jordan.cells[1].hasOvernight).toBe(true)
  })

  it('makes pay the exact sum of per-shift cents', () => {
    expect(jordan.payCents).toBe(101_649) // $1,016.49, not the week-level $1,016.50
    expect(jordan.payState).toBe('ok')
  })

  it('marks people without a pay rate instead of pricing them at $0', () => {
    expect(hana.payState).toBe('none')
    expect(hana.shiftsWithoutRate).toBe(2)
    expect(hana.missingOutCount).toBe(1)
    expect(hana.cells[5].hasMissingOut).toBe(true)
  })

  it('keeps members with no shifts as rows — absence is signal', () => {
    expect(owen.shiftCount).toBe(0)
    expect(owen.payState).toBe('empty')
  })
})

describe('totals', () => {
  const rows = buildRows(data, week)

  it('makes every footer figure the sum of the rows above it', () => {
    const totals = sumRows(rows, week.length)
    expect(totals.cells[0].minutes).toBe(360 + 390)
    expect(totals.totalMinutes).toBe(rows.reduce((n, r) => n + r.totalMinutes, 0))
    expect(totals.payCents).toBe(101_649)
  })

  it('reports tiles for the whole location', () => {
    expect(computeTiles(rows)).toEqual({
      totalMinutes: 3330,
      memberCount: 3,
      shiftCount: 8,
      otMinutes: 540,
      otPeople: 1,
      laborCents: 101_649,
      peopleWithoutRate: 1,
    })
  })

  it('counts review items: shifts for clock-outs and length, people for rates', () => {
    expect(reviewCounts(rows)).toEqual({ missing: 1, long: 0, norate: 1 })
  })
})

describe('filter and sort', () => {
  const rows = buildRows(data, week)

  it('filters by review item and by name or role', () => {
    expect(filterRows(rows, { search: '', review: 'missing' }).map((r) => r.employee.displayName)).toEqual(['Hana Sato'])
    expect(filterRows(rows, { search: 'bart', review: null }).map((r) => r.employee.displayName)).toEqual(['Jordan Reyes'])
  })

  it('sorts by total, breaking ties by name', () => {
    const sorted = sortRows(rows, { key: 'total', direction: 'desc' })
    expect(sorted.map((r) => r.employee.displayName)).toEqual(['Jordan Reyes', 'Hana Sato', 'Owen Price'])
  })
})

describe('month buckets', () => {
  it('adds a month’s weekly overtime without recomputing it', () => {
    const month = bucketsForPeriod(periodContaining('month', '2026-08-15'))
    const august = payload(
      [employee('jr', 'Jordan Reyes')],
      [
        shift({ staffProfileId: 'jr', localDate: '2026-08-01', netMinutes: 495, otMinutes: 135 }),
        shift({ staffProfileId: 'jr', localDate: '2026-08-05', netMinutes: 600, otMinutes: 240 }),
        shift({ staffProfileId: 'jr', localDate: '2026-08-31', netMinutes: 540 }),
      ]
    )
    const [row] = buildRows(august, month)
    expect(row.cells.map((c) => c.otMinutes)).toEqual([135, 240, 0, 0, 0, 0])
    expect(row.otMinutes).toBe(375)
    expect(row.cells[5].minutes).toBe(540)
  })
})
