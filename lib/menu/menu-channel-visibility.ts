export interface MenuChannelVisibility {
  is_visible_on_pos: boolean
  is_visible_on_kiosk: boolean
  is_visible_online: boolean
}

export const DEFAULT_MENU_CHANNEL_VISIBILITY: MenuChannelVisibility = {
  is_visible_on_pos: true,
  is_visible_on_kiosk: true,
  is_visible_online: true,
}

type PartialVisibility = Partial<
  Record<keyof MenuChannelVisibility, boolean | null | undefined>
>

export function normalizeMenuChannelVisibility(
  visibility?: PartialVisibility | null,
): MenuChannelVisibility {
  return {
    is_visible_on_pos: visibility?.is_visible_on_pos !== false,
    is_visible_on_kiosk: visibility?.is_visible_on_kiosk !== false,
    is_visible_online: visibility?.is_visible_online !== false,
  }
}

export function isMenuVisibleOnline(
  visibility?: Pick<PartialVisibility, 'is_visible_online'> | null,
): boolean {
  return visibility?.is_visible_online !== false
}

export function filterMenusVisibleOnline<T extends { id: string }>(
  menus: T[],
  locationRows?: Array<
    { menu_id: string } & Pick<PartialVisibility, 'is_visible_online'>
  > | null,
): T[] {
  const visibilityByMenu = new Map(
    (locationRows ?? []).map((row) => [row.menu_id, row.is_visible_online]),
  )

  return menus.filter((menu) => visibilityByMenu.get(menu.id) !== false)
}
