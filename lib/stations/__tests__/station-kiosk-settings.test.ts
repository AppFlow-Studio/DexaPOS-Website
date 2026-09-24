import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STATION_KIOSK_SETTINGS,
  KIOSK_SEAT_LABEL_MAX,
  buildSeatRange,
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
      seat_selection_enabled: true,
      seat_options: [{ id: 'a', label: 'Table 6 — Seat 2' }],
    })
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
    expect(
      isStationKioskSettingsDirty(a, { ...a, seat_options: [{ id: 'a', label: 'T2' }] }),
    ).toBe(true)
  })
})
