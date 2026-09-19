/**
 * Per-station menu scope — pure helpers shared by the station editor's Menus
 * tab, its server actions and their tests.
 *
 * A station renders a menu iff the menu's channel flag is on for that
 * station's type AND (scope = 'all' OR the menu is selected for the station).
 * The channel toggle always wins, which is why the editor warns inline when a
 * selected menu is hidden on the station's channel.
 */

export type StationMenuScope = 'all' | 'selected'

/** The two channels a station can render a menu on. KDS has no menu rail. */
export type StationMenuChannel = 'pos' | 'kiosk'

export interface StationMenuOption {
  id: string
  name: string
  /** menus.is_active — the merchant-wide switch. */
  is_active: boolean
  /** Whether the location serves this menu at all (location_menus / inherit). */
  is_active_at_location: boolean
  is_visible_on_pos: boolean
  is_visible_on_kiosk: boolean
}

export interface StationMenuSelection {
  scope: StationMenuScope
  menuIds: string[]
}

type PostgrestErrorLike = {
  code?: string | null
  message?: string | null
}

export function normalizeStationMenuScope(value: unknown): StationMenuScope {
  return value === 'selected' ? 'selected' : 'all'
}

/**
 * `self_service` is the kiosk; every other non-KDS type is staff POS. Mirrors
 * `stationKind` / `channelForStationType` in the Dexa-POS repo.
 */
export function stationMenuChannel(
  stationType: string | null | undefined,
): StationMenuChannel {
  return stationType === 'self_service' ? 'kiosk' : 'pos'
}

export function stationMenuChannelLabel(channel: StationMenuChannel): string {
  return channel === 'kiosk' ? 'Kiosk' : 'POS'
}

/** True when the location's channel toggle would hide this menu on this station. */
export function isMenuHiddenOnStationChannel(
  menu: Pick<StationMenuOption, 'is_visible_on_pos' | 'is_visible_on_kiosk'>,
  channel: StationMenuChannel,
): boolean {
  return channel === 'kiosk'
    ? menu.is_visible_on_kiosk === false
    : menu.is_visible_on_pos === false
}

/**
 * Set-equality on the selection, so reordering the checklist is never a
 * "change". Ids only matter for the selected scope.
 */
export function isStationMenuSelectionDirty(
  saved: StationMenuSelection,
  draft: StationMenuSelection,
): boolean {
  if (saved.scope !== draft.scope) return true
  if (draft.scope === 'all') return false
  const a = new Set(saved.menuIds)
  const b = new Set(draft.menuIds)
  if (a.size !== b.size) return true
  for (const id of a) if (!b.has(id)) return true
  return false
}

// ---------------------------------------------------------------------------
// Coverage — the menu-page view of the same data.
//
// The station editor answers "which menus does this station show?". The menu
// page needs the transpose: "which stations show this menu, and why not the
// others?" Same rule, read from the other side of the junction. Computed on
// the client from one location-wide fetch so a list of 30 menus costs one
// query, not 30.
// ---------------------------------------------------------------------------

export interface StationCoverageInput {
  id: string
  station_name: string
  station_type: string
  /** Null when the environment has not run the scope migration: reads as all. */
  menu_scope: string | null
}

export interface StationMenuLink {
  station_id: string
  menu_id: string
}

/**
 * Why a station does or does not show a menu. `channel` is reported ahead of
 * `scope`: the channel toggle is the outer gate and the fix for it lives on
 * this very page, so it is the reason worth reading first.
 */
export type StationMenuCoverageReason = 'shown' | 'channel' | 'scope'

export interface StationMenuCoverageEntry {
  stationId: string
  stationName: string
  channel: StationMenuChannel
  shows: boolean
  reason: StationMenuCoverageReason
}

export interface MenuStationCoverage {
  entries: StationMenuCoverageEntry[]
  shownCount: number
  total: number
}

export function computeMenuStationCoverage(
  menuId: string,
  visibility: Pick<StationMenuOption, 'is_visible_on_pos' | 'is_visible_on_kiosk'>,
  stations: readonly StationCoverageInput[],
  stationMenus: readonly StationMenuLink[],
): MenuStationCoverage {
  const selectedOn = new Set(
    stationMenus.filter((row) => row.menu_id === menuId).map((row) => row.station_id),
  )

  const entries: StationMenuCoverageEntry[] = stations
    .filter((station) => station.station_type !== 'kds')
    .map((station) => {
      const channel = stationMenuChannel(station.station_type)
      const channelOn = !isMenuHiddenOnStationChannel(visibility, channel)
      const scopeOk =
        normalizeStationMenuScope(station.menu_scope) === 'all' ||
        selectedOn.has(station.id)
      const reason: StationMenuCoverageReason = !channelOn
        ? 'channel'
        : !scopeOk
          ? 'scope'
          : 'shown'
      return {
        stationId: station.id,
        stationName: station.station_name,
        channel,
        shows: reason === 'shown',
        reason,
      }
    })

  return {
    entries,
    shownCount: entries.filter((entry) => entry.shows).length,
    total: entries.length,
  }
}

/** "All 4 stations" / "2 of 4 stations" / "No stations" — the pill's text. */
export function describeMenuStationCoverage(
  coverage: Pick<MenuStationCoverage, 'shownCount' | 'total'>,
): string {
  if (coverage.total === 0) return 'No stations'
  if (coverage.shownCount === 0) return `None of ${coverage.total} stations`
  if (coverage.shownCount === coverage.total) {
    return coverage.total === 1 ? 'The only station' : `All ${coverage.total} stations`
  }
  return `${coverage.shownCount} of ${coverage.total} stations`
}

/**
 * The one read failure that may fall back to "all menus, no controls": the
 * shared migration has not been deployed to this environment yet. Anything
 * else is a real error and must surface.
 */
export function isMissingStationMenuScopeSchema(
  error?: PostgrestErrorLike | null,
): boolean {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  const mentionsScope =
    message.includes('menu_scope') ||
    message.includes('station_menus') ||
    message.includes('set_station_menu_scope')
  return (
    mentionsScope &&
    (error.code === '42703' || // undefined column
      error.code === '42P01' || // undefined table
      error.code === '42883' || // undefined function
      error.code === 'PGRST202' || // function not in schema cache
      error.code === 'PGRST204' || // column not in schema cache
      message.includes('does not exist') ||
      message.includes('schema cache'))
  )
}
