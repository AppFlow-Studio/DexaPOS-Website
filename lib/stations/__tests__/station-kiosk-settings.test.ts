import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STATION_KIOSK_SETTINGS,
  KIOSK_SEAT_LABEL_MAX,
  buildSeatRange,
  composeKioskLocationLabel,
  isStationKioskSettingsDirty,
  normalizeSeatOptions,
  normalizeStationKioskSettings,
} from '../station-kiosk-settings'

describe('normalizeStationKioskSettings', () => {
  it('returns defaults for null, arrays and garbage', () => {
    expect(normalizeStationKioskSettings(null)).toEqual(DEFAULT_STATION_KIOSK_SETTINGS)
    expect(normalizeStationKioskSettings([])).toEqual(DEFAULT_STATION_KIOSK_SETTINGS)
    expect(normalizeStationKioskSettings('x')).toEqual(DEFAULT_STATION_KIOSK_SETTINGS)
    expect(
      normalizeStationKioskSettings({ order_types: 'delivery', seat_selection_enabled: 'yes' }),
    ).toEqual(DEFAULT_STATION_KIOSK_SETTINGS)
  })

  it('reads valid values', () => {
    const s = normalizeStationKioskSettings({
      order_types: 'takeout_only',
      dine_in_only_skip_prompt: false,
      seat_selection_enabled: true,
      seat_options: [{ id: 'a', label: 'Table 6 — Seat 2' }],
    })
    expect(s).toEqual({
      order_types: 'takeout_only',
      dine_in_only_skip_prompt: false,
      table_label: null,
      seat_mode: 'ask',
      fixed_seat_label: null,
      seat_selection_enabled: true,
      seat_options: [{ id: 'a', label: 'Table 6 — Seat 2' }],
    })
  })

  it('maps legacy rows without seat_mode from the boolean', () => {
    expect(normalizeStationKioskSettings({ seat_selection_enabled: true }).seat_mode).toBe('ask')
    expect(normalizeStationKioskSettings({ seat_selection_enabled: false }).seat_mode).toBe('off')
  })

  it('reads fixed table + fixed seat and derives the legacy flag', () => {
    const s = normalizeStationKioskSettings({
      table_label: '  Table   1 ',
      seat_mode: 'fixed',
      fixed_seat_label: ' 3 ',
      seat_selection_enabled: true,
    })
    expect(s.table_label).toBe('Table 1')
    expect(s.seat_mode).toBe('fixed')
    expect(s.fixed_seat_label).toBe('3')
    expect(s.seat_selection_enabled).toBe(false)
  })

  it('downgrades fixed with an empty seat label to off', () => {
    const s = normalizeStationKioskSettings({ seat_mode: 'fixed', fixed_seat_label: '  ' })
    expect(s.seat_mode).toBe('off')
    expect(s.fixed_seat_label).toBeNull()
  })
})

describe('composeKioskLocationLabel', () => {
  it('prefixes bare values and joins table + seat', () => {
    expect(composeKioskLocationLabel('1', '3')).toBe('Table 1, Seat 3')
    expect(composeKioskLocationLabel('Counter', 'Seat 3')).toBe('Counter, Seat 3')
    expect(composeKioskLocationLabel('12B', 'Stool')).toBe('Table 12B, Stool')
    expect(composeKioskLocationLabel('Bar Top', 'Stool 3')).toBe('Bar Top, Stool 3')
    expect(composeKioskLocationLabel('Table 1', null)).toBe('Table 1')
    expect(composeKioskLocationLabel(null, '3')).toBe('Seat 3')
    expect(composeKioskLocationLabel(' ', null)).toBe('')
  })
})

describe('normalizeSeatOptions', () => {
  it('trims, drops empties, de-dupes case-insensitively and keeps order', () => {
    const out = normalizeSeatOptions([
      { id: '1', label: '  Table 1 ' },
      { id: '2', label: '' },
      { id: '3', label: 'table 1' },
      'Bar  Seat 6',
      42,
    ])
    expect(out.map((o) => o.label)).toEqual(['Table 1', 'Bar Seat 6'])
    expect(out[0].id).toBe('1')
    expect(out[1].id).toBeTruthy()
  })

  it('clamps label length', () => {
    const [o] = normalizeSeatOptions(['x'.repeat(100)])
    expect(o.label).toHaveLength(KIOSK_SEAT_LABEL_MAX)
  })
})

describe('buildSeatRange', () => {
  it('builds prefixed and bare ranges', () => {
    expect(buildSeatRange('Table', 1, 3)).toEqual(['Table 1', 'Table 2', 'Table 3'])
    expect(buildSeatRange('  ', 4, 5)).toEqual(['4', '5'])
  })

  it('rejects invalid ranges', () => {
    expect(buildSeatRange('T', 5, 1)).toEqual([])
    expect(buildSeatRange('T', 1.5, 3)).toEqual([])
    expect(buildSeatRange('T', 1, 1000)).toEqual([])
  })
})

describe('isStationKioskSettingsDirty', () => {
  it('compares by value, ignoring seat ids', () => {
    const a = {
      ...DEFAULT_STATION_KIOSK_SETTINGS,
      seat_options: [{ id: 'a', label: 'T1' }],
    }
    expect(
      isStationKioskSettingsDirty(a, { ...a, seat_options: [{ id: 'b', label: 'T1' }] }),
    ).toBe(false)
    expect(isStationKioskSettingsDirty(a, { ...a, order_types: 'dine_in_only' })).toBe(true)
    expect(isStationKioskSettingsDirty(a, { ...a, table_label: '1' })).toBe(true)
    expect(isStationKioskSettingsDirty(a, { ...a, seat_mode: 'fixed', fixed_seat_label: '3' })).toBe(true)
    expect(
      isStationKioskSettingsDirty(a, { ...a, seat_options: [{ id: 'a', label: 'T2' }] }),
    ).toBe(true)
  })
})
