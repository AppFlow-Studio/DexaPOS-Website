'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MenusModel } from '@/types/db-modles'

// ============================================================================
// TYPES
// ============================================================================

export interface LocationMenu {
  id: string
  location_id: string
  menu_id: string
  is_active: boolean
  display_order: number | null
  created_at: string
  updated_at: string
}

export interface LocationMenuWithDetails extends LocationMenu {
  menu: MenusModel
}

export interface MenuWithLocationStatus extends MenusModel {
  location_menu_id?: string
  is_active_at_location: boolean
  display_order_at_location?: number
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Get all menus available at a location (both global inherited and custom)
 */
export async function GetLocationMenus (
  locationId: string
): Promise<MenuWithLocationStatus[]> {
  if (!locationId) {
    return []
  }

  const supabase = createServerSupabaseClient()

  // First get the location to find its merchant
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('merchant_id, uses_global_menu')
    .eq('id', locationId)
    .single()

  if (locationError || !location) {
    console.error('Error getting location:', locationError)
    return []
  }

  // Get all global menus (menus with no location_id) for this merchant
  const { data: globalMenus, error: menusError } = await supabase
    .from('menus')
    .select('*')
    .eq('merchant_id', location.merchant_id)
    .is('location_id', null)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (menusError) {
    console.error('Error getting global menus:', menusError)
    return []
  }

  // Get location_menus records to see which are active at this location
  const { data: locationMenus, error: lmError } = await supabase
    .from('location_menus')
    .select('*')
    .eq('location_id', locationId)

  if (lmError) {
    console.error('Error getting location menus:', lmError)
    // Continue with empty - all will be treated as active by default
  }

  const locationMenuMap = new Map(
    (locationMenus || []).map(lm => [lm.menu_id, lm])
  )

  // Build result with location status
  // If uses_global_menu is true and no location_menus record exists,
  // the menu is considered active by default (auto-inherit)
  const result: MenuWithLocationStatus[] = globalMenus.map(menu => {
    const locationMenu = locationMenuMap.get(menu.id)

    return {
      ...menu,
      location_menu_id: locationMenu?.id,
      is_active_at_location: locationMenu
        ? locationMenu.is_active
        : location.uses_global_menu, // Default to global menu setting
      display_order_at_location: locationMenu?.display_order
    }
  })

  return result
}

/**
 * Get location menu assignment for a specific menu
 */
export async function GetLocationMenu (
  locationId: string,
  menuId: string
): Promise<LocationMenu | null> {
  if (!locationId || !menuId) {
    return null
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('location_menus')
    .select('*')
    .eq('location_id', locationId)
    .eq('menu_id', menuId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // No record exists
    }
    console.error('Error getting location menu:', error)
    return null
  }

  return data as LocationMenu
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Sync all global menus to a location
 * Creates location_menus records for all global menus that don't have one
 */
// TODO: Database Trigger to automatically sync global menus to location when a new location is created

// TODO: UPDATE THIS
export async function SyncGlobalMenusToLocation (locationId: string) {
  if (!locationId) {
    return { error: 'Location ID is required' }
  }

  const supabase = createServerSupabaseClient()

  // Get the location's merchant
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('merchant_id')
    .eq('id', locationId)
    .single()

  if (locationError || !location) {
    console.error('Error getting location:', locationError)
    return { error: 'Location not found' }
  }

  // Get all global menus for this merchant
  const { data: globalMenus, error: menusError } = await supabase
    .from('menus')
    .select('id')
    .eq('merchant_id', location.merchant_id)
    .is('location_id', null)

  if (menusError) {
    console.error('Error getting global menus:', menusError)
    return { error: menusError.message }
  }

  if (!globalMenus?.length) {
    return { data: [], message: 'No global menus to sync' }
  }

  // Get existing location_menus records
  const { data: existingRecords, error: existingError } = await supabase
    .from('location_menus')
    .select('menu_id')
    .eq('location_id', locationId)

  if (existingError) {
    console.error('Error getting existing location menus:', existingError)
    return { error: existingError.message }
  }

  const existingMenuIds = new Set((existingRecords || []).map(r => r.menu_id))

  // Create records for menus that don't have one
  const newRecords = globalMenus
    .filter(menu => !existingMenuIds.has(menu.id))
    .map((menu, index) => ({
      location_id: locationId,
      menu_id: menu.id,
      is_active: true,
      display_order: index + 1
    }))

  if (!newRecords.length) {
    return { data: [], message: 'All menus already synced' }
  }

  const { data: created, error: createError } = await supabase
    .from('location_menus')
    .insert(newRecords)
    .select()

  if (createError) {
    console.error('Error creating location menus:', createError)
    return { error: createError.message }
  }

  return { data: created as LocationMenu[] }
}

/**
 * Sync a single global menu to all locations
 * Called when a new global menu is created
 */
// TODO: Database Trigger to automatically sync global menus to all locations when a new global menu is created
export async function SyncMenuToAllLocations (menuId: string) {
  if (!menuId) {
    return { error: 'Menu ID is required' }
  }

  const supabase = createServerSupabaseClient()

  // Get the menu and its merchant
  const { data: menu, error: menuError } = await supabase
    .from('menus')
    .select('merchant_id, location_id')
    .eq('id', menuId)
    .single()

  if (menuError || !menu) {
    console.error('Error getting menu:', menuError)
    return { error: 'Menu not found' }
  }

  // Only sync global menus (location_id is null)
  if (menu.location_id !== null) {
    return { data: [], message: 'Menu is location-specific, not synced' }
  }

  // Get all locations for this merchant that use global menu
  const { data: locations, error: locationsError } = await supabase
    .from('locations')
    .select('id')
    .eq('merchant_id', menu.merchant_id)
    .eq('uses_global_menu', true)

  if (locationsError) {
    console.error(
      '[SyncMenuToAllLocations] Error getting locations:',
      locationsError
    )
    return { error: locationsError.message }
  }

  if (!locations?.length) {
    return { data: [], message: 'No locations to sync' }
  }

  // Get existing records
  const { data: existingRecords, error: existingError } = await supabase
    .from('location_menus')
    .select('location_id')
    .eq('menu_id', menuId)

  if (existingError) {
    console.error('Error getting existing records:', existingError)
    return { error: existingError.message }
  }

  const existingLocationIds = new Set(
    (existingRecords || []).map(r => r.location_id)
  )

  // Create records for locations that don't have one
  const newRecords = locations
    .filter(loc => !existingLocationIds.has(loc.id))
    .map(loc => ({
      location_id: loc.id,
      menu_id: menuId,
      is_active: true
    }))

  if (!newRecords.length) {
    return { data: [], message: 'Menu already synced to all locations' }
  }

  const { data: created, error: createError } = await supabase
    .from('location_menus')
    .insert(newRecords)
    .select()

  if (createError) {
    console.error('Error creating location menus:', createError)
    return { error: createError.message }
  }

  return { data: created as LocationMenu[] }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Set whether a menu is active at a specific location
 */
export async function SetLocationMenuActive (
  locationId: string,
  menuId: string,
  isActive: boolean
) {
  if (!locationId || !menuId) {
    return { error: 'Location ID and Menu ID are required' }
  }

  const supabase = createServerSupabaseClient()
  const serviceRoleSupabase = createServiceRoleClient()

  // Check if record exists
  const { data: existing } = await supabase
    .from('location_menus')
    .select('id')
    .eq('location_id', locationId)
    .eq('menu_id', menuId)
    .single()

  if (existing) {
    // Update existing record
    const { data, error } = await supabase
      .from('location_menus')
      .update({ is_active: isActive })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating location menu:', error)
      return { error: error.message }
    }

    return { data: data as LocationMenu }
  } else {
    // Create new record
    const { data, error } = await supabase
      .from('location_menus')
      .insert({
        location_id: locationId,
        menu_id: menuId,
        is_active: isActive
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating location menu:', error)
      return { error: error.message }
    }

    return { data: data as LocationMenu }
  }
}

/**
 * Update display order for a menu at a location
 */
export async function UpdateLocationMenuOrder (
  locationId: string,
  menuId: string,
  displayOrder: number
) {
  if (!locationId || !menuId) {
    return { error: 'Location ID and Menu ID are required' }
  }

  const serviceRoleSupabase = createServiceRoleClient()

  const now = new Date().toISOString()

  const { data: existing, error: fetchError } = await serviceRoleSupabase
    .from('location_menus')
    .select('id')
    .eq('location_id', locationId)
    .eq('menu_id', menuId)
    .maybeSingle()

  if (fetchError) {
    console.error('Error fetching location menu order:', fetchError)
    return { error: fetchError.message }
  }

  const mutation = existing
    ? serviceRoleSupabase
        .from('location_menus')
        .update({
          display_order: displayOrder,
          updated_at: now
        })
        .eq('id', existing.id)
        .select()
        .single()
    : serviceRoleSupabase
        .from('location_menus')
        .insert({
          location_id: locationId,
          menu_id: menuId,
          display_order: displayOrder,
          updated_at: now
        })
        .select()
        .single()

  const { data, error } = await mutation

  if (error) {
    console.error('Error updating location menu order:', error)
    return { error: error.message }
  }

  return { data: data as LocationMenu }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Remove a location menu assignment
 * This effectively resets the menu to default behavior at this location
 */
export async function DeleteLocationMenu (locationId: string, menuId: string) {
  if (!locationId || !menuId) {
    return { error: 'Location ID and Menu ID are required' }
  }

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('location_menus')
    .delete()
    .eq('location_id', locationId)
    .eq('menu_id', menuId)

  if (error) {
    console.error('Error deleting location menu:', error)
    return { error: error.message }
  }

  return { success: true }
}
