'use server'

// ============================================================================
// Admin Stations Server Actions
// Description: CRUD operations for viewing/managing merchant stations from HQ
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assertHQPermission } from '@/lib/admin/auth'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

// ============================================================================
// Types (duplicated from dashboard/actions/stations.ts for server action compatibility)
// ============================================================================

export type StationType = 'register' | 'checkout' | 'kds' | 'self_service'
export type SyncRole = 'leader' | 'follower'
export type ViewScope = 'own' | 'location'

export interface Station {
  id: string
  merchant_id: string
  location_id: string
  station_name: string
  station_code: string | null
  station_type: StationType
  station_number: number | null
  device_id: string | null
  device_name: string | null
  hardware_model: string | null
  os_version: string | null
  app_version: string | null
  ip_address: string | null
  mac_address: string | null
  sync_role: SyncRole
  is_online: boolean
  last_heartbeat_at: string | null
  last_sync_at: string | null
  can_create_orders: boolean
  can_process_payments: boolean
  can_void_orders: boolean
  can_apply_discounts: boolean
  can_update_kitchen_status: boolean
  view_scope: ViewScope
  is_active: boolean
  deactivated_at: string | null
  deactivated_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateStationInput {
  location_id: string
  station_name: string
  station_code?: string | null
  station_type: StationType
  station_number?: number | null
  device_name?: string | null
  hardware_model?: string | null
  sync_role?: SyncRole
  view_scope?: ViewScope
  can_create_orders?: boolean
  can_process_payments?: boolean
  can_void_orders?: boolean
  can_apply_discounts?: boolean
  can_update_kitchen_status?: boolean
}

export interface UpdateStationInput {
  station_name?: string
  station_code?: string | null
  station_type?: StationType
  station_number?: number | null
  device_name?: string | null
  hardware_model?: string | null
  sync_role?: SyncRole
  view_scope?: ViewScope
  can_create_orders?: boolean
  can_process_payments?: boolean
  can_void_orders?: boolean
  can_apply_discounts?: boolean
  can_update_kitchen_status?: boolean
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all stations for a merchant (admin access)
 */
export async function getAdminMerchantStations(
  merchantId: string,
  locationId?: string | null
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('stations')
      .select(`
        *,
        locations:location_id (
          id,
          name
        )
      `)
      .eq('merchant_id', merchantId)
      .order('location_id')
      .order('station_number', { ascending: true, nullsFirst: false })

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getAdminMerchantStations] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Transform to include location_name
    const stationsWithLocation = (data || []).map((station) => ({
      ...station,
      location_name: station.locations?.name || 'Unknown Location',
    }))

