import 'server-only'

import {
  isMenuVisibleOnline,
  isMissingMenuVisibilitySchema,
} from './menu-channel-visibility'

export const ONLINE_VISIBILITY_BLOCK_MESSAGE =
  'This menu is hidden from Online Ordering for the selected location. Enable Online Ordering visibility before designating or publishing it.'

export async function getMenuOnlineVisibility(
  supabase: any,
  locationId: string,
  menuId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('location_menus')
    .select('is_visible_online')
    .eq('location_id', locationId)
    .eq('menu_id', menuId)
    .maybeSingle()

  if (error) {
    if (isMissingMenuVisibilitySchema(error)) {
      console.warn(
        '[menu-channel-visibility] Visibility columns are not deployed; using visible defaults:',
        error.message,
      )
      return true
    }

    throw new Error(`Unable to verify online menu visibility: ${error.message}`)
  }

  return isMenuVisibleOnline(data)
}

export async function filterOnlineVisibleMenuIds(
  supabase: any,
  locationId: string,
  menuIds: string[],
): Promise<string[]> {
  if (menuIds.length === 0) return []

  const { data, error } = await supabase
    .from('location_menus')
    .select('menu_id, is_visible_online')
    .eq('location_id', locationId)
    .in('menu_id', menuIds)

  if (error) {
    if (isMissingMenuVisibilitySchema(error)) return menuIds
    throw new Error(`Unable to filter online-visible menus: ${error.message}`)
  }

  const hidden = new Set(
    (data ?? [])
      .filter((row: { is_visible_online?: boolean | null }) => row.is_visible_online === false)
      .map((row: { menu_id: string }) => row.menu_id),
  )

  return menuIds.filter((menuId) => !hidden.has(menuId))
}
