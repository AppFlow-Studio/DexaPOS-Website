'use server'

// ============================================================================
// Station menu scope — server actions for the station editor's Menus tab.
//
// Reads go straight to the tables under RLS (location.menu.view). The write
// goes through ONE RPC, set_station_menu_scope, which replaces the station's
// selection atomically so a tablet syncing mid-save can never observe a
// half-written list. See supabase/migrations/20260919120000_station_menu_scope.sql.
// ============================================================================

import { revalidatePath } from 'next/cache'

import { normalizeMenuChannelVisibility } from '@/lib/menu/menu-channel-visibility'
import {
  isMissingStationMenuScopeSchema,
  normalizeStationMenuScope,
  type StationCoverageInput,
  type StationMenuLink,
  type StationMenuOption,
  type StationMenuScope,
} from '@/lib/stations/station-menu-scope'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import { LogAuditEvent } from './audit-logs'

export interface StationMenuScopeState {
  scope: StationMenuScope
  menuIds: string[]
  /**
   * True when this environment has not run the station-scope migration yet.
   * The editor then shows every station as "All menus" with the controls
   * disabled, instead of a broken form.
   */
  schemaMissing: boolean
}

interface StationScopeRow {
  id: string
  station_name: string
  station_type: string
  location_id: string
  merchant_id: string
  menu_scope: string | null
}

interface StationMenuRow {
  menu_id: string
}

interface MenuRow {
  id: string
  name: string
  is_active: boolean
  location_id: string | null
}

interface LocationMenuRow {
  menu_id: string
  is_active: boolean
  is_visible_on_pos: boolean | null
  is_visible_on_kiosk: boolean | null
  is_visible_online: boolean | null
}

const ALL_MENUS: StationMenuScopeState = {
  scope: 'all',
  menuIds: [],
  schemaMissing: false,
}

/** The station's saved scope and selected menu ids. */
export async function getStationMenuScope(
  stationId: string,
): Promise<{ data: StationMenuScopeState | null; error: string | null }> {
  if (!stationId) return { data: null, error: 'Station id is required.' }

  const supabase = createServerSupabaseClient()

  const { data: station, error: stationError } = await supabase
    .from('stations')
    .select('id, menu_scope')
    .eq('id', stationId)
    .single()

  if (stationError) {
    if (isMissingStationMenuScopeSchema(stationError)) {
      return { data: { ...ALL_MENUS, schemaMissing: true }, error: null }
    }
    console.error('[getStationMenuScope] station:', stationError)
    return { data: null, error: stationError.message }
  }

  const scope = normalizeStationMenuScope(
    (station as Pick<StationScopeRow, 'menu_scope'> | null)?.menu_scope,
  )

  const { data: rows, error: rowsError } = await supabase
    .from('station_menus')
    .select('menu_id')
    .eq('station_id', stationId)

  if (rowsError) {
    if (isMissingStationMenuScopeSchema(rowsError)) {
      return { data: { ...ALL_MENUS, schemaMissing: true }, error: null }
    }
    console.error('[getStationMenuScope] station_menus:', rowsError)
    return { data: null, error: rowsError.message }
  }

  const menuIds = ((rows ?? []) as StationMenuRow[]).map((row) => row.menu_id)
  return { data: { scope, menuIds, schemaMissing: false }, error: null }
}

/**
 * Every menu a station at this location could render: the merchant's global
 * menus plus the location's own, with the location's active flag and channel
 * visibility so the editor can warn about a selection the channel toggle will
 * hide anyway.
 */