    return { success: true, data: stationsWithLocation as (Station & { location_name: string })[], error: null }
  } catch (error) {
    console.error('[getAdminMerchantStations] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Get a specific station by ID (admin access)
 */
export async function getAdminStationById(stationId: string) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('stations')
      .select(`
        *,
        locations:location_id (
          id,
          name
        )
      `)
      .eq('id', stationId)
      .single()

    if (error) {
      console.error('[getAdminStationById] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    const stationWithLocation = {
      ...data,
      location_name: data.locations?.name || 'Unknown Location',
    }

    return { success: true, data: stationWithLocation as Station & { location_name: string }, error: null }
  } catch (error) {
    console.error('[getAdminStationById] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Get the next available station number for a location and type (admin access)
 */
export async function getAdminNextStationNumber(
  locationId: string,
  stationType: StationType
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('stations')
      .select('station_number')
      .eq('location_id', locationId)
      .eq('station_type', stationType)
      .not('station_number', 'is', null)
      .order('station_number', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[getAdminNextStationNumber] Error:', error)
      return { success: false, error: error.message, data: 1 }
    }

    const nextNumber =
      data && data.length > 0 && data[0].station_number
        ? data[0].station_number + 1
        : 1

    return { success: true, data: nextNumber, error: null }
  } catch (error) {
    console.error('[getAdminNextStationNumber] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: 1,
    }
  }
}

/**
 * Get station statistics for a merchant
 */
export async function getAdminMerchantStationStats(
  merchantId: string,
  locationId?: string | null
) {
  try {
    await assertHQPermission('hq.merchant.view')

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('stations')
      .select('id, is_online, is_active, station_type')
      .eq('merchant_id', merchantId)

    if (locationId && locationId !== 'all') {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getAdminMerchantStationStats] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    const stations = data || []
    const stats = {
      total: stations.length,
      active: stations.filter((s) => s.is_active).length,
      online: stations.filter((s) => s.is_online && s.is_active).length,
      offline: stations.filter((s) => !s.is_online && s.is_active).length,
      inactive: stations.filter((s) => !s.is_active).length,
      byType: {
        register: stations.filter((s) => s.station_type === 'register').length,
        checkout: stations.filter((s) => s.station_type === 'checkout').length,
        kds: stations.filter((s) => s.station_type === 'kds').length,
        self_service: stations.filter((s) => s.station_type === 'self_service').length,
      },
    }

    return { success: true, data: stats, error: null }
  } catch (error) {
    console.error('[getAdminMerchantStationStats] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// CREATE Operations
// ============================================================================

/**
 * Create a new station for a merchant (admin access)
 */
export async function adminCreateStation(
  merchantId: string,
  input: CreateStationInput
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Validate station_number uniqueness at location level if provided
    if (input.station_number) {
      const { data: existingStation } = await supabase
        .from('stations')
        .select('id')
        .eq('location_id', input.location_id)
        .eq('station_number', input.station_number)
        .single()

      if (existingStation) {
        return {
          success: false,
          error: `Station number ${input.station_number} already exists at this location`,
          data: null,
        }
      }
    }

    // Validate station_code uniqueness at location level if provided
    if (input.station_code) {
      const { data: existingCode } = await supabase
        .from('stations')
        .select('id')
        .eq('location_id', input.location_id)
        .eq('station_code', input.station_code)
        .single()

      if (existingCode) {
        return {
          success: false,
          error: `Station code "${input.station_code}" already exists at this location`,
          data: null,
        }
      }
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('stations')
      .insert({
        merchant_id: merchantId,
        location_id: input.location_id,
        station_name: input.station_name,
        station_code: input.station_code || null,
        station_type: input.station_type,
        station_number: input.station_number || null,
        device_name: input.device_name || null,
        hardware_model: input.hardware_model || null,
        sync_role: input.sync_role || 'follower',
        view_scope: input.view_scope || 'own',
        is_online: false,
        can_create_orders: input.can_create_orders ?? true,
        can_process_payments: input.can_process_payments ?? false,
        can_void_orders: input.can_void_orders ?? false,
        can_apply_discounts: input.can_apply_discounts ?? true,
        can_update_kitchen_status: input.can_update_kitchen_status ?? false,
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error('[adminCreateStation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Fetch location name for audit log
    const { data: location } = await supabase
      .from('locations')
      .select('name')
      .eq('id', input.location_id)
      .single()

    // Log audit event
    await LogAuditEvent({
      merchantId: merchantId,
      action: `HQ Admin Created Station: ${input.station_name}`,
      actionCategory: 'settings',
      resourceType: 'station',
      resourceId: data.id,
      resourceName: input.station_name,
      locationId: input.location_id,
      metadata: {
        location_name: location?.name,
        station_type: input.station_type,
        station_number: input.station_number,
        created_by_admin: userId,
      },
    })

    return { success: true, data: data as Station, error: null }
  } catch (error) {
    console.error('[adminCreateStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// UPDATE Operations
// ============================================================================

/**
 * Update a station (admin access)
 */
export async function adminUpdateStation(
  stationId: string,
  input: UpdateStationInput
) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Get current station to check location
    const { data: currentStation, error: fetchError } = await supabase
      .from('stations')
      .select('location_id, station_number, station_code, merchant_id')
      .eq('id', stationId)
      .single()

    if (fetchError || !currentStation) {
      console.error('[adminUpdateStation] Error fetching station:', fetchError)
      return { success: false, error: 'Station not found', data: null }
    }

    // Validate station_number uniqueness if being changed
    if (
      input.station_number !== undefined &&
      input.station_number !== currentStation.station_number
    ) {
      const { data: existingStation } = await supabase
        .from('stations')
        .select('id')
        .eq('location_id', currentStation.location_id)
        .eq('station_number', input.station_number)
        .neq('id', stationId)
        .single()

      if (existingStation) {
        return {
          success: false,
          error: `Station number ${input.station_number} already exists at this location`,
          data: null,
        }
      }
    }

    // Validate station_code uniqueness if being changed
    if (
      input.station_code !== undefined &&
      input.station_code !== currentStation.station_code &&
      input.station_code
    ) {
      const { data: existingCode } = await supabase
        .from('stations')
        .select('id')
        .eq('location_id', currentStation.location_id)
        .eq('station_code', input.station_code)
        .neq('id', stationId)
        .single()

      if (existingCode) {
        return {
          success: false,
          error: `Station code "${input.station_code}" already exists at this location`,
          data: null,
        }
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.station_name !== undefined) updateData.station_name = input.station_name
    if (input.station_code !== undefined) updateData.station_code = input.station_code || null
    if (input.station_type !== undefined) updateData.station_type = input.station_type
    if (input.station_number !== undefined) updateData.station_number = input.station_number
    if (input.device_name !== undefined) updateData.device_name = input.device_name || null
    if (input.hardware_model !== undefined) updateData.hardware_model = input.hardware_model || null
    if (input.sync_role !== undefined) updateData.sync_role = input.sync_role
    if (input.view_scope !== undefined) updateData.view_scope = input.view_scope
    if (input.can_create_orders !== undefined) updateData.can_create_orders = input.can_create_orders
    if (input.can_process_payments !== undefined) updateData.can_process_payments = input.can_process_payments
    if (input.can_void_orders !== undefined) updateData.can_void_orders = input.can_void_orders
    if (input.can_apply_discounts !== undefined) updateData.can_apply_discounts = input.can_apply_discounts
    if (input.can_update_kitchen_status !== undefined) updateData.can_update_kitchen_status = input.can_update_kitchen_status

    const { data, error } = await supabase
      .from('stations')
      .update(updateData)
      .eq('id', stationId)
      .select()
      .single()

    if (error) {
      console.error('[adminUpdateStation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: data.merchant_id,
      action: `HQ Admin Updated Station: ${data.station_name}`,
      actionCategory: 'settings',
      resourceType: 'station',
      resourceId: stationId,
      resourceName: data.station_name,
      locationId: data.location_id,
      changes: { after: input as Record<string, unknown> },
      metadata: { updated_by_admin: userId },
    })

    return { success: true, data: data as Station, error: null }
  } catch (error) {
    console.error('[adminUpdateStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Deactivate a station (admin access)
 */
export async function adminDeactivateStation(stationId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('stations')
      .update({
        is_active: false,
        deactivated_at: now,
        deactivated_by: `HQ Admin: ${userId}`,
        updated_at: now,
      })
      .eq('id', stationId)
      .select()
      .single()

    if (error) {
      console.error('[adminDeactivateStation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: data.merchant_id,
      action: `HQ Admin Deactivated Station: ${data.station_name}`,
      actionCategory: 'settings',
      resourceType: 'station',
      resourceId: stationId,
      resourceName: data.station_name,
      locationId: data.location_id,
      metadata: { deactivated_by_admin: userId },
    })

    return { success: true, data: data as Station, error: null }
  } catch (error) {
    console.error('[adminDeactivateStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

/**
 * Reactivate a station (admin access)
 */
export async function adminReactivateStation(stationId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('stations')
      .update({
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stationId)
      .select()
      .single()

    if (error) {
      console.error('[adminReactivateStation] Error:', error)
      return { success: false, error: error.message, data: null }
    }

    // Log audit event
    await LogAuditEvent({
      merchantId: data.merchant_id,
      action: `HQ Admin Reactivated Station: ${data.station_name}`,
      actionCategory: 'settings',
      resourceType: 'station',
      resourceId: stationId,
      resourceName: data.station_name,
      locationId: data.location_id,
      metadata: { reactivated_by_admin: userId },
    })

    return { success: true, data: data as Station, error: null }
  } catch (error) {
    console.error('[adminReactivateStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// ============================================================================
// DELETE Operations
// ============================================================================

/**
 * Permanently delete a station (admin access)
 */
export async function adminDeleteStation(stationId: string) {
  try {
    const { userId } = await assertHQPermission('hq.merchant.update')

    const supabase = createServerSupabaseClient()

    // Fetch station details before deletion for audit log
    const { data: stationToDelete } = await supabase
      .from('stations')
      .select('station_name, merchant_id, location_id')
      .eq('id', stationId)
      .single()

    const { error } = await supabase
      .from('stations')
      .delete()
      .eq('id', stationId)

    if (error) {
      console.error('[adminDeleteStation] Error:', error)
      return { success: false, error: error.message }
    }

    // Log audit event
    if (stationToDelete) {
      await LogAuditEvent({
        merchantId: stationToDelete.merchant_id,
        action: `HQ Admin Deleted Station: ${stationToDelete.station_name}`,
        actionCategory: 'settings',
        resourceType: 'station',
        resourceId: stationId,
        resourceName: stationToDelete.station_name,
        locationId: stationToDelete.location_id,
        metadata: { deleted_by_admin: userId },
      })
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('[adminDeleteStation] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
