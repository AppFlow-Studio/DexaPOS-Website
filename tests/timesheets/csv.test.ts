import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'

import { csvFileName, detailCsvRows, guardCell, summaryCsvRows, toCsv } from '@/lib/timesheets/csv'
import { formatHoursPlain } from '@/lib/timesheets/format'
import { bucketsForPeriod, periodContaining } from '@/lib/timesheets/period'
import { buildRows, sumRows } from '@/lib/timesheets/summary'

import { employee, payload, shift } from './fixtures'

const week = bucketsForPeriod(periodContaining('week', '2026-09-07'))
const data = payload(
  [employee('jr', 'Jordan Reyes', 'Bartender'), employee('hs', '=HYPERLINK("x")', 'Barista')],
  [
    shift({ staffProfileId: 'jr', localDate: '2026-09-07', netMinutes: 360, payCents: 11_400 }),
    shift({ staffProfileId: 'jr', localDate: '2026-09-12', netMinutes: 495, otMinutes: 495, payCents: 23_512 }),
    shift({ staffProfileId: 'hs', localDate: '2026-09-08', netMinutes: 390, rate: 0, payCents: null }),
  ]
)
const rows = buildRows(data, week)
const totals = sumRows(rows, week.length)

describe('Summary CSV', () => {
  const csv = summaryCsvRows(rows, totals, week)

  it('mirrors the grid: header, one row per person, totals last', () => {
    expect(csv[0]).toEqual([
      'Team member', 'Role',
      'Mon Sep 7', 'Tue Sep 8', 'Wed Sep 9', 'Thu Sep 10', 'Fri Sep 11', 'Sat Sep 12', 'Sun Sep 13',
      'Total hours', 'Overtime hours', 'Est. pay', 'Note',
    ])
    expect(csv[1].slice(0, 2)).toEqual(['Jordan Reyes', 'Bartender'])
    expect(csv[1][2]).toBe('6.00')
    expect(csv[1][3]).toBe('') // no shift that day
    expect(csv.at(-1)?.[0]).toBe('Total')
  })

  it('uses exactly the figures the screen formats', () => {
    expect(csv[1][9]).toBe(formatHoursPlain(rows[0].totalMinutes))
    expect(csv[1][11]).toBe('349.12')
  })

  it('leaves pay blank for someone with no pay rate, and says why', () => {
    expect(csv[2][11]).toBe('')
    expect(csv[2][12]).toBe('No pay rate')
  })
})

describe('Shift detail CSV', () => {
  const detail = detailCsvRows(data)

  it('writes one row per shift with offset timestamps', () => {
    expect(detail).toHaveLength(4)
    const jordanMonday = detail.find((r) => r[2] === '2026-09-07')!
    expect(jordanMonday[3]).toBe('2026-09-07T10:00:00-04:00')
  })

  it('adds up to the summary total to the cent', () => {
    const cents = detail
      .slice(1)
      .map((r) => r[10])
      .filter((v): v is string => typeof v === 'string' && v !== '')
      .reduce((n, v) => n + Math.round(Number(v) * 100), 0)
    expect(cents).toBe(totals.payCents)
  })
})

describe('file safety', () => {
  it('neutralises spreadsheet formulas', () => {
    expect(guardCell('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")')
    expect(guardCell('-5')).toBe("'-5")
    expect(guardCell(12)).toBe(12)
  })

  it('starts with a BOM and parses back to the same cells', () => {
    const text = toCsv([['Café Ñandú', '8.00']])
    expect(text.startsWith('﻿')).toBe(true)
    expect(Papa.parse<string[]>(text.slice(1)).data[0]).toEqual(['Café Ñandú', '8.00'])
  })

  it('names files by kind, location and range', () => {
    expect(csvFileName('summary', 'Uptown Branch', '2026-09-07', '2026-09-13')).toBe(
      'timesheets-summary_uptown-branch_2026-09-07_2026-09-13.csv'
    )
  })
})