export async function getStationMenuOptions(
  locationId: string,
): Promise<{ data: StationMenuOption[]; error: string | null }> {
  if (!locationId || locationId === 'all') {
    return { data: [], error: 'Select a location first.' }
  }

  const supabase = createServerSupabaseClient()

  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('merchant_id, uses_global_menu')
    .eq('id', locationId)
    .single()

  if (locationError || !location) {
    console.error('[getStationMenuOptions] location:', locationError)
    return { data: [], error: locationError?.message ?? 'Location not found.' }
  }

  const merchantId = (location as { merchant_id: string }).merchant_id
  const usesGlobalMenu =
    (location as { uses_global_menu: boolean | null }).uses_global_menu !==
    false

  const [{ data: menus, error: menusError }, { data: locationMenus, error: lmError }] =
    await Promise.all([
      supabase
        .from('menus')
        .select('id, name, is_active, location_id')
        .eq('merchant_id', merchantId)
        .or(`location_id.is.null,location_id.eq.${locationId}`)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
      supabase
        .from('location_menus')
        .select(
          'menu_id, is_active, is_visible_on_pos, is_visible_on_kiosk, is_visible_online',
        )
        .eq('location_id', locationId),
    ])

  if (menusError) {
    console.error('[getStationMenuOptions] menus:', menusError)
    return { data: [], error: menusError.message }
  }
  if (lmError) {
    console.error('[getStationMenuOptions] location_menus:', lmError)
    return { data: [], error: lmError.message }
  }

  const byMenu = new Map(
    ((locationMenus ?? []) as LocationMenuRow[]).map((row) => [row.menu_id, row]),
  )

  const options: StationMenuOption[] = ((menus ?? []) as MenuRow[]).map((menu) => {
    const assignment = byMenu.get(menu.id)
    const visibility = normalizeMenuChannelVisibility(assignment)
    // Same inheritance rule as GetLocationMenus / GetMenus: an explicit
    // location_menus row wins; a global menu without one inherits the
    // location's global-menu setting; a location-owned menu is its own switch.
    const activeAtLocation = assignment
      ? assignment.is_active
      : menu.location_id
        ? menu.is_active
        : menu.is_active && usesGlobalMenu

    return {
      id: menu.id,
      name: menu.name,
      is_active: menu.is_active,
      is_active_at_location: activeAtLocation,
      is_visible_on_pos: visibility.is_visible_on_pos,
      is_visible_on_kiosk: visibility.is_visible_on_kiosk,
    }
  })

  return { data: options, error: null }
}

export interface LocationStationMenuCoverage {
  /** Active, non-KDS stations at the location, in the order the Stations page lists them. */
  stations: StationCoverageInput[]
  /** Every station_menus row at the location; the client joins per menu. */
  stationMenus: StationMenuLink[]
  schemaMissing: boolean
}

interface CoverageStationRow {
  id: string
  station_name: string
  station_type: string
  menu_scope?: string | null
}

/**
 * One fetch that lets the menu page say, for every menu, which stations show
 * it. Deactivated stations are left out: they are not serving, and counting
 * them would make "2 of 5 stations" read like a problem when it is not.
 */
export async function getLocationStationMenuCoverage(
  locationId: string,
): Promise<{ data: LocationStationMenuCoverage | null; error: string | null }> {
  if (!locationId || locationId === 'all') {
    return { data: null, error: 'Select a location first.' }
  }

  const supabase = createServerSupabaseClient()

  const baseQuery = () =>
    supabase
      .from('stations')
      .select('id, station_name, station_type, menu_scope')
      .eq('location_id', locationId)
      .eq('is_active', true)
      .neq('station_type', 'kds')
      .order('station_number', { ascending: true, nullsFirst: false })
      .order('station_name', { ascending: true })

  let schemaMissing = false
  let stationRows: CoverageStationRow[] = []

  const first = await baseQuery()
  if (first.error) {
    if (!isMissingStationMenuScopeSchema(first.error)) {
      console.error('[getLocationStationMenuCoverage] stations:', first.error)
      return { data: null, error: first.error.message }
    }
    // Column not there yet: read the stations without it and treat every one
    // as `all`, which is exactly what the tablet does on that environment.
    schemaMissing = true
    const retry = await supabase
      .from('stations')
      .select('id, station_name, station_type')
      .eq('location_id', locationId)
      .eq('is_active', true)
      .neq('station_type', 'kds')
      .order('station_number', { ascending: true, nullsFirst: false })
      .order('station_name', { ascending: true })
    if (retry.error) {
      console.error('[getLocationStationMenuCoverage] stations (retry):', retry.error)
      return { data: null, error: retry.error.message }
    }
    stationRows = (retry.data ?? []) as CoverageStationRow[]
  } else {
    stationRows = (first.data ?? []) as CoverageStationRow[]
  }

  let stationMenus: StationMenuLink[] = []
  if (!schemaMissing) {
    const { data: links, error: linksError } = await supabase
      .from('station_menus')
      .select('station_id, menu_id')
      .eq('location_id', locationId)
    if (linksError) {
      if (!isMissingStationMenuScopeSchema(linksError)) {
        console.error('[getLocationStationMenuCoverage] station_menus:', linksError)
        return { data: null, error: linksError.message }
      }
      schemaMissing = true
    } else {
      stationMenus = (links ?? []) as StationMenuLink[]
    }
  }

  return {
    data: {
      stations: stationRows.map((row) => ({
        id: row.id,
        station_name: row.station_name,
        station_type: row.station_type,
        menu_scope: row.menu_scope ?? null,
      })),
      stationMenus,
      schemaMissing,
    },
    error: null,
  }
}

