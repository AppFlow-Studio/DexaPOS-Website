import { describe, expect, it } from 'vitest'

import {
  computeMenuStationCoverage,
  describeMenuStationCoverage,
  isMenuHiddenOnStationChannel,
  isMissingStationMenuScopeSchema,
  isStationMenuSelectionDirty,
  normalizeStationMenuScope,
  stationMenuChannel,
} from '../station-menu-scope'

describe('normalizeStationMenuScope', () => {
  it('reads selected literally and everything else as all', () => {
    expect(normalizeStationMenuScope('selected')).toBe('selected')
    expect(normalizeStationMenuScope('all')).toBe('all')
    expect(normalizeStationMenuScope(undefined)).toBe('all')
    expect(normalizeStationMenuScope(null)).toBe('all')
    expect(normalizeStationMenuScope('nonsense')).toBe('all')
  })
})

describe('stationMenuChannel', () => {
  it('maps self_service to kiosk and every other type to pos', () => {
    expect(stationMenuChannel('self_service')).toBe('kiosk')
    expect(stationMenuChannel('register')).toBe('pos')
    expect(stationMenuChannel('checkout')).toBe('pos')
    expect(stationMenuChannel(null)).toBe('pos')
  })
})

describe('isMenuHiddenOnStationChannel', () => {
  const menu = { is_visible_on_pos: true, is_visible_on_kiosk: false }

  it('reads the flag for the station channel only', () => {
    expect(isMenuHiddenOnStationChannel(menu, 'kiosk')).toBe(true)
    expect(isMenuHiddenOnStationChannel(menu, 'pos')).toBe(false)
  })
})

describe('isStationMenuSelectionDirty', () => {
  const saved = { scope: 'selected' as const, menuIds: ['a', 'b'] }

  it('is clean for the same set in any order', () => {
    expect(
      isStationMenuSelectionDirty(saved, { scope: 'selected', menuIds: ['b', 'a'] }),
    ).toBe(false)
  })

  it('is dirty when the set or the scope changes', () => {
    expect(
      isStationMenuSelectionDirty(saved, { scope: 'selected', menuIds: ['a'] }),
    ).toBe(true)
    expect(
      isStationMenuSelectionDirty(saved, { scope: 'selected', menuIds: ['a', 'c'] }),
    ).toBe(true)
    expect(isStationMenuSelectionDirty(saved, { scope: 'all', menuIds: [] })).toBe(
      true,
    )
  })

  it('ignores ids once the scope is all', () => {
    expect(
      isStationMenuSelectionDirty(
        { scope: 'all', menuIds: [] },
        { scope: 'all', menuIds: ['a'] },
      ),
    ).toBe(false)
  })
})

describe('computeMenuStationCoverage', () => {
  const stations = [
    { id: 'k1', station_name: 'Sushi Kiosk', station_type: 'self_service', menu_scope: 'selected' },
    { id: 'k2', station_name: 'Counter Kiosk', station_type: 'self_service', menu_scope: 'all' },
    { id: 'r1', station_name: 'Register 1', station_type: 'register', menu_scope: 'selected' },
    { id: 'kds', station_name: 'Kitchen', station_type: 'kds', menu_scope: 'all' },
  ]
  const links = [
    { station_id: 'k1', menu_id: 'sushi' },
    { station_id: 'r1', menu_id: 'drinks' },
  ]
  const visible = { is_visible_on_pos: true, is_visible_on_kiosk: true }

  it('is the transpose of the station view: scope + channel, KDS excluded', () => {
    const coverage = computeMenuStationCoverage('sushi', visible, stations, links)
    expect(coverage.total).toBe(3)
    expect(coverage.shownCount).toBe(2)
    expect(coverage.entries.map((e) => [e.stationId, e.reason])).toEqual([
      ['k1', 'shown'], // selected, and Sushi is ticked
      ['k2', 'shown'], // all
      ['r1', 'scope'], // selected, Sushi not ticked
    ])
  })

  it('reports the channel toggle ahead of the scope, because it wins', () => {
    const kioskOff = { is_visible_on_pos: true, is_visible_on_kiosk: false }
    const coverage = computeMenuStationCoverage('sushi', kioskOff, stations, links)
    expect(coverage.entries.map((e) => [e.stationId, e.reason])).toEqual([
      ['k1', 'channel'],
      ['k2', 'channel'],
      ['r1', 'scope'],
    ])
    expect(coverage.shownCount).toBe(0)
  })

  it('treats a null menu_scope (migration not deployed) as all', () => {
    const undeployed = stations.map((s) => ({ ...s, menu_scope: null }))
    const coverage = computeMenuStationCoverage('sushi', visible, undeployed, [])
    expect(coverage.shownCount).toBe(3)
  })
})

describe('describeMenuStationCoverage', () => {
  it('reads naturally at every count', () => {
    expect(describeMenuStationCoverage({ shownCount: 0, total: 0 })).toBe('No stations')
    expect(describeMenuStationCoverage({ shownCount: 0, total: 3 })).toBe(
      'None of 3 stations',
    )
    expect(describeMenuStationCoverage({ shownCount: 2, total: 3 })).toBe(
      '2 of 3 stations',
    )
    expect(describeMenuStationCoverage({ shownCount: 3, total: 3 })).toBe(
      'All 3 stations',
    )
    expect(describeMenuStationCoverage({ shownCount: 1, total: 1 })).toBe(
      'The only station',
    )
  })
})

describe('isMissingStationMenuScopeSchema', () => {
  it('recognizes the undeployed-migration failures only', () => {
    expect(
      isMissingStationMenuScopeSchema({
        code: '42703',
        message: 'column stations.menu_scope does not exist',
      }),
    ).toBe(true)
    expect(
      isMissingStationMenuScopeSchema({
        code: '42P01',
        message: 'relation "public.station_menus" does not exist',
      }),
    ).toBe(true)
    expect(
      isMissingStationMenuScopeSchema({
        code: 'PGRST202',
        message:
          'Could not find the function public.set_station_menu_scope in the schema cache',
      }),
    ).toBe(true)
  })

  it('does not swallow unrelated errors', () => {
    expect(
      isMissingStationMenuScopeSchema({
        code: '42501',
        message: 'permission denied for table station_menus',
      }),
    ).toBe(false)
    expect(
      isMissingStationMenuScopeSchema({
        code: '42703',
        message: 'column menus.colour does not exist',
      }),
    ).toBe(false)
    expect(isMissingStationMenuScopeSchema(null)).toBe(false)
  })
})
