import { describe, expect, it } from 'vitest'

import {
  filterMenusVisibleOnline,
  isMissingMenuVisibilitySchema,
  normalizeMenuChannelVisibility,
} from '../menu-channel-visibility'

describe('normalizeMenuChannelVisibility', () => {
  it('defaults missing rows and columns to visible', () => {
    expect(normalizeMenuChannelVisibility()).toEqual({
      is_visible_on_pos: true,
      is_visible_on_kiosk: true,
      is_visible_online: true,
    })
    expect(normalizeMenuChannelVisibility({ is_visible_online: null })).toEqual({
      is_visible_on_pos: true,
      is_visible_on_kiosk: true,
      is_visible_online: true,
    })
  })

  it.each([
    ['POS only', false, true, true],
    ['Kiosk only', true, false, true],
    ['Online only', true, true, false],
    ['all channels', false, false, false],
  ])('keeps the %s switch independent', (_, pos, kiosk, online) => {
    expect(
      normalizeMenuChannelVisibility({
        is_visible_on_pos: pos,
        is_visible_on_kiosk: kiosk,
        is_visible_online: online,
      }),
    ).toEqual({
      is_visible_on_pos: pos,
      is_visible_on_kiosk: kiosk,
      is_visible_online: online,
    })
  })
})

describe('filterMenusVisibleOnline', () => {
  const menus = [{ id: 'menu-a' }, { id: 'menu-b' }]

  it('only excludes an explicitly hidden menu', () => {
    expect(
      filterMenusVisibleOnline(menus, [
        { menu_id: 'menu-a', is_visible_online: false },
      ]),
    ).toEqual([{ id: 'menu-b' }])
  })

  it('isolates visibility to the selected location rows', () => {
    const locationA = [{ menu_id: 'menu-a', is_visible_online: false }]
    const locationB = [{ menu_id: 'menu-a', is_visible_online: true }]

    expect(filterMenusVisibleOnline(menus, locationA)).toEqual([{ id: 'menu-b' }])
    expect(filterMenusVisibleOnline(menus, locationB)).toEqual(menus)
  })
})

describe('isMissingMenuVisibilitySchema', () => {
  it('allows the compatibility fallback only for missing visibility columns', () => {
    expect(
      isMissingMenuVisibilitySchema({
        code: '42703',
        message: 'column location_menus.is_visible_online does not exist',
      }),
    ).toBe(true)
    expect(
      isMissingMenuVisibilitySchema({
        code: 'PGRST204',
        message: "Could not find the 'is_visible_on_pos' column in the schema cache",
      }),
    ).toBe(true)
  })

  it('does not fail open for authorization, network, or unrelated schema errors', () => {
    expect(
      isMissingMenuVisibilitySchema({
        code: '42501',
        message: 'permission denied for table location_menus',
      }),
    ).toBe(false)
    expect(
      isMissingMenuVisibilitySchema({
        code: 'PGRST204',
        message: "Could not find the 'unrelated_column' column in the schema cache",
      }),
    ).toBe(false)
  })
})