/**
 * Replace the station's scope and selection in one transaction.
 * `menuIds` is ignored when `scope` is `all`.
 */
export async function setStationMenuScope(
  stationId: string,
  scope: StationMenuScope,
  menuIds: string[],
): Promise<{
  success: boolean
  data?: { scope: StationMenuScope; menuIds: string[] }
  error?: string
}> {
  if (!stationId) return { success: false, error: 'Station id is required.' }
  if (scope !== 'all' && scope !== 'selected') {
    return { success: false, error: 'Scope must be all or selected.' }
  }

  const supabase = createServerSupabaseClient()

  // Snapshot for the audit trail before the write.
  const [{ data: station, error: stationError }, before] = await Promise.all([
    supabase
      .from('stations')
      .select('id, station_name, station_type, location_id, merchant_id, menu_scope')
      .eq('id', stationId)
      .single(),
    getStationMenuScope(stationId),
  ])

  if (stationError || !station) {
    if (isMissingStationMenuScopeSchema(stationError)) {
      return {
        success: false,
        error: 'Per-station menus are not deployed to this environment yet.',
      }
    }
    return { success: false, error: stationError?.message ?? 'Station not found.' }
  }

  const stationRow = station as StationScopeRow
  if (stationRow.station_type === 'kds') {
    return { success: false, error: 'A KDS station does not render a menu.' }
  }

  const uniqueIds =
    scope === 'selected' ? Array.from(new Set(menuIds.filter(Boolean))) : []

  const { data, error } = await supabase.rpc('set_station_menu_scope', {
    p_station_id: stationId,
    p_scope: scope,
    p_menu_ids: uniqueIds,
  })

  if (error) {
    console.error('[setStationMenuScope] rpc:', error)
    if (isMissingStationMenuScopeSchema(error)) {
      return {
        success: false,
        error: 'Per-station menus are not deployed to this environment yet.',
      }
    }
    if (error.code === '42501') {
      return {
        success: false,
        error: 'You do not have permission to manage menus for this location.',
      }
    }
    return { success: false, error: error.message }
  }

  const result = (data ?? {}) as { menu_scope?: string; menu_ids?: string[] }
  const saved = {
    scope: normalizeStationMenuScope(result.menu_scope ?? scope),
    menuIds: Array.isArray(result.menu_ids) ? result.menu_ids : uniqueIds,
  }

  await LogAuditEvent({
    merchantId: stationRow.merchant_id,
    locationId: stationRow.location_id,
    action: `Updated Station Menus: ${stationRow.station_name}`,
    actionCategory: 'settings',
    resourceType: 'station',
    resourceId: stationRow.id,
    resourceName: stationRow.station_name,
    changes: {
      before: before.data
        ? { menu_scope: before.data.scope, menu_ids: before.data.menuIds }
        : undefined,
      after: { menu_scope: saved.scope, menu_ids: saved.menuIds },
    },
    metadata: { station_type: stationRow.station_type },
  })

  revalidatePath(`/dashboard/settings/stations/${stationId}`)
  revalidatePath('/dashboard/settings/stations')

  return { success: true, data: saved }
}
